import { describe, expect, it } from 'vitest';
import { formatNumber, ltr, rangeLabel, spanLabel } from '../src/format.ts';

const LRI = '⁦';
const PDI = '⁩';

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
