import { describe, expect, inject, it } from 'vitest';
import { LANGS, PointsData, validateManifest, type Manifest, type PointsLayer } from '../pipeline/lib/contract.ts';
import { distanceM } from '../pipeline/lib/gdal.ts';
import { OKABE_ITO } from '../pipeline/lib/palettes.ts';
import { DATA, NO_LOCALITY_POLYGON, STAGE_COLORS, STREAM_COLORS } from '../pipeline/datasets/schools-2026/index.ts';
import { stageOf, streamOf } from '../pipeline/datasets/schools-2026/parse.ts';
import { missingCountForms } from '../pipeline/run.ts';
import { datasetTerms } from '../pipeline/terminology.ts';
import { contrast, textOn } from '../viewer/src/classify.ts';
import { manifest, readBuilt } from './dist.ts';

const ID = 'schools-2026';
const points = () => readBuilt<PointsData>(DATA);
const byCode = () => new Map(points().features.map((f) => [f.properties.code, f]));
const layer = (id: string) => manifest().layers.find((l) => l.id === id) as PointsLayer;

describe('schools: the points file', () => {
  it('has all 6,641 schools (SHLAV_CHINUH 1–7), unique codes in code order, valid against PointsData', () => {
    const fc = PointsData.parse(points());
    expect(fc.features).toHaveLength(6641);
    const codes = fc.features.map((f) => Number(f.properties.code));
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
    for (const f of fc.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon > 34.2 && lon < 35.95 && lat > 29.4 && lat < 33.4, f.properties.code).toBe(true);
      expect(Math.round(lon * 1e5) / 1e5).toBe(lon);
      expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
    }
    expect(inject('buildReport').notes.join()).toMatch(/6641 school rows .* 0 duplicate codes dropped, 0 without usable coordinates dropped; 6641 points/);
  });

  it('reprojects with the polygons\' datum shift (school 110023 vs pyproj on its ITM 219040.162 / 633692.348)', () => {
    const f = byCode().get('110023')!;
    expect(distanceM(f.geometry.coordinates as [number, number], [35.200046, 31.795953])).toBeLessThan(1);
  });

  it.each([
    // Beit Yaakov Matersdorf, Jerusalem: Haredi, primary, recognised unofficial, girls
    ['110023', { code: '110023', name_he: 'בית יעקב מטרסדורף', locality_code: '3000', stream: 3, stage: 1, status: 2, gender: 2 }],
    // Boyar, Jerusalem: SHLAV 6 (primary + upper) → all-through
    ['140103', { code: '140103', name_he: 'תיכון ע"ש בויאר', locality_code: '3000', stream: 1, stage: 4, status: 2, gender: 3 }],
    // Talmud Torah Beit Asher: exempt institution
    ['113142', { code: '113142', name_he: 'ת"ת בית אשר', locality_code: '3000', stream: 3, stage: 1, status: 4, gender: 1 }],
    // Special-education school placed at its locality centre, in Neria (no polygon yet)
    ['100008', { code: '100008', name_he: 'חנמ תבור', locality_code: '3890', stream: 2, stage: 4, status: 1, gender: 1, special: 1, approx: 1 }],
    // Amal Rahat: Arab/Bedouin stream
    ['519314', { code: '519314', name_he: 'מח"ט עמל רהט', locality_code: '1161', stream: 4, stage: 3, status: 2, gender: 3 }],
  ])('school %s', (code, expected) => {
    expect(byCode().get(code)?.properties).toEqual(expected);
  });

  it('counts streams, levels and the optional flags as in the source', () => {
    const count = (k: string) => {
      const o: Record<string, number> = {};
      for (const f of points().features) {
        const v = String(f.properties[k] ?? '-');
        o[v] = (o[v] ?? 0) + 1;
      }
      return o;
    };
    expect(count('stream')).toEqual({ 1: 2381, 2: 927, 3: 2088, 4: 1130, 5: 115 });
    expect(count('stage')).toEqual({ 1: 3369, 2: 148, 3: 2267, 4: 857 });
    expect(count('gender')).toEqual({ 1: 1472, 2: 884, 3: 3802, '-': 483 });
    expect(count('special')).toEqual({ 1: 811, '-': 5830 });
    expect(count('approx')).toEqual({ 1: 309, '-': 6332 });
  });

  it('maps sector × supervision and SHLAV_CHINUH as documented, and refuses unknown codes', () => {
    expect([streamOf('יהודי', 'ממלכתי'), streamOf('יהודי', 'ממלכתי דתי'), streamOf('יהודי', 'חרדי'), streamOf('ערבי', 'ממלכתי'), streamOf('בדואי', 'ממלכתי'), streamOf('דרוזי', 'ממלכתי'), streamOf('צרקסי', 'ממלכתי')]).toEqual([1, 2, 3, 4, 4, 5, 5]);
    expect(['1', '3', '4', '2', '5', '6', '7'].map(stageOf)).toEqual([1, 2, 3, 3, 4, 4, 4]);
    expect(() => stageOf('0')).toThrow();
    expect(() => streamOf('אחר', 'ממלכתי')).toThrow();
  });
});

