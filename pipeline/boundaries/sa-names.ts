import { saKey, toCode } from '../lib/keys.ts';
import { collapse } from '../lib/names.ts';
import { readSheetRows } from '../lib/sheets.ts';

/**
 * A CBS comma-separated list as clean items: split on commas, trim and collapse whitespace, drop empty items,
 * dedupe keeping the first occurrence. Names are otherwise left exactly as CBS writes them. That includes its
 * abbreviations: "שכ" (שכונת/שכונה), "ש" (as in "ש נוה יעקב"), "שד" (שדרות) and street names in "surname first-name"
 * order ("בלבן מאיר"). Expanding them would mean guessing ("שכ" can stand for the construct or the plain noun, and
 * "ש" is ambiguous), the abbreviations appear in the CBS publications readers may compare against, and any
 * expansion would apply to some rows and not others.
 */
export function parseList(value: unknown): string[] {
  if (value == null) return [];
  const out: string[] = [];
  for (const part of String(value).split(',')) {
    const item = collapse(part);
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

export interface SaNames {
  neighborhoods: string[];
  streets: string[];
}

const HEADER = ['שם יישוב', 'סמל א"ס מלא', 'סמל יישוב', 'א"ס', 'רחובות עיקריים', 'שכונות'];

/**
 * CBS "main streets and neighbourhoods of statistical areas (2011 division)", sheet `table_1506`: SA key → lists.
 * Throws if the layout changes or a full SA code disagrees with locality*10000 + SA.
 */
export async function readSaNames(file: string): Promise<Map<string, SaNames>> {
  const rows = await readSheetRows(file, 'table_1506');
  const header = rows[0]?.map((h) => String(h ?? '').trim());
  if (JSON.stringify(header) !== JSON.stringify(HEADER)) throw new Error(`${file}: unexpected header ${JSON.stringify(header)}`);
  const out = new Map<string, SaNames>();
  for (const r of rows.slice(1)) {
    const full = toCode(r[1]);
    if (full == null) continue;
    const key = saKey(toCode(r[2])!, toCode(r[3])!);
    if (key !== String(full)) throw new Error(`${file}: SA code ${full} != ${r[2]}*10000+${r[3]}`);
    if (out.has(key)) throw new Error(`${file}: duplicate SA ${key}`);
    out.set(key, { streets: parseList(r[4]), neighborhoods: parseList(r[5]) });
  }
  return out;
}
