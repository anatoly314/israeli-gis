import { describe, expect, it } from 'vitest';
import { parseUrl, serializeUrl, type UrlState } from '../src/url.ts';

describe('URL state', () => {
  it('parses every param', () => {
    expect(parseUrl('?lang=ru&layer=ses-2021-localities&hl=1,2,na&f=5000&embed=1')).toEqual({
      lang: 'ru',
      layer: 'ses-2021-localities',
      hl: ['1', '2', 'na'],
      feature: '5000',
      embed: true,
    });
  });

  it('defaults and drops invalid values', () => {
    expect(parseUrl('')).toEqual({ lang: null, layer: null, hl: [], feature: null, embed: false });
    expect(parseUrl('?lang=fr&layer=<x>&hl=1,,<b>,1&f=abc&embed=yes')).toEqual({ lang: null, layer: null, hl: ['1'], feature: null, embed: false });
  });

  it('round-trips and keeps foreign params', () => {
    const s: UrlState = { lang: 'he', layer: 'ses-2021-statistical-areas', hl: ['8', '9', '10'], feature: null, embed: true };
    const q = serializeUrl(s, '?utm_source=blog&f=123');
    expect(q).toBe('?utm_source=blog&lang=he&layer=ses-2021-statistical-areas&hl=8,9,10&embed=1');
    expect(parseUrl(q)).toEqual(s);
  });

  it('omits empty state', () => {
    expect(serializeUrl({ lang: null, layer: null, hl: [], feature: null, embed: false })).toBe('');
  });
});
