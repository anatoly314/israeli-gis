import { describe, expect, it } from 'vitest';
import type { ChoroplethLayer, Manifest } from '../src/manifest.ts';
import { groupLayers } from '../src/manifest.ts';
import { joinLayer, labelPoint } from '../src/data.ts';
import { layer, manifest } from './fixtures.ts';

/** Ray casting point-in-ring. */
function inside([x, y]: number[], ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('layer grouping', () => {
  it('groups the shipped layers under one dataset, titled by the shared prefix, items by level', () => {
    const groups = groupLayers(manifest());
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toEqual({ he: 'מדד חברתי-כלכלי 2021', en: 'Socio-economic index 2021', ru: 'Социально-экономический индекс 2021' });
    expect(groups[0].items.map((i) => i.label.en)).toEqual(['Local authorities', 'Localities in regional councils', 'Statistical areas']);
  });

  it('adds a group per new dataset, in manifest order, with nothing hard-coded', () => {
    const m = manifest();
    const base = m.layers[0] as ChoroplethLayer;
    const crime: ChoroplethLayer = {
      ...base,
      id: 'crime-2024',
      dataset: 'crime-2024',
      title: { he: 'פשיעה 2024', en: 'Crime 2024', ru: 'Преступность 2024' },
      level: 'localities-2011',
    };
    const extended: Manifest = { ...m, layers: [crime, ...m.layers] };
    const groups = groupLayers(extended);
    expect(groups.map((g) => g.dataset)).toEqual(['crime-2024', 'ses-2021']);
    expect(groups[0].title.en).toBe('Crime 2024');
    expect(groups[0].items[0].label.en).toBe('Localities');
  });
});

describe('join', () => {
  it('copies values and the class key onto polygons and placeholder markers; no record means "na"', () => {
    const { layer: l, data, values } = layer('ses-2021-localities');
    const joined = joinLayer(data, values, l);
    const byCode = new Map(joined.polygons.features.map((f) => [f.properties.code, f.properties]));
    expect(byCode.get('128')).toMatchObject({ cluster: 9, rank: 952, _k: '9' });
    expect(joined.polygons.features.filter((f) => f.properties._k === 'na')).toHaveLength(78);
    expect(joined.markers.features).toHaveLength(114);
    expect(joined.markers.features.every((f) => f.properties._k === byCode.get(f.properties.code)!._k)).toBe(true);
    expect(joined.labels.features).toHaveLength(joined.polygons.features.length);
    // The source level is not modified.
    expect('cluster' in data.polygons.features[0].properties).toBe(false);
  });

  it('anchors labels inside the shape', () => {
    // A U shape: the centroid falls in the notch, the label must not.
    const ring = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
    const p = labelPoint({ type: 'Polygon', coordinates: [ring] });
    expect(inside(p, ring)).toBe(true);
    // And for real shapes: every authority's label point lies inside its polygon.
    const { data } = layer('ses-2021-local-authorities');
    for (const f of data.polygons.features) {
      if (f.properties.placeholder) continue;
      const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const anchor = data.features.get(f.properties.code)!.anchor;
      expect(parts.some((rings) => inside(anchor, rings[0]) && !rings.slice(1).some((h) => inside(anchor, h))), f.properties.code).toBe(true);
    }
  });

  it('frames placeholder features by their marker points', () => {
    const { data } = layer('ses-2021-localities');
    const efrat = data.features.get('3650') ?? [...data.features.values()].find((f) => f.props.placeholder)!;
    expect(efrat.props.placeholder).toBe(true);
    expect(efrat.bbox[0]).toBe(efrat.anchor[0]);
  });
});
