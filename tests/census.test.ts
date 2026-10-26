import { describe, expect, inject, it } from 'vitest';
import { LANGS, type ChoroplethLayer } from '../pipeline/lib/contract.ts';
import { colorbrewer, OKABE_ITO } from '../pipeline/lib/palettes.ts';
import { BREAKS, RELIGIOSITY_COLORS } from '../pipeline/datasets/census-2022/index.ts';
import { datasetTerms } from '../pipeline/terminology.ts';
import { contrast, textOn } from '../viewer/src/classify.ts';
import { dataset, manifest } from './dist.ts';

const ID = 'census-2022';
const values = () => dataset(`datasets/${ID}/localities-2011.json`);
const layer = (id: string) => manifest().layers.find((l) => l.id === id) as ChoroplethLayer;

describe('census 2022: join', () => {
  it('places 1184 of 1185 coded locality rows (the national total has no code); the miss is the Bedouin dispersion group', () => {
    const j = inject('buildReport').joins.find((r) => r.label === 'census: coded locality rows')!;
    expect([j.level, j.matched, j.rows, j.unmatched]).toEqual(['localities-2011', 1184, 1185, ['1997']]);
    expect(j.expectedUnmatched?.['1997']).toMatch(/Bedouin dispersion/);
    expect(Object.keys(values())).toHaveLength(1184);
  });
});

describe('census 2022: values equal the raw rows (mifkad-2022.xlsx, locality rows)', () => {
  it.each([
    ['5000', { population: 492870, age_median: 35, age65_pct: 15.1, academic_pct: 43, wage_median: 135000, rent_pct: 55.2, religiosity: 1 }], // Tel Aviv-Yafo
    ['6100', { population: 216870, age_median: 19, age65_pct: 7.3, academic_pct: 6.8, wage_median: 74000, rent_pct: 36, religiosity: 4 }], // Bnei Brak
    ['1161', { population: 71360, age_median: 20, age65_pct: 2.7, academic_pct: 6.7, wage_median: 78300, rent_pct: 5.2, religiosity: 3 }], // Rahat
    ['3797', { population: 83130, age_median: 13, age65_pct: 1.1, academic_pct: 4.6, wage_median: 62600, rent_pct: 26.6, religiosity: 4 }], // Modi'in Illit
    ['452', { population: 600, age_median: 40, age65_pct: 20.9, academic_pct: 39.1, wage_median: 114400, rent_pct: 10.2, religiosity: 1 }], // kibbutz Yizre'el
    ['2600', { population: 55210, age_median: 35, age65_pct: 11.8, academic_pct: 15.3, wage_median: 105400, rent_pct: 49.4, religiosity: 1 }], // Eilat
  ])('%s', (code, expected) => {
    expect(values()[code]).toEqual(expected);
  });

  it('reads the religiosity code from the swapped column and leaves empty cells out', () => {
    const v = Object.values(values());
    expect(new Set(v.map((r) => r.religiosity).filter((x) => x != null))).toEqual(new Set([1, 2, 3, 4, 6]));
    // A few small places have suppressed estimates: no key, so "no data" on that layer only.
    expect(v.filter((r) => !('age65_pct' in r)).length).toBe(14);
    for (const r of v) expect(Number.isInteger(r.population) && r.population % 10 === 0).toBe(true);
  });
});

describe('census 2022: classification', () => {
  const YLORBR = ['#fff2b3', '#fed16d', '#fc9d2e', '#e2660f', '#ab3d03', '#662506'];

  it('uses round breaks and the YlOrBr ramp on every stepped measure', () => {
    expect(colorbrewer('YlOrBr6')).toEqual(YLORBR);
    const expected: [string, number[]][] = [
      ['census-2022-median-age-localities', [20, 25, 30, 35, 40]],
      ['census-2022-aged-65-localities', [5, 10, 15, 20, 25]],
      ['census-2022-academic-localities', [10, 20, 30, 40, 50]],
      ['census-2022-wage-localities', [80000, 100000, 120000, 140000, 160000]],
      ['census-2022-renting-localities', [10, 20, 30, 40, 50]],
    ];
    for (const [id, breaks] of expected) {
      const c = layer(id).classification;
      expect(c.type === 'stepped' && [c.breaks, c.colors]).toEqual([breaks, YLORBR]);
    }
    expect(Object.values(BREAKS).map((b) => b.length)).toEqual([5, 5, 5, 5, 5]);
  });

  it('shows household religiosity as unordered CBS categories in Okabe-Ito colours', () => {
    const c = layer('census-2022-religiosity-localities').classification;
    expect(c).toMatchObject({ type: 'categorical', ordered: false });
    if (c.type !== 'categorical') return;
    expect(c.classes.map((k) => [k.value, k.color, k.label.en])).toEqual([
      [1, OKABE_ITO.skyBlue, 'Secular'],
      [2, OKABE_ITO.yellow, 'Traditional'],
      [3, OKABE_ITO.bluishGreen, 'Religious or very religious'],
      [4, OKABE_ITO.reddishPurple, 'Haredi'],
      [6, OKABE_ITO.orange, 'Other'],
    ]);
    expect(c.classes.find((k) => k.value === 4)?.label.ru).toBe('Харедим (ультраортодоксы)');
    expect(Object.keys(RELIGIOSITY_COLORS)).toHaveLength(5);
  });

  it('gives every census colour legend text with ≥ 4.5:1 contrast', () => {
    for (const c of [...YLORBR, ...Object.values(RELIGIOSITY_COLORS)]) expect(contrast(c, textOn(c)), c).toBeGreaterThanOrEqual(4.5);
  });
});

describe('census 2022: wording and popup', () => {
  it('has titles, short titles, measures and the sample caveat in he/en/ru', () => {
    const t = datasetTerms(ID);
    expect(t.shortTitle).toEqual({ he: 'מפקד 2022', en: 'Census 2022', ru: 'Перепись 2022' });
    expect(manifest().datasets[ID].description?.en).toMatch(/~20% sample/);
    expect(t.measures?.academic.title.ru).toBe('С высшим образованием');
    for (const m of Object.values(t.measures!)) for (const lang of LANGS) expect(m.title[lang].trim()).not.toBe('');
    expect(manifest().datasets[ID].measures?.map((m) => m.id)).toEqual(['median-age', 'aged-65', 'academic', 'wage', 'renting', 'religiosity']);
  });

  it('formats the wage as ₪ and explains religiosity across religions', () => {
    const wage = layer('census-2022-wage-localities').popup.find((p) => p.field === 'wage_median')!;
    expect(wage.format).toEqual({ type: 'currency', currency: 'ILS', decimals: 0 });
    expect(wage.label.en).toBe('Median annual wage of employees');
    const note = layer('census-2022-religiosity-localities').classification.note!;
    expect(note.en).toMatch(/covers all religions: in Arab and Druze localities it is Muslim, Christian or Druze observance/);
    expect(note.he).toMatch(/אורח חיים עיקרי למשק בית/);
    expect(note.ru).toMatch(/Относится ко всем религиям/);
  });

  it('gives all six layers the same seven-row popup', () => {
    const layers = manifest().layers.filter((l) => l.dataset === ID);
    expect(layers).toHaveLength(6);
    for (const l of layers) {
      expect(l.popup.map((p) => p.field)).toEqual(['population', 'age_median', 'age65_pct', 'academic_pct', 'wage_median', 'rent_pct', 'religiosity']);
    }
  });
});
