import { describe, expect, inject, it } from 'vitest';
import { LANGS, type ChoroplethLayer } from '../pipeline/lib/contract.ts';
import { palette10 } from '../pipeline/lib/palettes.ts';
import { DATASET_TERMS, datasetTerms } from '../pipeline/terminology.ts';
// The viewer's own legend-text rule, so the check is the one users get.
import { contrast, textOn } from '../viewer/src/classify.ts';
import { dataset, levelCodes, manifest } from './dist.ts';

const ID = 'peripherality-2020';
const layer = (id: string) => manifest().layers.find((l) => l.id === id) as ChoroplethLayer;

describe('peripherality 2020: joins', () => {
  it('matches 255/255 authorities (201 municipalities/local councils + 54 regional councils)', () => {
    const j = inject('buildReport').joins.find((r) => r.label === 'peripherality: local authorities')!;
    expect([j.matched, j.rows, j.unmatched, j.geometryWithoutData]).toEqual([255, 255, [], 2]);
    expect(j.breakdown.map((b) => [b.matched, b.rows])).toEqual([
      [201, 201],
      [54, 54],
    ]);
  });

  it('matches 1213/1213 localities on localities-2011, cities included', () => {
    const j = inject('buildReport').joins.find((r) => r.label === 'peripherality: localities')!;
    expect([j.level, j.matched, j.rows, j.unmatched, j.geometryWithoutData]).toEqual(['localities-2011', 1213, 1213, [], 70]);
    const codes = levelCodes('localities-2011');
    for (const c of ['5000', '2600', '2800', '831']) expect(codes.has(c)).toBe(true);
  });
});

describe('peripherality 2020: values equal the raw CBS rows', () => {
  // Hand-copied from 24_22_420t1.xlsx (authorities) and 24_22_420t2.xlsx (localities); index rounded to 4 decimals,
  // distance to 1 decimal.
  it.each([
    ['5000', { cluster: 10, index: 4.1901, rank: 254, population: 463808 }], // Tel Aviv-Yafo
    ['2600', { cluster: 1, index: -2.4839, rank: 1, population: 52519 }], // Eilat
    ['2800', { cluster: 1, index: -1.262, rank: 11, population: 22363 }], // Kiryat Shmona
    ['831', { cluster: 2, index: -1.0246, rank: 20, population: 10773 }], // Yeruham
    ['5553', { cluster: 1, index: -2.4131, rank: 2, population: 4270 }], // Hevel Elot RC (status 53)
  ])('authority %s', (code, expected) => {
    expect(dataset(`datasets/${ID}/local-authorities-2011.json`)[code]).toEqual(expected);
  });

  it.each([
    ['5000', { cluster: 10, index: 4.1901, rank: 1212, distance_km: 0, population: 463808 }], // Tel Aviv-Yafo
    ['2600', { cluster: 1, index: -2.4839, rank: 3, distance_km: 323, population: 52519 }], // Eilat
    ['2800', { cluster: 1, index: -1.262, rank: 71, distance_km: 163.3, population: 22363 }], // Kiryat Shmona
    ['831', { cluster: 2, index: -1.0246, rank: 122, distance_km: 126.3, population: 10773 }], // Yeruham
    ['452', { cluster: 4, index: -0.2652, rank: 521, distance_km: 79.4, population: 552 }], // kibbutz Yizre'el
    ['2710', { cluster: 5, index: 0.1747, rank: 779, distance_km: 60.6, population: 56777 }], // Umm al-Fahm
    ['1161', { cluster: 4, index: -0.1392, rank: 586, distance_km: 76.7, population: 73768 }], // Rahat
  ])('locality %s', (code, expected) => {
    expect(dataset(`datasets/${ID}/localities-2011.json`)[code]).toEqual(expected);
  });
});

