import { describe, expect, it } from 'vitest';
import { palette10 } from '../pipeline/lib/palettes.ts';
import { Classification, LEVEL_IDS, validateManifest, type ChoroplethLayer, type Manifest, type PointsLayer } from '../pipeline/lib/contract.ts';
import { manifest, readBuilt } from './dist.ts';

describe('layers.json', () => {
  it('validates against the contract', () => {
    expect(validateManifest(manifest())).toEqual([]);
  });

  it('ships a JSON Schema derived from the same contract', () => {
    const schema = readBuilt<{ $schema: string; properties: Record<string, unknown> }>('layers.schema.json');
    expect(schema.$schema).toMatch(/json-schema/);
    expect(Object.keys(schema.properties).sort()).toEqual(['attribution', 'datasets', 'layers', 'levels', 'sources', 'version']);
  });

  it('describes the three SES 2021 choropleths with a "not calculated" state', () => {
    const m = manifest();
    expect(Object.keys(m.levels).sort()).toEqual([...LEVEL_IDS].sort());
    const ses = m.layers.filter((l) => l.dataset === 'ses-2021');
    expect(ses.map((l) => [l.id, (l as ChoroplethLayer).level])).toEqual([
      ['ses-2021-local-authorities', 'local-authorities-2011'],
      ['ses-2021-localities', 'rc-localities-2011'],
      ['ses-2021-statistical-areas', 'statistical-areas-2011'],
    ]);
    expect([...new Set(m.layers.map((l) => l.dataset))]).toEqual(['ses-2021', 'peripherality-2020', 'population-2024', 'census-2022', 'schools-2026']);
    for (const l of ses) {
      expect(l.kind).toBe('choropleth');
      expect(l.valueField).toBe('cluster');
      expect(l.classification.type).toBe('categorical');
      if (l.classification.type === 'categorical') expect(l.classification.classes.map((c) => c.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(l.classification.missing.label.en).toBe('Not calculated');
      expect(l.popup.map((p) => p.field)).toEqual(['cluster', 'index', 'rank', 'population']);
    }
  });

  it('colours the SES clusters with ColorBrewer RdYlBu, red (1) → blue (10)', () => {
    const rdylbu = ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'];
    expect(palette10('RdYlBu')).toEqual(rdylbu);
    for (const l of manifest().layers.filter((x) => x.dataset === 'ses-2021')) {
      if (l.classification.type === 'categorical') expect(l.classification.classes.map((c) => c.color)).toEqual(rdylbu);
    }
  });

  it('rejects malformed manifests', () => {
    const broken = structuredClone(manifest()) as unknown as Record<string, any>;
    broken.layers[0].kind = 'heatmap';
    delete broken.layers[1].title.ru;
    broken.layers[2].classification.classes[0].color = 'red';
    delete broken.levels['localities-2011'];
    const errors = validateManifest(broken).join('\n');
    expect(errors).toMatch(/^layers\.0\.kind:/m);
    expect(errors).toMatch(/^layers\.1\.title\.ru:/m);
    expect(errors).toMatch(/^layers\.2\.classification/m);
    expect(errors).toMatch(/^levels\.localities-2011:/m);
  });

  it('can express a points layer with stepped classification', () => {
    const { level: _level, ...base } = manifest().layers[0] as ChoroplethLayer;
    const points: PointsLayer = {
      ...base,
      id: 'schools-2025',
      dataset: 'schools-2025',
      kind: 'points',
      data: 'datasets/schools-2025/points.geojson',
      featureType: { he: 'בית ספר', en: 'School', ru: 'Школа' },
      classification: { type: 'stepped', breaks: [10, 20], colors: ['#000000', '#777777', '#ffffff'], missing: base.classification.missing },
    };
    const m: Manifest = { ...manifest(), layers: [points] };
    expect(validateManifest(m).join()).toMatch(/datasets entry/);
    m.datasets['schools-2025'] = { title: { he: 'בתי ספר', en: 'Schools', ru: 'Школы' } };
    expect(validateManifest(m)).toEqual([]);
  });

  it('checks stepped breaks and colours', () => {
    const missing = manifest().layers[0].classification.missing;
    const ok = (breaks: number[], colors: string[]) => Classification.safeParse({ type: 'stepped', breaks, colors, missing }).success;
    expect(ok([1, 2], ['#000000', '#111111', '#222222'])).toBe(true);
    expect(ok([1, 2], ['#000000', '#111111'])).toBe(false);
    expect(ok([2, 1], ['#000000', '#111111', '#222222'])).toBe(false);
  });
});
