import type { ExpressionSpecification } from 'maplibre-gl';
import type { Classification, PopupField } from '../../pipeline/lib/contract.ts';
import { formatBound, formatNumber, ltr, rangeLabel, spanLabel, type Unit } from './format.ts';
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

/** False for nominal categories (`ordered: false`): no low → high reading, no ranges, no range slider. */
export const isOrdered = (c: Classification) => !(c.type === 'categorical' && c.ordered === false);

/** Class keys in scale order (low → high), without "not calculated"; display order for nominal ones. */
export const classKeys = (c: Classification) => (c.type === 'categorical' ? c.classes.map((k) => String(k.value)) : c.colors.map((_, i) => `s${i}`));

export function colorOf(c: Classification, key: string): string {
  if (key === MISSING) return c.missing.color;
  if (c.type === 'categorical') return c.classes.find((k) => String(k.value) === key)?.color ?? c.missing.color;
  return c.colors[Number(key.slice(1))] ?? c.missing.color;
}

/** Legend text of one stepped bin (all numbers bidi-isolated, see format.ts). */
const binLabel = (breaks: number[], i: number, lang: Lang, unit: Unit) => rangeLabel(breaks[i - 1], breaks[i], lang, unit);

/**
 * Unit of a layer's values for scale labels, taken from the popup format of its `valueField`: "%" for `percent`,
 * the currency for `currency` (₪), none otherwise. Nothing dataset-specific: a new percent or money measure gets it.
 */
export function layerUnit(layer: { valueField: string; popup: PopupField[] }): Unit {
  const format = layer.popup.find((f) => f.field === layer.valueField)?.format;
  if (format?.type === 'percent') return '%';
  if (format?.type === 'currency') return { currency: format.currency, decimals: format.decimals };
  return '';
}

export function legendEntries(c: Classification, lang: Lang, unit: Unit = ''): { classes: ClassEntry[]; missing: ClassEntry } {
  const missing = { key: MISSING, color: c.missing.color, label: c.missing.label[lang], short: '', description: c.missing.description[lang] };
  if (c.type === 'categorical') {
    return {
      // Nominal class values are just codes: no short number on their swatches.
      classes: c.classes.map((k) => ({ key: String(k.value), color: k.color, label: k.label[lang], short: isOrdered(c) ? formatNumber(k.value, lang) : '' })),
      missing,
    };
  }
  const classes = c.colors.map((color, i) => ({
    key: `s${i}`,
    color,
    label: binLabel(c.breaks, i, lang, unit),
    short: i === 0 ? rangeLabel(undefined, c.breaks[0], lang, unit) : formatBound(c.breaks[i - 1], lang, unit),
  }));
  return { classes, missing };
}

/** Label of a class key, e.g. "Cluster 7", "5 – 10" or "0 – 2%". */
export function classLabel(c: Classification, key: string, lang: Lang, unit: Unit = ''): string {
  const { classes, missing } = legendEntries(c, lang, unit);
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

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour for a swatch: black or white, whichever contrasts more with `hex`. Works for any palette. */
export function textOn(hex: string): '#000000' | '#ffffff' {
  return contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * Text for a run of classes from `first` to `last` (keys, scale order): "4–7" or "4" for clusters; the covered
 * values for stepped bins ("< 5", "0 – 10", "≥ 5"). Bidi-isolated.
 */
export function spanText(c: Classification, first: string, last: string, lang: Lang, unit: Unit = ''): string {
  if (c.type === 'categorical') return first === last ? formatNumber(Number(first), lang) : spanLabel(Number(first), Number(last), lang);
  const lo = c.breaks[Number(first.slice(1)) - 1];
  const hi = c.breaks[Number(last.slice(1))];
  if (lo == null && hi == null) {
    const [a, b] = [rangeLabel(undefined, c.breaks[0], lang, unit), rangeLabel(c.breaks[c.breaks.length - 1], undefined, lang, unit)];
    return ltr(`${a} … ${b}`);
  }
  return rangeLabel(lo, hi, lang, unit);
}
