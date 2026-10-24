import { LANGS, fillTemplate, type I18n } from './i18n.ts';
import type { BBox, LevelData, Props } from './data.ts';
import { unionBBox } from './data.ts';
import type { Level } from './manifest.ts';

/**
 * Search key: lower case; Hebrew maqaf → space, niqqud/cantillation, geresh/gershayim and every kind of quote removed;
 * ё and йо → е; hyphens, dashes and punctuation → space; Latin q → k and "kefar" → "kfar".
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/־/g, ' ')
    // Before NFKD, which would split ё and й into base letter + mark.
    .replace(/йо|ё/g, 'е')
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['"`´‘-‟׳״]/g, '')
    .replace(/[-‐-―_.,;:()/\\]+/g, ' ')
    .replace(/q/g, 'k')
    .replace(/\bkefar\b/g, 'kfar')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Looser key for spelling variants, on a normalized string: no vowels after the first letter of a word (Latin and
 * Cyrillic), b/v, w/v, kh/ch/h, tz/ts/z merged ("Kiryat Shmona" ≈ "Qiryat Shemona", "Беер Шева" ≈ "Беэр-Шева");
 * Hebrew without the vowel letters ו/י ("קרית" ≈ "קריית"). Doubled letters collapse; spaces stay.
 */
export function skeleton(normalized: string): string {
  return normalized
    .replace(/kh|ch/g, 'h')
    .replace(/tz|ts/g, 'z')
    .replace(/[wb]/g, 'v')
    .replace(/(\p{L})[וי]+/gu, '$1')
    .replace(/(\p{L})\1+/gu, '$1')
    .replace(/(\p{L})[aeiouyаеиоуыэюяьъй]+/gu, '$1')
    .replace(/(\p{L})\1+/gu, '$1');
}

/** One searchable place on one level; groups stand for all parts of a parent place (a city's statistical areas). */
export interface SearchEntry {
  /** Level id, or `layer:<id>` for a points layer. */
  level: string;
  /** Feature code, or null for a group. */
  code: string | null;
  codes: string[];
  names: I18n;
  keys: string[];
  skeletons: string[];
  /** Only matched when the query contains a digit (single parts of a parent place). */
  needsDigit: boolean;
  bbox: BBox;
  /** Residents, else area (see FeatureInfo.size); bigger first among equal matches. */
  size: number;
}

const namesOf = (p: Props): I18n => ({ he: p.name_he, en: p.name_en, ru: p.name_ru });
const keysOf = (names: I18n) => [...new Set(LANGS.map((l) => normalize(names[l])))];

function entry(level: string, code: string | null, codes: string[], names: I18n, needsDigit: boolean, bbox: BBox, size: number): SearchEntry {
  const keys = keysOf(names);
  return { level, code, codes, names, keys, skeletons: [...new Set(keys.map(skeleton))], needsDigit, bbox, size };
}

/** Entries for every feature of one level; built once per level, whatever layers use it. */
export function buildEntries(levelKey: string, level: Level | undefined, data: LevelData): SearchEntry[] {
  const out: SearchEntry[] = [];
  const parent = level?.parentCode;
  if (!parent) {
    for (const [code, f] of data.features) out.push(entry(levelKey, code, [code], namesOf(f.props), false, f.bbox, f.size));
    return out;
  }
  // Parts of a parent place share its name: one entry per parent, plus each part for queries that number it.
  const groups = new Map<string, { names: I18n; codes: string[]; boxes: BBox[]; size: number }>();
  for (const [code, f] of data.features) {
    const key = String(f.props[parent]);
    const g = groups.get(key) ?? { names: namesOf(f.props), codes: [], boxes: [], size: 0 };
    g.codes.push(code);
    g.boxes.push(f.bbox);
    g.size += f.size;
    groups.set(key, g);
    const labels = {} as I18n;
    for (const l of LANGS) labels[l] = level.featureLabel ? fillTemplate(level.featureLabel[l], f.props, l) : `${namesOf(f.props)[l]} ${code}`;
    out.push(entry(levelKey, code, [code], labels, true, f.bbox, f.size));
  }
  for (const g of groups.values()) out.push(entry(levelKey, null, g.codes, g.names, false, unionBBox(g.boxes), g.size));
  return out;
}

/**
 * Lower is better: 0 exact, 1 prefix, 2 word prefix, 3 every query word starts a word of the key, 4 substring
 * (also ignoring spaces); -1 no match.
 */
export function matchScore(key: string, q: string): number {
  if (!q) return -1;
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(` ${q}`)) return 2;
  const words = key.split(' ');
  if (q.split(' ').every((w) => words.some((k) => k.startsWith(w)))) return 3;
  if (key.includes(q) || key.replace(/ /g, '').includes(q.replace(/ /g, ''))) return 4;
  return -1;
}

export interface SearchOptions {
  /** Lower ranks first among equally good matches: the current layer's level is 0. */
  levelRank?: (level: string) => number;
  limit?: number;
}

/**
 * Ranked matches. Order: match tier (a spelling-variant match counts at the tier of the plain match it mirrors), then
 * level rank, then plain before variant, then bigger places first.
 */
export function search(entries: readonly SearchEntry[], query: string, o: SearchOptions = {}): SearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const digit = /\d/.test(q);
  const qs = skeleton(q);
  const rank = o.levelRank ?? (() => 0);
  const scored: { e: SearchEntry; tier: number; variant: number; level: number }[] = [];
  for (const e of entries) {
    if (e.needsDigit && !digit) continue;
    const plain = Math.min(...e.keys.map((k) => matchScore(k, q)).filter((s) => s >= 0));
    // Variants need a skeleton of 3+ letters and a whole-key or word-prefix match: "haifa" (hf) or "tel aviv"
    // matching "abu tulul" by scattered word starts is noise.
    const loose = qs.replace(/ /g, '').length >= 3 ? Math.min(...e.skeletons.map((k) => matchScore(k, qs)).filter((s) => s >= 0 && s <= 2)) : Infinity;
    // A variant can mirror a prefix or word match, never an exact one ("בארי" is not "באר").
    const tier = Math.min(plain, Math.max(loose, 1));
    if (tier === Infinity) continue;
    scored.push({ e, tier, variant: plain <= tier ? 0 : 1, level: rank(e.level) });
  }
  scored.sort((a, b) => a.tier - b.tier || a.level - b.level || a.variant - b.variant || b.e.size - a.e.size);
  return scored.slice(0, o.limit ?? 8).map((s) => s.e);
}
