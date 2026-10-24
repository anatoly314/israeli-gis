import type { ExpressionSpecification } from 'maplibre-gl';
import type { Classification } from '../../pipeline/lib/contract.ts';
import { formatNumber, rangeLabel, spanLabel } from './format.ts';
import type { Lang } from './i18n.ts';

/** Feature property the viewer writes with the class key, so styling is the same for every classification. */
export const CLASS_PROP = '_k';
export const MISSING = 'na';

export interface ClassEntry {
  key: string;
  color: string;
  label: string;
  /** Short form for compact legends: the value for categorical classes, the lower bound for stepped ones. */
  short: string;
  description?: string;
}

/** Class key of a value: the categorical value, `s<i>` for the i-th stepped bin, or MISSING. */
export function classKey(c: Classification, value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING;
  if (c.type === 'categorical') return c.classes.some((k) => k.value === value) ? String(value) : MISSING;
  let i = 0;
  while (i < c.breaks.length && value >= c.breaks[i]) i++;
  return `s${i}`;
}

const classKeys = (c: Classification) => (c.type === 'categorical' ? c.classes.map((k) => String(k.value)) : c.colors.map((_, i) => `s${i}`));

export function colorOf(c: Classification, key: string): string {
  if (key === MISSING) return c.missing.color;
  if (c.type === 'categorical') return c.classes.find((k) => String(k.value) === key)?.color ?? c.missing.color;
  return c.colors[Number(key.slice(1))] ?? c.missing.color;
}

/** Legend text of one stepped bin (all numbers bidi-isolated, see format.ts). */
const binLabel = (breaks: number[], i: number, lang: Lang) => rangeLabel(breaks[i - 1], breaks[i], lang);

export function legendEntries(c: Classification, lang: Lang): { classes: ClassEntry[]; missing: ClassEntry } {
  const missing = { key: MISSING, color: c.missing.color, label: c.missing.label[lang], short: '', description: c.missing.description[lang] };
  if (c.type === 'categorical') {
    return {
      classes: c.classes.map((k) => ({ key: String(k.value), color: k.color, label: k.label[lang], short: formatNumber(k.value, lang) })),
      missing,
    };
  }
  const classes = c.colors.map((color, i) => ({
    key: `s${i}`,
    color,
    label: binLabel(c.breaks, i, lang),
    short: i === 0 ? rangeLabel(undefined, c.breaks[0], lang) : formatNumber(c.breaks[i - 1], lang),
  }));
  return { classes, missing };
}

/** Label of a class key, e.g. "Cluster 7" or "5 – 10". */
export function classLabel(c: Classification, key: string, lang: Lang): string {
  const { classes, missing } = legendEntries(c, lang);
  return classes.find((x) => x.key === key)?.label ?? missing.label;
}

/** `fill-color` / `circle-color` keyed on the class property. */
export function colorExpression(c: Classification): ExpressionSpecification {
  const keys = classKeys(c);
  return ['match', ['get', CLASS_PROP], ...keys.flatMap((k) => [k, colorOf(c, k)]), c.missing.color] as unknown as ExpressionSpecification;
}

/** Opacity that dims every feature outside `selected`; no selection means nothing is dimmed. */
export function highlightOpacity(selected: readonly string[], on: number, dimmed: number): ExpressionSpecification | number {
  if (!selected.length) return on;
  return ['case', ['in', ['get', CLASS_PROP], ['literal', [...selected]]], on, dimmed];
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function textOn(hex: string): '#000000' | '#ffffff' {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
}

export interface Preset {
  keys: string[];
  /** Covered range: "1–3" for clusters, "< 5" / "≥ 5" for stepped bins. */
  range: string;
}

/** First and last three classes, offered as one-click highlights when there are at least six. */
export function presets(c: Classification, lang: Lang): { low: Preset; high: Preset } | null {
  const keys = classKeys(c);
  if (keys.length < 6) return null;
  const range = (ks: string[]): string => {
    if (c.type === 'categorical') return spanLabel(Number(ks[0]), Number(ks[ks.length - 1]), lang);
    const first = Number(ks[0].slice(1));
    const last = Number(ks[ks.length - 1].slice(1));
    return rangeLabel(c.breaks[first - 1], c.breaks[last], lang);
  };
  const low = keys.slice(0, 3);
  const high = keys.slice(-3);
  return { low: { keys: low, range: range(low) }, high: { keys: high, range: range(high) } };
}
