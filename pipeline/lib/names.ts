export interface Names {
  he: string;
  en: string;
  ru: string;
}

// \s covers NBSP (U+00A0) as well.
export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** CBS Hebrew names: trailing `*` marks localities with changes. */
export function cleanHe(s: unknown): string {
  return collapse(String(s ?? '')).replace(/\s*\*+$/, '');
}

/**
 * Title-cases CBS English that is all upper case ("KOKHAV YA'IR" → "Kokhav Ya'ir") or all lower case
 * ("sedot dan" → "Sedot Dan"); leaves mixed-case input alone.
 */
export function cleanEn(s: unknown): string {
  const v = collapse(String(s ?? ''));
  if (v !== v.toUpperCase() && v !== v.toLowerCase()) return v;
  return v.toLowerCase().replace(/(^|[\s\-(/])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

// Cyrillic plus spaces, hyphen, en dash (U+2013), apostrophes (U+0027, U+2019), dots, commas, parentheses, digits.
const CYRILLIC = /^[\p{Script=Cyrillic}\s\-\u{2013}'\u{2019}.,()0-9]+$/u;

/**
 * Russian label: drop stress marks (U+0301), disambiguators like "Рейхан (мошав)" and a "Региональный совет"
 * prefix (the he/en names don't carry one either); reject non-Cyrillic values.
 */
export function cleanRu(s: unknown): string | null {
  let v = collapse(String(s ?? '')).replace(/\u{301}/gu, '');
  v = v.replace(/\s*\([^)]*\)\s*$/, '').replace(/^(региональный|местный) совет\s+/iu, '').trim();
  if (!v || !CYRILLIC.test(v) || !/\p{Script=Cyrillic}/u.test(v)) return null;
  return v;
}

const FINAL_FORMS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/**
 * Loose Hebrew key for matching Wikidata labels to CBS names: drops council prefixes, parentheticals,
 * punctuation, final-letter forms and the vowel letters א/ו/י, so "באקה אל-גרבייה" ≈ "באקה אל-גרביה" and
 * "בוסתאן אל מרג'" ≈ "בוסתן אל-מרג'".
 */
export function heKey(s: string): string {
  return s
    .replace(/^(מועצה אזורית|מועצה מקומית|עיריית)\s+/, '')
    .replace(/\([^)]*\)/g, '')
    // Arabic gh is written both ע' and ג' (מע'אר / מגאר), with an apostrophe or a geresh (U+05F3).
    .replace(/ע['\u{5F3}]/gu, 'ג')
    .replace(/[^\u{5D0}-\u{5EA}]/gu, '')
    .replace(/[ךםןףץ]/g, (c) => FINAL_FORMS[c])
    .replace(/[אוי]/g, '');
}

export const enKey = (s: string) => s.toLowerCase().replace(/ regional council$/, '').replace(/[^a-z]/g, '');

/** Russian name if one is known, else English. No transliteration. */
export function withRuFallback(he: string, en: string, ru: string | null | undefined): Names & { ruIsFallback: boolean } {
  return ru ? { he, en, ru, ruIsFallback: false } : { he, en, ru: en, ruIsFallback: true };
}
