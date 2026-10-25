import { describe, expect, it } from 'vitest';
import { MISSING, classKey, classLabel, isOrdered, layerUnit, legendEntries, spanText } from '../src/classify.ts';
import { joinLayer } from '../src/data.ts';
import { formatPercent } from '../src/format.ts';
import { featureNote } from '../src/manifest.ts';
import { formatField, headerLines, popupHtml, valueHtml } from '../src/popup.ts';
import { compactHl, expandHl } from '../src/range.ts';
import { layer, manifest } from './fixtures.ts';

const bare = (s: string) => s.replace(/[⁦⁩]/g, '');
const LRI = '⁦';
const PDI = '⁩';

const joined = (id: string) => {
  const l = layer(id);
  const j = joinLayer(l.data, l.values, l.layer);
  const props = (code: string) => j.polygons.features.find((f) => f.properties.code === code)!.properties;
  return { ...l, props };
};

describe('popup formats: percent and category', () => {
  const growth = layer('population-2024-growth-localities').layer;
  const field = (name: string) => growth.popup.find((f) => f.field === name)!;

  it('prints percent values signed when asked, bidi-isolated with the % inside', () => {
    expect(formatPercent(5.9, 'en', 1, true)).toBe(`${LRI}+5.9%${PDI}`);
    expect(bare(formatPercent(-17.6, 'he', 1, true))).toBe('-17.6%');
    expect(bare(formatPercent(0, 'en', 1, true))).toBe('0.0%');
    expect(bare(formatPercent(99.7, 'ru', 1))).toBe('99,7%');
    expect(bare(formatField(field('growth_pct'), 5.9, 'he'))).toBe('+5.9%');
    expect(bare(formatField(field('jews_others_pct'), 99.7, 'en'))).toBe('99.7%');
  });

  it('prints category codes by their label, the number if the code is unknown', () => {
    const labels = (name: string) => (field(name).format as { labels: Record<string, Record<string, string>> }).labels;
    expect(formatField(field('type'), 3, 'en')).toBe(labels('type')['3'].en);
    expect(formatField(field('group'), 1, 'ru')).toBe(labels('group')['1'].ru);
    expect(bare(formatField(field('type'), 99, 'en'))).toBe('99');
  });
});

describe('units on stepped scales, from the value field\'s popup format', () => {
  const growth = layer('population-2024-growth-localities').layer;
  const size = layer('population-2024-size-localities').layer;

  it('writes % once per bin, after the last number, everywhere the bins show', () => {
    expect(layerUnit(growth)).toBe('%');
    expect(layerUnit(size)).toBe('');
    expect(layerUnit(layer('ses-2021-localities').layer)).toBe('');
    const { classes } = legendEntries(growth.classification, 'en', '%');
    expect(classes.map((c) => bare(c.label))).toEqual(['< -5%', '-5 – 0%', '0 – 2%', '2 – 5%', '5 – 10%', '≥ 10%']);
    expect(classes.map((c) => bare(c.short))).toEqual(['< -5%', '-5%', '0%', '2%', '5%', '10%']);
    expect(bare(spanText(growth.classification, 's2', 's4', 'he', '%'))).toBe('0 – 10%');
    expect(bare(classLabel(growth.classification, 's1', 'ru', '%'))).toBe('-5 – 0%');
    // Unitless scales are unchanged.
    expect(legendEntries(size.classification, 'en', layerUnit(size)).classes.every((c) => !c.label.includes('%'))).toBe(true);
  });

  it('shows the unit in the popup bin and the tooltip value', () => {
    const g = joined('population-2024-growth-localities');
    const p = g.props('6900'); // Kfar Saba, -4.3%
    expect(bare(valueHtml(g.layer, p, 'en'))).toContain('<span>-4.3%</span><span class="bin">-5 – 0%</span>');
  });

  it('applies to any layer whose value is a percent (an injected crime-style stepped layer)', () => {
    const crime = {
      ...growth,
      valueField: 'rate',
      classification: { ...growth.classification, breaks: [-1, 0, 5, 10, 20], colors: ['#2166ac', '#67a9cf', '#d1e5f0', '#fddbc7', '#ef8a62', '#b2182b'] },
      popup: [{ field: 'rate', label: growth.popup[0].label, format: { type: 'percent' as const, decimals: 2 } }],
    };
    expect(layerUnit(crime)).toBe('%');
    expect(legendEntries(crime.classification, 'he', layerUnit(crime)).classes.map((c) => bare(c.label))).toEqual(['< -1%', '-1 – 0%', '0 – 5%', '5 – 10%', '10 – 20%', '≥ 20%']);
    expect(layerUnit({ ...crime, popup: [{ ...crime.popup[0], format: { type: 'decimal' as const, decimals: 2 } }] })).toBe('');
  });
});

