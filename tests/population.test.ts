import { describe, expect, inject, it } from 'vitest';
import { LANGS, validateManifest, type ChoroplethLayer, type Manifest } from '../pipeline/lib/contract.ts';
import { colorbrewer, OKABE_ITO } from '../pipeline/lib/palettes.ts';
import { GROWTH_BREAKS, GROWTH_MIN_BASE, localityTypeGroup, SIZE_BREAKS } from '../pipeline/datasets/population-2024/index.ts';
import { datasetTerms, layerTitle } from '../pipeline/terminology.ts';
import { contrast, textOn } from '../viewer/src/classify.ts';
import { dataset, manifest } from './dist.ts';

const ID = 'population-2024';
const L = 'localities-2011';
const A = 'local-authorities-2011';
const layer = (id: string) => manifest().layers.find((l) => l.id === id) as ChoroplethLayer;
const loc = () => dataset(`datasets/${ID}/${L}.json`);
const auth = () => dataset(`datasets/${ID}/${A}.json`);

describe('population 2024: joins', () => {
  it('places 1216 of 1221 populated localities; the 5 without a polygon are the documented ones', () => {
    const j = inject('buildReport').joins.find((r) => r.label === 'population: localities')!;
    expect([j.matched, j.rows]).toEqual([1216, 1221]);
    expect([...j.unmatched].sort()).toEqual(['1362', '3815', '3826', '3864', '4029']);
    expect(Object.keys(j.expectedUnmatched!).sort()).toEqual(['1362', '3815', '3826', '3864', '4029']);
    expect(Object.keys(loc())).toHaveLength(1216);
  });

  it('places 255 of 257 authorities; the 2 new councils are folded into their 2011 regional councils', () => {
    const j = inject('buildReport').joins.find((r) => r.label === 'population: local authorities')!;
    expect([j.matched, j.rows, [...j.unmatched].sort()]).toEqual([255, 257, ['1113', '3826']]);
    expect(Object.keys(auth())).toHaveLength(255);
  });
});

describe('population 2024: values equal the raw rows', () => {
  // bycode2024 (total, Israelis, Jews & others, Arabs) and bycode2022 (total) by hand; shares are of Israelis.
  it.each([
    // Tel Aviv-Yafo: 494,900 total, 467,273 Israelis (440,299 + 26,974), 474,530 in 2022; CBS calls it mixed (4)
    ['5000', { population: 494900, israelis: 467273, israelis_2022: 474530, growth_pct: -1.5, group: 4, type: 1, jews_others_pct: 94.2, arabs_pct: 5.8 }],
    // Jerusalem: 1,050,151 / 997,864 (596,438 + 401,426) / 981,711
    ['3000', { population: 1050151, israelis: 997864, israelis_2022: 981711, growth_pct: 1.6, group: 4, type: 1, jews_others_pct: 59.8, arabs_pct: 40.2 }],
    // kibbutz Yizre'el (type 330): 627 / 599 / 542
    ['452', { population: 627, israelis: 599, israelis_2022: 542, growth_pct: 10.5, group: 1, type: 4, jews_others_pct: 100, arabs_pct: 0 }],
    // Umm al-Fahm (type 250): 60,210 / 60,147 (50 + 60,097) / 58,665
    ['2710', { population: 60210, israelis: 60147, israelis_2022: 58665, growth_pct: 2.5, group: 2, type: 2, jews_others_pct: 0.1, arabs_pct: 99.9 }],
    // Kokhav Ya'akov 3779 + Tel Zion 3815 (split 2023): 4,093 + 6,935 / 4,046 + 6,924 / 9,794 (2022, before the split)
    ['3779', { population: 11028, israelis: 10970, israelis_2022: 9794, growth_pct: 12, group: 1, type: 1, jews_others_pct: 100, arabs_pct: 0 }],
  ])('locality %s', (code, expected) => {
    expect(loc()[code]).toEqual(expected);
  });

  it('aggregates authorities by 2011 membership', () => {
    expect(auth()['5000']).toEqual({ population: 494900, israelis: 467273, israelis_2022: 474530, growth_pct: -1.5, jews_others_pct: 94.2, arabs_pct: 5.8 });
    // Mateh Yehuda 5526 includes Tzur Hadassa 1113 in both years, so its growth compares like with like.
    const a = auth()['5526'];
    expect(a.population).toBeGreaterThan(60000);
    expect(a.growth_pct).toBe(Math.round((a.israelis / a.israelis_2022 - 1) * 1000) / 10);
  });
});

