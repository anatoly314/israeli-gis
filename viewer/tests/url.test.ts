import { describe, expect, it } from 'vitest';
import { fullMapBase } from '../src/config.ts';
import { fullMapHref, mapHash, parseUrl, serializeUrl, type UrlState } from '../src/url.ts';

describe('map position hash', () => {
  it('writes what MapLibre writes: zoom to 2 decimals, coordinates with precision by zoom', () => {
    // Hashes MapLibre 6.15 wrote for these cameras in the viewer.
    expect(mapHash(6.5612, 31.58612, 35.15688)).toBe('#6.56/31.586/35.157');
    expect(mapHash(13, 31.845978, 35.225661)).toBe('#13/31.84598/35.22566');
    expect(mapHash(11, 32.08, 34.78)).toBe('#11/32.08/34.78');
  });
});

describe('"Open full map" link', () => {
  const search = '?lang=he&layer=ses-2021-localities&hl=8-10&f=3000&embed=1';
  it('goes to the configured full-map page with the view (minus embed) and the hash', () => {
    expect(fullMapBase).toBe('https://anatoly.dev/maps/israel/');
    expect(fullMapHref(fullMapBase, '/israeli-gis/', search, '#9/31.77/35.21')).toBe(
      'https://anatoly.dev/maps/israel/?lang=he&layer=ses-2021-localities&hl=8-10&f=3000#9/31.77/35.21',
    );
  });
  // The builder only; main.ts passes an empty base on the dev server, `fullMapBase` in builds (preview, e2e, Pages).
  it('links to this page when given an empty base', () => {
    expect(fullMapHref('', '/israeli-gis/', search, '')).toBe('/israeli-gis/?lang=he&layer=ses-2021-localities&hl=8-10&f=3000');
    expect(fullMapHref('', '/', '?embed=1', '#7/31.5/35')).toBe('/#7/31.5/35');
  });
});

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
