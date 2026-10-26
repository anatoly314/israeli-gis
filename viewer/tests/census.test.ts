import { describe, expect, it } from 'vitest';
import { isOrdered, layerUnit, legendEntries, spanText } from '../src/classify.ts';
import { joinLayer } from '../src/data.ts';
import { formatBound, formatCurrency, rangeLabel } from '../src/format.ts';
import { groupLayers } from '../src/manifest.ts';
import { formatField, valueHtml } from '../src/popup.ts';
import { layer, manifest } from './fixtures.ts';

const bare = (s: string) => s.replace(/[⁦⁩]/g, '');
const ILS = { currency: 'ILS', decimals: 0 };

describe('currency (ILS) — popup format and scale unit', () => {
  it('formats money as the locale writes it, isolated left-to-right, without Intl bidi marks', () => {
    expect(formatCurrency(135000, 'en', 'ILS', 0)).toBe('⁦₪135,000⁩');
    expect(bare(formatCurrency(135000, 'he', 'ILS', 0))).toMatch(/^135,000\s₪$/);
    expect(bare(formatCurrency(135000, 'ru', 'ILS', 0))).toMatch(/^135\s000\s₪$/);
    expect(formatCurrency(135000, 'he', 'ILS', 0)).not.toMatch(/[‎‏]/);
  });

  it('writes every bound of a currency scale in the currency', () => {
    expect(bare(rangeLabel(80000, 100000, 'en', ILS))).toBe('₪80,000 – ₪100,000');
    expect(bare(rangeLabel(undefined, 80000, 'en', ILS))).toBe('< ₪80,000');
    expect(bare(rangeLabel(160000, undefined, 'he', ILS))).toMatch(/^≥ 160,000\s₪$/);
    expect(bare(formatBound(80000, 'en', ILS))).toBe('₪80K');
    expect(bare(formatBound(80000, 'ru', ILS))).toBe('80 тыс. ₪');
  });

  it('takes ₪ from the wage layer\'s value format into its legend, slider text, popup and tooltip value', () => {
    const wage = layer('census-2022-wage-localities');
    expect(layerUnit(wage.layer)).toEqual(ILS);
    const { classes } = legendEntries(wage.layer.classification, 'en', layerUnit(wage.layer));
    expect(classes.every((c) => c.label.includes('₪') && c.short.includes('₪'))).toBe(true);
    expect(bare(classes[1].label)).toMatch(/^₪[\d,]+ – ₪[\d,]+$/);
    expect(bare(spanText(wage.layer.classification, 's0', `s${classes.length - 1}`, 'en', layerUnit(wage.layer)))).toMatch(/^< ₪[\d,]+ … ≥ ₪[\d,]+$/);
    const field = wage.layer.popup.find((f) => f.field === wage.layer.valueField)!;
    expect(bare(formatField(field, 135000, 'en'))).toBe('₪135,000');
    const joined = joinLayer(wage.data, wage.values, wage.layer);
    const p = joined.polygons.features.find((f) => typeof f.properties.wage_median === 'number')!.properties;
    const html = bare(valueHtml(wage.layer, p, 'en'));
    expect(html).toMatch(/<span>₪[\d,]+<\/span><span class="bin">[^<]*₪/);
  });
});

describe('census-2022 in the switcher and legend', () => {
  it('has all its measures on one level (so the switcher names that level once)', () => {
    const census = groupLayers(manifest()).find((g) => g.dataset === 'census-2022')!;
    expect(census.measures!.length).toBeGreaterThan(1);
    expect(census.measures!.every((m) => m.items.length === 1 && m.items[0].label.en === census.measures![0].items[0].label.en)).toBe(true);
  });

  it('shows religiosity as nominal classes with labels', () => {
    const r = layer('census-2022-religiosity-localities').layer;
    expect(isOrdered(r.classification)).toBe(false);
    const { classes } = legendEntries(r.classification, 'ru');
    expect(classes.every((c) => c.label.length > 0 && c.short === '')).toBe(true);
  });
});