describe('population 2024: growth', () => {
  it('is 2024 Israelis over 2022 total, in %, 1 decimal, only where 2022 had ≥ 500', () => {
    const values = loc();
    let shown = 0;
    for (const r of Object.values(values)) {
      if (r.israelis_2022 != null && r.israelis_2022 >= GROWTH_MIN_BASE) {
        shown++;
        expect(r.growth_pct).toBe(Math.round((r.israelis / r.israelis_2022 - 1) * 1000) / 10);
      } else expect('growth_pct' in r).toBe(false);
    }
    expect(shown).toBe(947);
  });

  it('cuts at −5, 0, 2, 5, 10 with BrBG brown (decline) / teal (growth); a value on a break goes up', () => {
    const g = layer('population-2024-growth-localities').classification;
    expect(g).toMatchObject({ type: 'stepped', breaks: [-5, 0, 2, 5, 10] });
    const brbg = colorbrewer('BrBG8');
    expect(g.type === 'stepped' && g.colors).toEqual([brbg[1], brbg[2], brbg[4], brbg[5], brbg[6], brbg[7]]);
    // MapLibre step semantics: v < breaks[0] → colors[0]; breaks[i-1] ≤ v < breaks[i] → colors[i].
    const bin = (v: number) => GROWTH_BREAKS.filter((b) => v >= b).length;
    expect([bin(-5.1), bin(-5), bin(-0.1), bin(0), bin(1.9), bin(2), bin(10)]).toEqual([0, 1, 1, 2, 2, 3, 5]);
  });
});

describe('population 2024: size', () => {
  it('uses round CBS size bands with ColorBrewer BuPu', () => {
    expect(SIZE_BREAKS[L]).toEqual([500, 2000, 5000, 10000, 20000, 50000, 100000, 200000]);
    expect(SIZE_BREAKS[A]).toEqual([5000, 10000, 20000, 50000, 100000, 200000]);
    const s = layer('population-2024-size-localities').classification;
    expect(s.type === 'stepped' && [s.breaks, s.colors]).toEqual([SIZE_BREAKS[L], colorbrewer('BuPu9')]);
    const a = layer('population-2024-size-local-authorities').classification;
    expect(a.type === 'stepped' && [a.breaks, a.colors]).toEqual([SIZE_BREAKS[A], colorbrewer('BuPu7')]);
  });
});

describe('population 2024: nominal classes', () => {
  it('maps CBS locality-type codes to six groups', () => {
    expect([120, 130, 190, 250, 290, 191, 310, 320, 193, 330, 370, 340, 350, 440, 450].map(localityTypeGroup)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 6, 6, 7,
    ]);
    expect(() => localityTypeGroup(460)).toThrow();
  });

  it('marks group and type unordered, with Okabe-Ito colours and labels from terminology', () => {
    const group = layer('population-2024-group-localities').classification;
    const type = layer('population-2024-type-localities').classification;
    expect(group).toMatchObject({ type: 'categorical', ordered: false });
    expect(type).toMatchObject({ type: 'categorical', ordered: false });
    if (group.type !== 'categorical' || type.type !== 'categorical') return;
    expect(group.classes.map((c) => [c.value, c.color, c.label.en])).toEqual([
      [1, OKABE_ITO.blue, 'Jewish locality'],
      [2, OKABE_ITO.orange, 'Non-Jewish locality (Arab, Druze, Circassian)'],
      [4, OKABE_ITO.reddishPurple, 'Mixed locality'],
    ]);
    expect(type.classes.map((c) => c.label.en)).toEqual([
      'Town or city – Jewish or mixed',
      'Arab, Druze or Circassian town',
      'Moshav',
      'Kibbutz',
      'Community settlement',
      'Other rural or institutional',
      'Arab, Druze, Circassian or Bedouin village',
    ]);
    expect(type.classes.map((c) => c.label.he)).toEqual([
      'יישוב עירוני – יהודי או מעורב',
      "יישוב עירוני – ערבי, דרוזי או צ'רקסי",
      'מושב',
      'קיבוץ',
      'יישוב קהילתי',
      'יישוב כפרי אחר או מוסדי',
      "כפר ערבי, דרוזי, צ'רקסי או בדואי",
    ]);
    expect(type.classes.slice(0, 2).map((c) => c.label.ru)).toEqual(['Город (еврейский или смешанный)', 'Арабский, друзский или черкесский город']);
    // The mixed cities are type 1 and group "mixed" without the type label contradicting it.
    for (const code of ['5000', '3000', '4000']) expect([loc()[code].type, loc()[code].group]).toEqual([1, 4]);
    expect(layer('population-2024-type-localities').title.he).toBe('אוכלוסייה 2024 – סוג יישוב – יישובים');
    // Every value in the data is a declared class.
    const values = Object.values(loc());
    expect(new Set(values.map((r) => r.group))).toEqual(new Set(group.classes.map((c) => c.value)));
    expect(new Set(values.map((r) => r.type))).toEqual(new Set(type.classes.map((c) => c.value)));
  });

  it('gives the 26 CBS code-450 villages their own class 7, in vermillion next to the Arab towns\' orange', () => {
    const type = layer('population-2024-type-localities').classification;
    if (type.type !== 'categorical') throw new Error('categorical expected');
    expect(type.classes.map((c) => [c.value, c.color])).toEqual([
      [1, OKABE_ITO.blue],
      [2, OKABE_ITO.orange],
      [3, OKABE_ITO.bluishGreen],
      [4, OKABE_ITO.reddishPurple],
      [5, OKABE_ITO.skyBlue],
      [6, OKABE_ITO.yellow],
      [7, OKABE_ITO.vermillion],
    ]);
    const counts: Record<number, number> = {};
    for (const r of Object.values(loc())) counts[r.type] = (counts[r.type] ?? 0) + 1;
    expect(counts[7]).toBe(26);
    // Druze Ein al-Asad, Circassian Rihaniya, Bedouin Tarabin a-Sana, Arab al-Aramshe, Arab Ein Rafa.
    for (const code of ['546', '540', '1346', '1246', '514']) expect(loc()[code].type).toBe(7);
    expect(loc()['546'].group).toBe(2);
  });

  it('gives every nominal and stepped colour legend text with ≥ 4.5:1 contrast', () => {
    const colours = [...Object.values(OKABE_ITO), ...colorbrewer('BuPu9'), ...colorbrewer('BuPu7'), ...colorbrewer('BrBG8')];
    for (const c of colours) expect(contrast(c, textOn(c)), c).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves the cluster indices ordered (no `ordered` key)', () => {
    for (const l of manifest().layers.filter((x) => x.valueField === 'cluster')) expect('ordered' in l.classification).toBe(false);
  });
});

