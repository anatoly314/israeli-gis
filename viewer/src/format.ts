import type { Lang } from './i18n.ts';

const LRI = '⁦';
const PDI = '⁩';

/**
 * Wraps text in a left-to-right isolate (LRI … PDI). Numbers, signs and comparison operators keep their order and
 * don't mirror inside Hebrew text, in HTML and in plain-text contexts (title attributes, map labels) alike.
 */
export const ltr = (s: string) => `${LRI}${s}${PDI}`;

/** Locale digits/grouping without the bidi marks Intl adds for Hebrew ("‎-0.111"). */
function plain(v: number, lang: Lang, decimals?: number) {
  const opts = decimals == null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return new Intl.NumberFormat(lang, opts).format(v).replace(/[‎‏؜]/g, '');
}

/** The one way the UI prints a number. */
export const formatNumber = (v: number, lang: Lang, decimals?: number) => ltr(plain(v, lang, decimals));

/** A bin of a stepped scale: "< hi", "lo – hi" or "≥ lo", isolated as a whole so "<" never mirrors. */
export function rangeLabel(lo: number | undefined, hi: number | undefined, lang: Lang): string {
  if (lo == null && hi != null) return ltr(`< ${plain(hi, lang)}`);
  if (hi == null && lo != null) return ltr(`≥ ${plain(lo, lang)}`);
  return ltr(`${plain(lo!, lang)} – ${plain(hi!, lang)}`);
}

/** "1–3" for a run of categorical values. */
export const spanLabel = (a: number, b: number, lang: Lang) => ltr(`${plain(a, lang)}–${plain(b, lang)}`);
