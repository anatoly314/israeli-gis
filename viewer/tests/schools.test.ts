import { describe, expect, it } from 'vitest';
import { CLASS_PROP } from '../src/classify.ts';
import { colocated, joinLayer } from '../src/data.ts';
import { describeLayer, groupLayers, sourceKeyOf } from '../src/manifest.ts';
import { pointsPopupHtml } from '../src/popup.ts';
import { buildEntries, search } from '../src/search.ts';
import { layer, manifest, pointsLayer } from './fixtures.ts';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[⁦⁩]/g, '').replace(/\s+/g, ' ').trim();

describe('schools 2026 (points)', () => {
  const stream = pointsLayer('schools-2026-stream');
  const stage = pointsLayer('schools-2026-stage');

  it('decodes every school as a point with its values in its properties', () => {
    expect(stream.data.features.size).toBe(6641);
    expect(stream.data.polygons.features).toHaveLength(0);
    const joined = joinLayer(stream.data, {}, stream.layer);
    const keys = new Set(joined.markers.features.map((f) => f.properties[CLASS_PROP]));
    // Every school has a stream: no "not calculated" point.
    expect([...keys].sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('groups schools sharing exact coordinates (campuses), every member keyed to the whole group', () => {
    const spots = colocated(stream.data);
    const groups = new Set(spots.values());
    expect(groups.size).toBe(439);
    expect(spots.size).toBe(1049);
    expect(Math.max(...[...groups].map((g) => g.length))).toBe(15);
    const [a, b] = spots.get('110312')!;
    expect([a, b].sort()).toEqual(['110312', '645424']);
    expect(spots.get('645424')).toBe(spots.get('110312'));
    expect(spots.has('110023')).toBe(false);
  });

  it('shares one source key between the two measures, so search indexes the schools once', () => {
    expect(sourceKeyOf(stream.layer)).toBe(sourceKeyOf(stage.layer));
    expect(sourceKeyOf(stream.layer)).toBe('points:datasets/schools-2026/schools.geojson');
  });

  it('names the layer by its measure, with no level, in the switcher and the sheet', () => {
    const m = manifest();
    const d = describeLayer(m, stream.layer);
    expect(d.measure?.en).toBe('Education stream');
    expect(d.level).toBeUndefined();
    const g = groupLayers(m).find((x) => x.dataset === 'schools-2026')!;
    expect(g.measures!.map((x) => x.id)).toEqual(['stream', 'stage']);
    expect(g.items[0].label.en).toBe('School');
  });

  it('popup: one school as a table, a campus as a list with the picked school first', () => {
    const joined = joinLayer(stream.data, {}, stream.layer);
    const byCode = new Map(joined.markers.features.map((f) => [f.properties.code, f.properties]));
    const one = text(pointsPopupHtml(stream.layer, [byCode.get('110023')!], 'en', 'Jerusalem'));
    expect(one).toContain('בית יעקב מטרסדורף');
    expect(one).toContain('School · Jerusalem');
    expect(one).toContain('Education stream Haredi');
    expect(one).toContain('Students Girls');

    // Both are state schools, official and mixed: said once under the title; each item keeps its own stage.
    const campus = pointsPopupHtml(stream.layer, [byCode.get('110312')!, byCode.get('645424')!], 'ru', 'Иерусалим');
    expect(text(campus)).toBe(
      '2 школы в этом месте Школа · Иерусалим Государственные Официальная (государственная) · Смешанная ' +
        'ארגנטינה Начальная ניסוי ארגנטינה Старшая (включая 7–12 классы)',
    );
    expect((campus.match(/<li>/g) ?? []).length).toBe(2);
    // On the stage layer the shared stream becomes plain text and each item shows its stage swatch.
    const stageProps = new Map(joinLayer(stage.data, {}, stage.layer).markers.features.map((f) => [f.properties.code, f.properties]));
    const onStage = text(pointsPopupHtml(stage.layer, [stageProps.get('110312')!, stageProps.get('645424')!], 'en'));
    expect(onStage).toBe('2 schools at this location School State · Official (state-run) · Mixed ארגנטינה Primary ניסוי ארגנטינה High school (incl. grades 7–12)');
    // Special education and the approximate location appear where they apply, and only there.
    const approx = [...byCode.values()].find((p) => p.approx === 1 && p.special === 1)!;
    const line = text(pointsPopupHtml(stream.layer, [approx, byCode.get('110023')!], 'en'));
    expect(line).toContain('Special education');
    expect(line).toContain('Approximate: locality centre');
    expect(line.match(/Approximate/g)).toHaveLength(1);
  });

  it('counts the campus with the layer\'s plural phrases ("15 школ"), or just the number without them', () => {
    const joined = joinLayer(stream.data, {}, stream.layer);
    const spots = colocated(stream.data);
    const big = [...new Set(spots.values())].find((g) => g.length === 15)!;
    const byCode = new Map(joined.markers.features.map((f) => [f.properties.code, f.properties]));
    const title = (l: typeof stream.layer, codes: string[], lang: 'he' | 'en' | 'ru') =>
      text(pointsPopupHtml(l, codes.map((c) => byCode.get(c)!), lang)).split(` ${l.featureType[lang]}`)[0];
    expect(stream.layer.countForms).toBeDefined();
    expect(title(stream.layer, big, 'ru')).toBe('15 школ в этом месте');
    expect(title(stream.layer, big.slice(0, 3), 'ru')).toBe('3 школы в этом месте');
    expect(title(stream.layer, big.slice(0, 2), 'ru')).toBe('2 школы в этом месте');
    expect(title(stream.layer, big, 'en')).toBe('15 schools at this location');
    expect(title(stream.layer, big.slice(0, 2), 'en')).toBe('2 schools at this location');
    expect(title(stream.layer, big, 'he')).toBe('15 בתי ספר באותו מיקום');
    expect(title(stream.layer, big.slice(0, 2), 'he')).toBe('2 בתי ספר באותו מיקום');
    const { countForms: _, ...plain } = stream.layer;
    expect(title(plain, big, 'en')).toBe('15 at this location');
    expect(title(plain, big, 'he')).toBe('15 מוסדות באותו מיקום');
  });

  it('has no "not calculated" school, so the legend can leave that row out; a choropleth with gaps keeps it', () => {
    expect(joinLayer(stream.data, {}, stream.layer).missing).toBe(0);
    expect(joinLayer(stage.data, {}, stage.layer).missing).toBe(0);
    const aged = layer('census-2022-aged-65-localities');
    expect(joinLayer(aged.data, aged.values, aged.layer).missing).toBeGreaterThan(0);
  });

  it('search finds a school by its Hebrew name, after places of the same name', () => {
    const entries = buildEntries(sourceKeyOf(stream.layer), undefined, stream.data);
    expect(entries).toHaveLength(6641);
    const [first] = search(entries, 'בית יעקב מטרסדורף');
    expect([first.code, first.names.en]).toEqual(['110023', 'בית יעקב מטרסדורף']);
  });
});