describe('records with missing fields', () => {
  it('treats a record without the layer value as "no data", and still shows its other fields', () => {
    // Locality 10 has no growth_pct (fewer than 500 Israelis in 2022) but a population.
    const g = joined('population-2024-growth-localities');
    const p = g.props('10');
    expect(p._k).toBe(MISSING);
    const html = bare(popupHtml(g.layer, g.level, p, 'en'));
    expect(html).toContain('No data');
    expect(html).toContain('Not shown: fewer than 500 Israeli residents');
    expect(html).toContain('<dt>Residents 2024</dt><dd>482</dd>');
    expect(html).not.toContain('Growth 2022–24 (Israelis)');
    // Locality 7 has it: coloured, the row marked as the current one.
    const seven = bare(popupHtml(g.layer, g.level, g.props('7'), 'en'));
    expect(seven).toContain('<div class="current"><dt>Growth 2022–24 (Israelis)</dt>');
    expect(seven).toContain('-17.6%');
  });

  it('never shows a geometry property in place of a missing dataset field', () => {
    const s = joined('population-2024-size-local-authorities');
    // Migdal Tefen (1722) has no population record: the 2020 geometry `population` must not appear as "Residents 2024".
    const p = s.props('1722');
    expect(p.population).toBeUndefined();
    expect(p._k).toBe(MISSING);
    expect(popupHtml(s.layer, s.level, p, 'en')).not.toContain('Residents 2024');
  });
});

describe('per-feature notes and the popup official term', () => {
  it('adds the dataset\'s note on a feature as a muted line, on every layer of the dataset on that level', () => {
    const m = manifest();
    for (const id of ['population-2024-size-localities', 'population-2024-type-localities']) {
      const l = joined(id);
      const note = featureNote(m, l.layer, '3779'); // Kokhav Ya'akov, with Tel Zion
      expect(note?.en).toMatch(/Tel Zion/);
      expect(popupHtml(l.layer, l.level, l.props('3779'), 'en', note)).toContain(`<p class="popup-note feature-note">${note!.en.replace(/'/g, '&#39;')}</p>`);
    }
    const a = layer('population-2024-size-local-authorities').layer;
    expect(featureNote(m, a, '5526')?.he).toMatch(/צור הדסה/); // Mateh Yehuda
    expect(featureNote(m, a, '5572')?.ru).toMatch(/Шаар-Шомрон/); // Shomron
    expect(featureNote(m, a, '5000')).toBeUndefined();
    expect(featureNote(m, layer('ses-2021-local-authorities').layer, '5526')).toBeUndefined();
  });

  it('leaves the official term out of popups on levels that say so, and keeps it elsewhere', () => {
    const loc = joined('population-2024-size-localities');
    expect(loc.level.popupOfficialTerm).toBe(false);
    expect(headerLines(loc.props('6900'), loc.level, 'en')).toEqual(['Locality']);
    const la = joined('population-2024-size-local-authorities');
    expect(headerLines(la.props('5000'), la.level, 'en')).toEqual(['City · Local authorities']);
  });
});

describe('nominal classes (ordered: false)', () => {
  const type = layer('population-2024-type-localities').layer;
  const c = type.classification;
  const keys = ['1', '2', '3', '4', '5', '6'];

  it('are flagged unordered, and only they', () => {
    expect(isOrdered(c)).toBe(false);
    expect(isOrdered(layer('population-2024-size-localities').layer.classification)).toBe(true);
    expect(isOrdered(layer('ses-2021-localities').layer.classification)).toBe(true);
  });

  it('list one swatch per class with its label and no number', () => {
    const { classes, missing } = legendEntries(c, 'en');
    expect(classes.map((x) => x.label)).toEqual(c.type === 'categorical' ? c.classes.map((k) => k.label.en) : []);
    expect(classes).toHaveLength(6);
    expect(classes.every((x) => x.short === '')).toBe(true);
    expect(missing.label).toBe('No data');
  });

  it('keep the highlight a set: the URL lists classes, never ranges, and ignores ranges', () => {
    expect(compactHl(['1', '2', '3'], keys, false)).toEqual(['1', '2', '3']);
    expect(compactHl(['4', '1'], keys, false)).toEqual(['1', '4']);
    expect(compactHl(['1', '2', '3'], keys)).toEqual(['1-3']); // ordered scales still compact
    expect(expandHl(['1', '4'], keys, false)).toEqual(['1', '4']);
    expect(expandHl(['1-3'], keys, false)).toEqual([]);
  });

  it('show the category label as the value (also in search results)', () => {
    const t = joined('population-2024-type-localities');
    const p = t.props('7');
    expect(p._k).toBe(classKey(c, 3));
    expect(valueHtml(t.layer, p, 'he')).toContain('<span>מושב</span>');
  });
});
