import { isLang, type Lang } from './i18n.ts';

/** View state kept in the query string; the map position lives in the hash (MapLibre `hash: true`). */
export interface UrlState {
  lang: Lang | null;
  layer: string | null;
  /** Highlighted class keys (see classify.ts). */
  hl: string[];
  /** Selected feature code. */
  feature: string | null;
  embed: boolean;
}

const KEY = /^[\w.-]+$/;

export function parseUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  const lang = p.get('lang');
  const layer = p.get('layer');
  const feature = p.get('f');
  return {
    lang: isLang(lang) ? lang : null,
    layer: layer && /^[a-z0-9-]+$/.test(layer) ? layer : null,
    hl: [...new Set((p.get('hl') ?? '').split(',').filter((k) => KEY.test(k)))],
    feature: feature && /^\d+$/.test(feature) ? feature : null,
    embed: p.get('embed') === '1',
  };
}

/**
 * The embed's "Open full map" link: the configured full-map page (`fullMapBase`), or this page's own path when none is
 * set, with the view's query minus `embed`, and the map position hash.
 */
export function fullMapHref(base: string, path: string, search: string, hash: string): string {
  return `${base || path}${serializeUrl({ ...parseUrl(search), embed: false }, search)}${hash}`;
}

/** Query string (with leading "?") for the state; unknown params already in `current` are kept. */
export function serializeUrl(s: UrlState, current = ''): string {
  const p = new URLSearchParams(current);
  const set = (k: string, v: string | null) => (v ? p.set(k, v) : p.delete(k));
  set('lang', s.lang);
  set('layer', s.layer);
  set('hl', s.hl.join(','));
  set('f', s.feature);
  set('embed', s.embed ? '1' : null);
  const q = p.toString().replace(/%2C/g, ',');
  return q ? `?${q}` : '';
}