describe('peripherality 2020: manifest', () => {
  it('ships two layers with unique titles from dataset title + level title', () => {
    const m = manifest();
    const layers = m.layers.filter((l) => l.dataset === ID) as ChoroplethLayer[];
    expect(layers.map((l) => [l.id, l.level])).toEqual([
      ['peripherality-2020-local-authorities', 'local-authorities-2011'],
      ['peripherality-2020-localities', 'localities-2011'],
    ]);
    expect(m.datasets[ID].title).toEqual({ he: 'מדד פריפריאליות 2020', en: 'Peripherality index 2020', ru: 'Индекс периферийности 2020' });
    expect(layers.map((l) => l.title.en)).toEqual(['Peripherality index 2020 – Municipalities', 'Peripherality index 2020 – Localities']);
    for (const lang of LANGS) {
      const titles = m.layers.map((l) => l.title[lang]);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('classifies by CBS clusters 1–10 with the legend note and "not calculated" wording from terminology', () => {
    for (const id of ['peripherality-2020-local-authorities', 'peripherality-2020-localities']) {
      const c = layer(id).classification;
      expect(c.type).toBe('categorical');
      if (c.type !== 'categorical') continue;
      expect(c.classes.map((k) => k.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(c.note).toEqual({ he: '1 – הכי פריפריאלי, 10 – הכי מרכזי', en: '1 – most peripheral, 10 – most central', ru: '1 – самая периферия, 10 – самый центр' });
      expect(c.missing.label.en).toBe('Not calculated');
    }
    expect(layer('peripherality-2020-localities').classification.missing.description.en).toMatch(/Bedouin tribes/);
  });

  it('shows cluster, index, rank "of" its table size, distance (localities) and population', () => {
    const popup = (id: string) => layer(id).popup.map((p) => [p.field, p.format]);
    expect(popup('peripherality-2020-local-authorities')).toEqual([
      ['cluster', { type: 'integer' }],
      ['index', { type: 'decimal', decimals: 3 }],
      ['rank', { type: 'rank', total: 255 }],
      ['population', { type: 'integer' }],
    ]);
    expect(popup('peripherality-2020-localities')).toEqual([
      ['cluster', { type: 'integer' }],
      ['index', { type: 'decimal', decimals: 3 }],
      ['rank', { type: 'rank', total: 1213 }],
      ['distance_km', { type: 'decimal', decimals: 1 }],
      ['population', { type: 'integer' }],
    ]);
  });

  it('credits CBS with the publication citation', () => {
    const src = layer('peripherality-2020-localities').source;
    expect(src.citation).toMatch(/הודעה לתקשורת 420\/2022/);
    expect(src.citation).toMatch(/הועתק והופץ כמות שהוא/);
    expect(layer('peripherality-2020-localities').attribution.en).toBe('Peripherality Index 2020: CBS Israel');
  });
});

describe('YlGn palette', () => {
  // d3-scale-chromatic 3.0.0 (as installed): quantize(interpolateYlGn, 10).
  const YLGN = ['#ffffe5', '#f5fbc0', '#dff2a8', '#bbe395', '#8fd082', '#60ba6c', '#389d55', '#1b7f41', '#046335', '#004529'];

  it('has the d3 values, pale (most peripheral) → dark green (most central), and colours both layers', () => {
    expect(palette10('YlGn')).toEqual(YLGN);
    for (const l of manifest().layers.filter((x) => x.dataset === ID)) {
      if (l.classification.type === 'categorical') expect(l.classification.classes.map((c) => c.color)).toEqual(YLGN);
    }
  });

  it('shares no colour with the SES RdYlBu', () => {
    const rdylbu = new Set(palette10('RdYlBu'));
    expect(YLGN.filter((c) => rdylbu.has(c))).toEqual([]);
  });

  it('gets legend text with at least 4.5:1 contrast on every class', () => {
    for (const c of YLGN) expect(contrast(c, textOn(c)), c).toBeGreaterThanOrEqual(4.5);
    expect(YLGN.map(textOn)).toEqual(['#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#ffffff', '#ffffff', '#ffffff']);
  });
});

describe('dataset wording', () => {
  it('is complete in all three languages for every dataset', () => {
    for (const [id, t] of Object.entries(DATASET_TERMS)) {
      for (const text of [t.title, t.attribution, t.scale.low, t.scale.high, ...Object.values(t.missing), ...Object.values(t.fields)]) {
        for (const lang of LANGS) expect(text?.[lang]?.trim(), `${id}`).toBeTruthy();
      }
    }
    expect(() => datasetTerms('no-such-dataset')).toThrow(/DATASET_TERMS/);
  });

  it('writes every cluster legend note in one style, "1 – low, 10 – high"', () => {
    for (const l of manifest().layers) {
      for (const lang of LANGS) expect(l.classification.note?.[lang], l.id).toMatch(/^1 – .+, 10 – .+$/);
    }
    expect(manifest().layers.find((l) => l.id === 'ses-2021-localities')?.classification.note?.en).toBe('1 – lowest socio-economic level, 10 – highest');
  });
});
