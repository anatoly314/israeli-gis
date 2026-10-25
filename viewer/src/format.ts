import type { CountForms } from '../../pipeline/lib/contract.ts';
import type { Lang } from './i18n.ts';

const LRI = '⁦';
const PDI = '⁩';

/**
 * Wraps text in a left-to-right isolate (LRI … PDI). Numbers, signs and comparison operators keep their order and
 * don't mirror inside Hebrew text, in HTML and in plain-text contexts (title attributes, map labels) alike.
 */
export const ltr = (s: string) => `${LRI}${s}${PDI}`;

/** Locale digits/grouping without the bidi marks Intl adds for Hebrew ("‎-0.111"). */
function plain(v: number, lang: Lang, decimals?: number, signed = false) {
  const opts: Intl.NumberFormatOptions = decimals == null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (signed) opts.signDisplay = 'exceptZero';
  return new Intl.NumberFormat(lang, opts).format(v).replace(/[‎‏؜]/g, '');
}

/** The one way the UI prints a number. */
export const formatNumber = (v: number, lang: Lang, decimals?: number) => ltr(plain(v, lang, decimals));

/**
 * A value already in percent: 2.5 → "2.5%"; `signed` adds "+" to positive values (growth: "+5.9%", "−17.6%" as the
 * locale writes it). Isolated as a whole, so sign, digits and "%" keep their order in Hebrew.
 */
export const formatPercent = (v: number, lang: Lang, decimals: number, signed = false) => ltr(`${plain(v, lang, decimals, signed)}%`);

/**
 * A bin of a stepped scale: "< hi", "lo – hi" or "≥ lo", isolated as a whole so "<" never mirrors. A `unit` ("%")
 * is written once, after the last number: "< -5%", "0 – 2%", "≥ 10%".
 */
export function rangeLabel(lo: number | undefined, hi: number | undefined, lang: Lang, unit = ''): string {
  if (lo == null && hi != null) return ltr(`< ${plain(hi, lang)}${unit}`);
  if (hi == null && lo != null) return ltr(`≥ ${plain(lo, lang)}${unit}`);
  return ltr(`${plain(lo!, lang)} – ${plain(hi!, lang)}${unit}`);
}

/**
 * A bound with its unit ("-5%"), for compact scales (the colour strip): thousands in the locale's compact notation
 * ("20K", "20 тыс."), so they fit a narrow cell.
 */
export function formatBound(v: number, lang: Lang, unit = ''): string {
  // A plain space before "тыс." lets a narrow cell break the line there.
  const n =
    Math.abs(v) >= 1000
      ? new Intl.NumberFormat(lang, { notation: 'compact' }).format(v).replace(/[‎‏؜]/g, '').replace(/ /g, ' ')
      : plain(v, lang);
  return ltr(`${n}${unit}`);
}

/**
 * "169 участков" / "169 אזורים" / "169 areas": the level's count phrase for `n`, picked by `Intl.PluralRules`
 * (falling back to `other`), with the number formatted like every other.
 */
export function countText(forms: CountForms, n: number, lang: Lang): string {
  const byCategory = forms[lang] as Partial<Record<string, string>> & { other: string };
  const form = byCategory[new Intl.PluralRules(lang).select(n)] ?? byCategory.other;
  return form.replace('{n}', formatNumber(n, lang));
}

/** "1–3" for a run of categorical values. */
export const spanLabel = (a: number, b: number, lang: Lang) => ltr(`${plain(a, lang)}–${plain(b, lang)}`);