describe('schools: join to localities-2011', () => {
  it('finds a polygon for 6,609 of 6,641 schools; the 32 others sit in 11 documented localities', () => {
    const j = inject('buildReport').joins.find((r) => r.label === 'schools: locality codes')!;
    expect([j.matched, j.rows]).toEqual([6609, 6641]);
    expect([...new Set(j.unmatched)].sort()).toEqual(Object.keys(NO_LOCALITY_POLYGON).sort());
  });
});

describe('schools: manifest', () => {
  it('ships two points layers on one data file, titled dataset – measure, with a locality parent', () => {
    const m = manifest();
    expect(m.datasets[ID].measures?.map((x) => x.id)).toEqual(['stream', 'stage']);
    for (const [id, valueField, title] of [
      ['schools-2026-stream', 'stream', 'Schools 2026 – Education stream'],
      ['schools-2026-stage', 'stage', 'Schools 2026 – School level'],
    ] as const) {
      const l = layer(id);
      expect([l.kind, l.data, l.valueField, l.title.en]).toEqual(['points', DATA, valueField, title]);
      expect(l.featureType).toEqual({ he: 'בית ספר', en: 'School', ru: 'Школа' });
      expect(l.countForms).toEqual(datasetTerms(ID).countForms);
      expect(missingCountForms(l.countForms!)).toEqual([]);
      expect(l.countForms?.ru).toMatchObject({ one: '{n} школа', few: '{n} школы', many: '{n} школ' });
      expect(l.parent).toEqual({ level: 'localities-2011', property: 'locality_code' });
      expect(l.popup.map((p) => [p.field, p.format.type])).toEqual([
        ['stream', 'category'],
        ['stage', 'category'],
        ['status', 'category'],
        ['gender', 'category'],
        ['special', 'category'],
        ['approx', 'category'],
      ]);
    }
  });

  it('colours stream and level with Okabe-Ito, consistent with the other datasets, legible', () => {
    const stream = layer('schools-2026-stream').classification;
    expect(stream).toMatchObject({ type: 'categorical', ordered: false });
    if (stream.type !== 'categorical') return;
    expect(stream.classes.map((c) => [c.value, c.color, c.label.en])).toEqual([
      [1, OKABE_ITO.blue, 'State'],
      [2, OKABE_ITO.bluishGreen, 'State-religious'],
      [3, OKABE_ITO.reddishPurple, 'Haredi'],
      [4, OKABE_ITO.orange, 'Arab and Bedouin'],
      [5, OKABE_ITO.vermillion, 'Druze and Circassian'],
    ]);
    for (const c of [...Object.values(STREAM_COLORS), ...Object.values(STAGE_COLORS)]) expect(contrast(c, textOn(c)), c).toBeGreaterThanOrEqual(4.5);
  });

  it('has its wording in he/en/ru, with natural Russian', () => {
    const t = datasetTerms(ID);
    expect(t.title).toEqual({ he: 'בתי ספר 2026', en: 'Schools 2026', ru: 'Школы 2026' });
    for (const m of Object.values(t.measures!)) {
      for (const lang of LANGS) expect(m.title[lang].trim()).not.toBe('');
      for (const label of Object.values(m.classes!)) for (const lang of LANGS) expect(label[lang].trim()).not.toBe('');
    }
    for (const labels of Object.values(t.popupClasses!)) for (const label of Object.values(labels)) for (const lang of LANGS) expect(label[lang].trim()).not.toBe('');
    expect(t.measures?.stream.classes?.[3].ru).toBe('Харедимные (ультраортодоксальные)');
    expect(t.measures?.stream.title.ru).toBe('Тип школы');
    expect(t.measures?.stage.classes?.[4]).toMatchObject({ en: 'Primary through secondary', ru: 'Многоступенчатая (с 1 класса)' });
    expect(t.popupClasses?.status[4]).toMatchObject({ en: 'Exempt (Compulsory Education Law)', ru: 'Освобождённая (закон об обязательном образовании)' });
    expect(t.popupClasses?.status[3].ru).toBe('Уникально-культурная');
  });

  it('rejects a points layer without featureType, and a points file with duplicate codes', () => {
    const m = structuredClone(manifest()) as Manifest;
    const i = m.layers.findIndex((l) => l.id === 'schools-2026-stream');
    delete (m.layers[i] as Partial<PointsLayer>).featureType;
    expect(validateManifest(m).join()).toMatch(/featureType/);
    const fc = structuredClone(points());
    fc.features.push(fc.features[0]);
    expect(PointsData.safeParse(fc).success).toBe(false);
  });
});
