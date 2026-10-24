import { describe, expect, it } from 'vitest';
import type { Classification } from '../../pipeline/lib/contract.ts';
import { MISSING, classKey, classKeys, classLabel, colorExpression, colorOf, contrast, highlightOpacity, legendEntries, spanText, textOn } from '../src/classify.ts';
import { manifest } from './fixtures.ts';

/** Drops the LRI/PDI isolates so assertions read like the rendered text. */
const bare = (s: string) => s.replace(/[⁦⁩]/g, '');
const isolated = (s: string) => s.startsWith('⁦') && s.endsWith('⁩');

const missing = {
  label: { he: 'אין נתונים', en: 'No data', ru: 'Нет данных' },
  description: { he: '-', en: '-', ru: '-' },
  color: '#cccccc',
};
const stepped: Classification = { type: 'stepped', breaks: [10, 20], colors: ['#000000', '#777777', '#ffffff'], missing };
// The crime-rate shape the review used: negative bounds and six bins.
const crime: Classification = {
  type: 'stepped',
  breaks: [-1, 0, 5, 10, 20],
  colors: ['#2166ac', '#67a9cf', '#d1e5f0', '#fddbc7', '#ef8a62', '#b2182b'],
  missing,
};
const categorical = () => manifest().layers[0].classification;

describe('categorical (CBS clusters)', () => {
  it('keys a value by itself and anything else as missing', () => {
    const c = categorical();
    expect(classKey(c, 1)).toBe('1');
    expect(classKey(c, 10)).toBe('10');
    expect(classKey(c, 11)).toBe(MISSING);
    expect(classKey(c, undefined)).toBe(MISSING);
    expect(classKey(c, NaN)).toBe(MISSING);
  });

  it('takes colours from the manifest, missing grey for no data', () => {
    const c = categorical();
    expect(colorOf(c, '1')).toBe('#a50026');
    expect(colorOf(c, '10')).toBe('#313695');
    expect(colorOf(c, MISSING)).toBe('#c8c8c8');
  });

  it('builds a match expression on the class property', () => {
    const e = colorExpression(categorical()) as unknown[];
    expect(e.slice(0, 4)).toEqual(['match', ['get', '_k'], '1', '#a50026']);
    expect(e.at(-1)).toBe('#c8c8c8');
    expect(e).toHaveLength(2 + 20 + 1);
  });

  it('lists ten classes plus "not calculated" in each language, short values isolated', () => {
    const { classes, missing: m } = legendEntries(categorical(), 'en');
    expect(classes.map((c) => bare(c.short))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(classes.every((c) => isolated(c.short))).toBe(true);
    expect(classes[0].label).toBe('Cluster 1');
    expect(m.label).toBe('Not calculated');
    expect(legendEntries(categorical(), 'he').classes[2].label).toBe('אשכול 3');
    expect(classLabel(categorical(), '7', 'ru')).toBe('Кластер 7');
  });

  it('orders the slider classes low → high and labels a run of them', () => {
    expect(classKeys(categorical())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(bare(spanText(categorical(), '4', '7', 'he'))).toBe('4–7');
    expect(isolated(spanText(categorical(), '4', '7', 'he'))).toBe(true);
    expect(bare(spanText(categorical(), '5', '5', 'en'))).toBe('5');
  });
});

describe('stepped', () => {
  it('bins with the contract rule: below the first break, [b(i-1), b(i)), at or above the last', () => {
    expect([-5, 9.99, 10, 19.99, 20, 1e9].map((v) => classKey(stepped, v))).toEqual(['s0', 's0', 's1', 's1', 's2', 's2']);
    expect(classKey(stepped, undefined)).toBe(MISSING);
    expect(colorOf(stepped, 's1')).toBe('#777777');
    expect(colorOf(stepped, MISSING)).toBe('#cccccc');
  });

  it('labels bins as ranges, each one bidi-isolated as a whole so "<" never mirrors', () => {
    const { classes } = legendEntries(crime, 'he');
    expect(classes.map((c) => bare(c.label))).toEqual(['< -1', '-1 – 0', '0 – 5', '5 – 10', '10 – 20', '≥ 20']);
    expect(classes.every((c) => isolated(c.label))).toBe(true);
    // No bidi marks from Intl's Hebrew formatting leak in.
    expect(classes.some((c) => /[‎‏]/.test(c.label))).toBe(false);
    expect(classes.map((c) => bare(c.short))).toEqual(['< -1', '-1', '0', '5', '10', '20']);
  });

  it('labels a run of stepped bins by the values it covers', () => {
    expect(classKeys(crime)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    expect(bare(spanText(crime, 's0', 's2', 'en'))).toBe('< 5');
    expect(bare(spanText(crime, 's3', 's5', 'he'))).toBe('≥ 5');
    expect(bare(spanText(crime, 's1', 's3', 'en'))).toBe('-1 – 10');
    // The whole scale is open at both ends.
    expect(bare(spanText(crime, 's0', 's5', 'en'))).toBe('< -1 … ≥ 20');
  });

  it('colours by bin key', () => {
    expect(colorExpression(stepped)).toEqual(['match', ['get', '_k'], 's0', '#000000', 's1', '#777777', 's2', '#ffffff', '#cccccc']);
  });
});

describe('highlight and contrast', () => {
  it('dims everything outside the selection, and nothing when the selection is empty', () => {
    expect(highlightOpacity([], 0.8, 0.1)).toBe(0.8);
    expect(highlightOpacity(['1', '2'], 0.8, 0.1)).toEqual(['case', ['in', ['get', '_k'], ['literal', ['1', '2']]], 0.8, 0.1]);
  });

  it('picks readable text on swatches', () => {
    expect(textOn('#440154')).toBe('#ffffff');
    expect(textOn('#fde725')).toBe('#000000');
    expect(textOn('#c8c8c8')).toBe('#000000');
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });

  it('gives every RdYlBu class text with at least 4.5:1 contrast', () => {
    const rdylbu = ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'];
    const c = categorical();
    expect(c.type === 'categorical' ? c.classes.map((k) => k.color) : []).toEqual(rdylbu);
    for (const c of rdylbu) expect(contrast(c, textOn(c)), c).toBeGreaterThanOrEqual(4.5);
    // Dark ends and the two mid-dark ones take white text, the pale middle black.
    expect(rdylbu.map(textOn)).toEqual(['#ffffff', '#ffffff', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#ffffff', '#ffffff']);
  });
});
