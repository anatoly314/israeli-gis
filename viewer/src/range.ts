import { MISSING } from './classify.ts';

/**
 * Highlight selection ↔ slider range. `keys` are a classification's class keys in scale order (low → high), without
 * "not calculated", which the slider never covers.
 */
export interface SliderState {
  /** Handle positions, indices into `keys`. */
  min: number;
  max: number;
  /** The selection is not one run of classes (gaps, or "not calculated" included): the handles only frame it. */
  custom: boolean;
}

/** Every class selected and "not calculated" not: that is the same as no highlight, so it becomes []. */
export function normalizeSelection(selected: readonly string[], keys: readonly string[]): string[] {
  const unique = [...new Set(selected)];
  return !unique.includes(MISSING) && keys.every((k) => unique.includes(k)) ? [] : unique;
}

export function selectionToRange(keys: readonly string[], selected: readonly string[]): SliderState {
  const idx = selected.map((k) => keys.indexOf(k)).filter((i) => i >= 0);
  if (!idx.length) return { min: 0, max: keys.length - 1, custom: selected.length > 0 };
  const min = Math.min(...idx);
  const max = Math.max(...idx);
  const contiguous = idx.length === max - min + 1 && !selected.includes(MISSING);
  return { min, max, custom: !contiguous };
}

/** The selection a handle drag produces: the classes between the handles; the full range means no highlight. */
export function rangeToSelection(keys: readonly string[], min: number, max: number): string[] {
  const [a, b] = [Math.max(0, Math.min(min, max)), Math.min(keys.length - 1, Math.max(min, max))];
  if (a === 0 && b === keys.length - 1) return [];
  return keys.slice(a, b + 1);
}

// "4-7", "s1-s3", "-3--1": a range token; anything else is a single key.
const RANGE = /^(-?[^-]+)-(-?[^-]+)$/;

/** URL `hl` tokens → class keys: ranges expand over `keys` (scale order), single keys pass through if known. */
export function expandHl(tokens: readonly string[], keys: readonly string[], ordered = true): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    // Nominal classes have no order, so a range means nothing: only single keys count.
    const m = ordered ? RANGE.exec(tok) : null;
    const [a, b] = m ? [keys.indexOf(m[1]), keys.indexOf(m[2])] : [-1, -1];
    if (m && a >= 0 && b >= 0) out.push(...keys.slice(Math.min(a, b), Math.max(a, b) + 1));
    else if (tok === MISSING || keys.includes(tok)) out.push(tok);
  }
  return normalizeSelection(out, keys);
}

/**
 * Class keys → URL `hl` tokens: runs of two or more consecutive classes become "first-last" ("4-7", "1,5,9",
 * "4-7,na"). Nominal classes (`ordered` false) are always listed one by one ("1,4").
 */
export function compactHl(selected: readonly string[], keys: readonly string[], ordered = true): string[] {
  const idx = [...new Set(selected.map((k) => keys.indexOf(k)).filter((i) => i >= 0))].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (ordered && j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    out.push(j > i ? `${keys[idx[i]]}-${keys[idx[j]]}` : keys[idx[i]]);
    i = j + 1;
  }
  if (selected.includes(MISSING)) out.push(MISSING);
  return out;
}
