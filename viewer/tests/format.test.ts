import { describe, expect, it } from 'vitest';
import { countText, formatNumber, ltr, rangeLabel, spanLabel } from '../src/format.ts';
import { manifest } from './fixtures.ts';

const LRI = '⁦';
const PDI = '⁩';

describe('count phrases (levels[*].countForms, picked by Intl.PluralRules)', () => {
  const forms = manifest().levels['statistical-areas-2011'].countForms!;
  const bare = (s: string) => s.replace(/[⁦⁩]/g, '');
  const ru = (n: number) => bare(countText(forms, n, 'ru'));

  it('chooses the Russian form by the CLDR rule', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map(ru)).toEqual([
      '1 участок',
      '2 участка',
      '5 участков',
      '11 участков',
      '21 участок',
      '22 участка',
      '25 участков',
      '111 участков',
    ]);
    expect(ru(169)).toBe('169 участков');
    expect(ru(1234)).toMatch(/^1\s234 участка$/);
  });

  it('chooses Hebrew and English singular and plural, the number isolated left-to-right', () => {
    expect([1, 2, 169].map((n) => bare(countText(forms, n, 'he')))).toEqual(['אזור אחד', '2 אזורים', '169 אזורים']);
    expect([1, 2, 169].map((n) => bare(countText(forms, n, 'en')))).toEqual(['1 area', '2 areas', '169 areas']);
    expect(countText(forms, 169, 'he')).toBe(`${LRI}169${PDI} אזורים`);
  });
});

describe('bidi-safe numbers', () => {
  it('isolates every number left-to-right and strips the marks Intl adds for Hebrew', () => {
    expect(new Intl.NumberFormat('he').format(-0.111)).toMatch(/^‎/); // the source of the old "0.111-"
    expect(formatNumber(-0.111, 'he', 3)).toBe(`${LRI}-0.111${PDI}`);
    expect(formatNumber(208757, 'he')).toBe(`${LRI}208,757${PDI}`);
    expect(formatNumber(-2.5, 'en', 2)).toBe(`${LRI}-2.50${PDI}`);
    expect(formatNumber(1632, 'ru')).toMatch(/^⁦1\s632⁩$/);
  });

  it('isolates ranges as a whole, signs and operators included', () => {
    expect(rangeLabel(undefined, -1, 'he')).toBe(`${LRI}< -1${PDI}`);
    expect(rangeLabel(20, undefined, 'he')).toBe(`${LRI}≥ 20${PDI}`);
    expect(rangeLabel(-1, 0, 'he')).toBe(`${LRI}-1 – 0${PDI}`);
    expect(rangeLabel(0.5, 1.25, 'ru')).toBe(`${LRI}0,5 – 1,25${PDI}`);
    expect(spanLabel(1, 3, 'he')).toBe(`${LRI}1–3${PDI}`);
    expect(ltr('x')).toBe(`${LRI}x${PDI}`);
  });
});
