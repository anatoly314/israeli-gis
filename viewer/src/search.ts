import { LANGS, fillTemplate, type I18n, type Lang } from './i18n.ts';
import type { BBox, LevelData, Props } from './data.ts';
import { unionBBox } from './data.ts';
import { fieldItems } from './extras.ts';
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

/** Hebrew words without a leading article ה ("קרית היובל" → "קרית יובל"); words of two letters keep it. */
export const stripArticle = (normalized: string) => normalized.replace(/(^| )ה(?=\S\S)/g, '$1');

function viaKeys(items: string[], lang: Lang): NonNullable<SearchEntry['via']> {
  const keys = items.map(normalize);
  const stripped = keys.map(stripArticle);
  return { items, keys, stripped, skeletons: stripped.map(skeleton), lang };
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
  /**
   * Set on entries found through a searchable extra field (a neighborhood inside a statistical area) instead of
   * the place's own name: its items and their keys. Such entries rank after every direct name match.
   */
  via?: { items: string[]; keys: string[]; stripped: string[]; skeletons: string[]; lang: Lang };
  /** On a search result from `via`: the item that matched. */
  matched?: string;
  /**
   * On a group: `<level kind>:<parent code>`, the same on every vintage of a kind (a city's SAs in the 2011 and in
   * the 2022 division). Search lists one group per key, from the best-ranked level.
   */
  group?: string;
}

const namesOf = (p: Props): I18n => ({ he: p.name_he, en: p.name_en, ru: p.name_ru });
const keysOf = (names: I18n) => [...new Set(LANGS.map((l) => normalize(names[l])))];

function entry(level: string, code: string | null, codes: string[], names: I18n, needsDigit: boolean, bbox: BBox, size: number): SearchEntry {
  const keys = keysOf(names);
  return { level, code, codes, names, keys, skeletons: [...new Set(keys.map(skeleton))], needsDigit, bbox, size };
}

/** Entries for every feature of one level; built once per level, whatever layers use it. */
export function buildEntries(levelKey: string, level: Level | undefined, data: LevelData): SearchEntry[] {
  return [...nameEntries(levelKey, level, data), ...extraEntries(levelKey, level, data)];
}

/**
 * One entry per feature that has values in the level's `searchable` extra fields (all such fields together), so a
 * feature is listed once however many of its items match.
 */
function extraEntries(levelKey: string, level: Level | undefined, data: LevelData): SearchEntry[] {
  const fields = (level?.extraFields ?? []).filter((f) => f.searchable);
  if (!fields.length) return [];
  const out: SearchEntry[] = [];
  for (const [code, f] of data.features) {
    const items = [...new Set(fields.flatMap((x) => fieldItems(x, f.props)))];
    if (!items.length) continue;
    const names = {} as I18n;
    for (const l of LANGS) names[l] = level?.featureLabel ? fillTemplate(level.featureLabel[l], f.props, l) : namesOf(f.props)[l];
    out.push({
      level: levelKey,
      code,
      codes: [code],
      names,
      keys: [],
      skeletons: [],
      needsDigit: false,
      bbox: f.bbox,
      size: f.size,
      via: viaKeys(items, fields[0].textLang),
    });
  }
  return out;
}

function nameEntries(levelKey: string, level: Level | undefined, data: LevelData): SearchEntry[] {
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
  for (const [key, g] of groups) out.push({ ...entry(levelKey, null, g.codes, g.names, false, unionBBox(g.boxes), g.size), group: `${level.kind}:${key}` });
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

/** The query is one or more whole words of the key ("הדר" in "שכ הדר", not in "הדרים"). */
export const wholeWords = (key: string, q: string) => ` ${key} `.includes(` ${q} `);

/**
 * Ranked matches, in four bands:
 * 1. place names matching exactly or as a prefix;
 * 2. extra-field items (neighborhoods) containing the query as whole words ("הדר" → Hadar HaCarmel);
 * 3. other place-name matches (word prefix and weaker, e.g. "הדר" in "גן הדרום");
 * 4. other extra-field matches.
 * Within a band: match tier (a spelling variant counts at the tier of the plain match it mirrors), level rank,
 * plain before variant, bigger places first. Extra-field results carry the item that matched in `matched`.
 */
export function search(entries: readonly SearchEntry[], query: string, o: SearchOptions = {}): SearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const digit = /\d/.test(q);
  const qs = skeleton(q);
  const qh = stripArticle(q);
  const qhs = skeleton(qh);
  const looseOk = (s: string) => s.replace(/ /g, '').length >= 3;
  const rank = o.levelRank ?? (() => 0);
  const scored: { e: SearchEntry; band: number; tier: number; variant: number; level: number }[] = [];
  for (const e of entries) {
    if (e.via) {
      // Items match by whole-word tiers only (0–3, no substrings) and need 2+ letters. Like place names they also
      // match as spelling variants (נוה/נווה, קרית/קריית), and a word may drop its leading ה (קרית היובל).
      if (q.length < 2) continue;
      let best = -1;
      let tier = Infinity;
      let variant = 0;
      let whole = false;
      for (let i = 0; i < e.via.keys.length; i++) {
        const plain = [matchScore(e.via.keys[i], q), matchScore(e.via.stripped[i], qh)].filter((s) => s >= 0 && s <= 3);
        const loose = looseOk(qhs) ? matchScore(e.via.skeletons[i], qhs) : -1;
        const p = plain.length ? Math.min(...plain) : Infinity;
        const t = Math.min(p, loose >= 0 && loose <= 2 ? Math.max(loose, 1) : Infinity);
        if (t < tier) [tier, best, variant] = [t, i, p <= t ? 0 : 1];
        whole ||= wholeWords(e.via.keys[i], q) || wholeWords(e.via.stripped[i], qh);
      }
      if (best >= 0) scored.push({ e: { ...e, matched: e.via.items[best] }, band: whole ? 1 : 3, tier, variant, level: rank(e.level) });
      continue;
    }
    if (e.needsDigit && !digit) continue;
    const plain = Math.min(...e.keys.map((k) => matchScore(k, q)).filter((s) => s >= 0));
    // Variants need a skeleton of 3+ letters and a whole-key or word-prefix match: "haifa" (hf) or "tel aviv"
    // matching "abu tulul" by scattered word starts is noise.
    const loose = looseOk(qs) ? Math.min(...e.skeletons.map((k) => matchScore(k, qs)).filter((s) => s >= 0 && s <= 2)) : Infinity;
    // A variant can mirror a prefix or word match, never an exact one ("בארי" is not "באר").
    const tier = Math.min(plain, Math.max(loose, 1));
    if (tier === Infinity) continue;
    scored.push({ e, band: tier <= 1 ? 0 : 2, tier, variant: plain <= tier ? 0 : 1, level: rank(e.level) });
  }
  // Size only orders entries of one level: sizes on different levels are from different years (2020, census 2022).
  scored.sort((a, b) => a.band - b.band || a.tier - b.tier || a.level - b.level || a.variant - b.variant || b.e.size - a.e.size);
  const groups = new Set<string>();
  const unique = scored.filter(({ e }) => !e.group || (!groups.has(e.group) && groups.add(e.group)));
  return unique.slice(0, o.limit ?? 8).map((s) => s.e);
}