describe('measures in the contract', () => {
  it('lists the measures in order and titles layers dataset – measure – level', () => {
    const m = manifest();
    expect(m.datasets[ID].measures?.map((x) => [x.id, x.title.en])).toEqual([
      ['size', 'Residents'],
      ['growth', 'Growth 2022–24'],
      ['group', 'Population group'],
      ['type', 'Locality type'],
    ]);
    const layers = m.layers.filter((l) => l.dataset === ID) as ChoroplethLayer[];
    expect(layers.map((l) => [l.id, l.measure, l.level])).toEqual([
      ['population-2024-size-local-authorities', 'size', A],
      ['population-2024-growth-local-authorities', 'growth', A],
      ['population-2024-size-localities', 'size', L],
      ['population-2024-growth-localities', 'growth', L],
      ['population-2024-group-localities', 'group', L],
      ['population-2024-type-localities', 'type', L],
    ]);
    for (const l of layers) {
      const measure = m.datasets[ID].measures!.find((x) => x.id === l.measure)!.title;
      expect(l.title).toEqual(layerTitle(m.datasets[ID].title, l.level, measure));
    }
    for (const l of m.layers.filter((x) => !m.datasets[x.dataset].measures)) expect('measure' in l).toBe(false);
  });

  it('rejects a layer without a measure in a measured dataset, an unknown measure, and duplicates', () => {
    const m = structuredClone(manifest()) as Manifest;
    const i = m.layers.findIndex((l) => l.id === 'population-2024-type-localities');
    const noMeasure = structuredClone(m);
    delete noMeasure.layers[i].measure;
    expect(validateManifest(noMeasure).join()).toMatch(/measure/);
    const unknown = structuredClone(m);
    unknown.layers[i].measure = 'nope';
    expect(validateManifest(unknown).join()).toMatch(/measure/);
    const dup = structuredClone(m);
    dup.layers.push({ ...dup.layers[i], id: 'population-2024-type-localities-copy' });
    expect(validateManifest(dup).join()).toMatch(/one layer per/);
  });

  it('shows the same full profile in every popup on a level, with percent and category formats', () => {
    const fields = (id: string) => layer(id).popup.map((p) => [p.field, p.format.type]);
    const localities = fields('population-2024-size-localities');
    expect(localities).toEqual([
      ['population', 'integer'],
      ['israelis', 'integer'],
      ['israelis_2022', 'integer'],
      ['growth_pct', 'percent'],
      ['group', 'category'],
      ['type', 'category'],
      ['jews_others_pct', 'percent'],
      ['arabs_pct', 'percent'],
    ]);
    for (const id of ['population-2024-growth-localities', 'population-2024-group-localities', 'population-2024-type-localities']) expect(fields(id)).toEqual(localities);
    expect(fields('population-2024-size-local-authorities').map(([f]) => f)).toEqual(['population', 'israelis', 'israelis_2022', 'growth_pct', 'jews_others_pct', 'arabs_pct']);
    const growth = layer('population-2024-growth-localities').popup.find((p) => p.field === 'growth_pct')!;
    expect(growth.format).toEqual({ type: 'percent', decimals: 1, signed: true });
  });
});

describe('population 2024: size palette', () => {
  it('starts BuPu at a visibly tinted class (d3 interpolateBuPu over t = 0.15…1), not near-white', () => {
    expect(colorbrewer('BuPu9')).toEqual(['#d9e6f1', '#bdd2e6', '#a3bcda', '#929fcb', '#8c7cb9', '#8a58a8', '#863292', '#751073', '#4d004b']);
    expect(colorbrewer('BuPu7')).toEqual(['#d9e6f1', '#b4cbe2', '#96aad0', '#8c7cb9', '#894ca1', '#7d197f', '#4d004b']);
    // Darker than the near-white published first class, and still lighter → darker throughout.
    for (const p of [colorbrewer('BuPu9'), colorbrewer('BuPu7')]) {
      expect(contrast(p[0], '#ffffff')).toBeGreaterThan(contrast('#f7fcfd', '#ffffff'));
      for (let i = 1; i < p.length; i++) expect(contrast(p[i], '#ffffff')).toBeGreaterThan(contrast(p[i - 1], '#ffffff'));
    }
  });
});

describe('population 2024: per-feature notes, short titles, popup official term', () => {
  it('notes Kokhav Ya\'akov (with Tel Zion), Mateh Yehuda and Shomron on their levels', () => {
    const notes = manifest().datasets[ID].notes!;
    expect(Object.keys(notes).sort()).toEqual([A, L]);
    expect(Object.keys(notes[L]!)).toEqual(['3779']);
    expect(notes[L]!['3779'].en).toBe('Includes Tel Zion (3815), which became a separate locality in 2023; the shared polygon covers both.');
    expect(Object.keys(notes[A]!).sort()).toEqual(['5526', '5572']);
    expect(notes[A]!['5526'].en).toMatch(/Tzur Hadassa/);
    expect(notes[A]!['5572'].en).toMatch(/Sha'ar Shomron/);
    for (const level of [A, L] as const) for (const n of Object.values(notes[level]!)) for (const lang of LANGS) expect(n[lang].trim()).not.toBe('');
    for (const id of ['ses-2021', 'peripherality-2020']) expect(manifest().datasets[id].notes).toBeUndefined();
  });

  it('gives every dataset a short title', () => {
    const short = (id: string) => manifest().datasets[id].shortTitle;
    expect(short('ses-2021')).toEqual({ he: 'מדד חברתי-כלכלי 2021', en: 'Socio-economic 2021', ru: 'Соц.-экон. индекс 2021' });
    expect(short('peripherality-2020')).toEqual({ he: 'פריפריאליות 2020', en: 'Peripherality 2020', ru: 'Периферийность 2020' });
    expect(short(ID)).toEqual({ he: 'אוכלוסייה 2024', en: 'Population 2024', ru: 'Население 2024' });
  });

  it('keeps the localities official term out of popups only', () => {
    const levels = manifest().levels;
    expect(levels[L].popupOfficialTerm).toBe(false);
    expect(levels[L].officialTerm?.en).toBe('All CBS localities, cities included');
    for (const id of [A, 'rc-localities-2011', 'statistical-areas-2011'] as const) expect(levels[id].popupOfficialTerm).toBeUndefined();
  });

  it('flags wartime displacement as an unverified caveat', () => {
    const d = manifest().datasets[ID].description!;
    expect(d.en).toMatch(/may reflect wartime displacement \(not verified\)/);
    expect(d.he).toMatch(/לא נבדק/);
    expect(d.ru).toMatch(/не проверено/);
  });
});

describe('population 2024: wording', () => {
  it('is complete in he/en/ru, with the owner-approved "סוג יישוב" and the growth caveat', () => {
    const t = datasetTerms(ID);
    expect(t.title).toEqual({ he: 'אוכלוסייה 2024', en: 'Population 2024', ru: 'Население 2024' });
    expect(t.measures?.type.title).toEqual({ he: 'סוג יישוב', en: 'Locality type', ru: 'Тип населённого пункта' });
    expect(layer('population-2024-growth-localities').classification.note?.en).toBe('Israeli residents only; 2022 recomputed after the 2022 census');
    for (const m of Object.values(t.measures!)) for (const lang of LANGS) expect(m.title[lang].trim()).not.toBe('');
    expect(manifest().datasets[ID].description?.en).toMatch(/Tel Zion/);
  });
});
