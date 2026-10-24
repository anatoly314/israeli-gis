import { RC_CODE_BASE, toCode } from '../lib/keys.ts';
import { cleanEn, cleanHe, cleanRu, collapse, enKey, heKey } from '../lib/names.ts';
import { readCsv, readSheetRows } from '../lib/sheets.ts';

export interface LocalityInfo {
  he: string;
  en: string;
  /** Municipal status from the CBS localities file: 0, 99, regional-council number, or null. */
  status: number | null;
  /** e.g. "מועצה אזורית מטה אשר" for regional-council members. */
  statusName: string;
}

/** CBS localities file (bycode2021.xlsx): locality code → names and municipal status. */
export async function readLocalitiesFile(file: string): Promise<Map<number, LocalityInfo>> {
  const rows = await readSheetRows(file);
  const header = rows[0].map((h) => String(h ?? '').trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${file}: column "${name}" not found`);
    return i;
  };
  const [cCode, cHe, cEn, cStatus, cStatusName] = [
    col('סמל יישוב'),
    col('שם יישוב'),
    col('שם יישוב באנגלית'),
    col('סמל מעמד מונציפאלי'),
    col('שם מעמד מונציפאלי'),
  ];
  const out = new Map<number, LocalityInfo>();
  for (const r of rows.slice(1)) {
    const code = toCode(r[cCode]);
    if (code == null) continue;
    out.set(code, { he: cleanHe(r[cHe]), en: cleanEn(r[cEn]), status: toCode(r[cStatus]), statusName: cleanHe(r[cStatusName]) });
  }
  return out;
}

/** Regional-council Hebrew names from the localities file, keyed 5500+n ("מועצה אזורית מטה אשר" → "מטה אשר"). */
export function regionalCouncilHe(localities: Map<number, LocalityInfo>): Map<number, string> {
  const out = new Map<number, string>();
  for (const l of localities.values()) {
    const m = /^מועצה אזורית\s+(.+)$/.exec(l.statusName);
    if (m && l.status != null) out.set(RC_CODE_BASE + l.status, m[1]);
  }
  return out;
}

export interface WikidataItem {
  item: string;
  he: string;
  en: string;
  /** Cleaned Russian name: the ru.wikipedia article title if there is one, else the ru label. */
  ru: string | null;
  /** Has P576 "dissolved, abolished or demolished". */
  dissolved: boolean;
}

const titleOf = (url: string | undefined): string | null => {
  const m = /\/wiki\/(.+)$/.exec(url ?? '');
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null;
};

/**
 * Wikidata items carrying P3466 (Israeli CBS municipal ID), grouped by locality code, or by 5500+n for
 * regional councils ("מא07" → 5507). The ru.wikipedia title is preferred over the ru label: labels are often
 * bot-made ("Маабара" for kibbutz Ma'abarot) or Latin.
 */
export function readWikidataItems(itemsCsv: string, councilsCsv: string): Map<number, WikidataItem[]> {
  const out = new Map<number, WikidataItem[]>();
  const seen = new Set<string>();
  const codeOf = (raw: string): number | null => {
    const v = raw.trim();
    const rc = /^מא(\d{1,2})$/.exec(v);
    if (rc) return RC_CODE_BASE + Number(rc[1]);
    return /^\d+$/.test(v) ? toCode(v) : null;
  };
  const rows: Record<string, string>[] = [...readCsv(itemsCsv), ...readCsv(councilsCsv).map((r) => ({ ...r, code: r.p3466 }))];
  for (const r of rows) {
    const code = codeOf(r.code ?? '');
    if (code == null || seen.has(`${r.item}|${code}`)) continue;
    seen.add(`${r.item}|${code}`);
    const item: WikidataItem = {
      item: r.item,
      he: collapse(r.he ?? ''),
      en: collapse(r.en ?? '').replace(/\s*\([^)]*\)$/, ''),
      ru: cleanRu(titleOf(r.ruwiki)) ?? cleanRu(r.ru),
      dissolved: !!r.dissolved,
    };
    out.set(code, [...(out.get(code) ?? []), item]);
  }
  return out;
}

/**
 * True if the item's Hebrew label matches the CBS name after normalisation, or its English label does.
 */
export function labelsMatch(c: WikidataItem, he: string, en: string): boolean {
  return (!!c.he && heKey(c.he) === heKey(he)) || (!!en && !!c.en && enKey(c.en) === enKey(en));
}

/**
 * Picks the Wikidata item for a CBS unit. A lone live item is taken as is: P3466 is curated, and its label often
 * names the place differently (מצדות יהודה / בית יתיר); the few wrong ones go on a reviewed reject list
 * (WIKIDATA_REJECT in index.ts). Labels only decide between several items sharing a code: Hebrew match first,
 * then English. Dissolved items are skipped unless nothing else carries the code and the Hebrew matches:
 * Wikidata marks some live places dissolved (Modi'in Illit has P576 = 1993).
 */
export function pickItem(all: WikidataItem[] | undefined, he: string, en: string): WikidataItem | null {
  const key = heKey(he);
  const heMatch = (c: WikidataItem) => !!c.he && heKey(c.he) === key;
  const live = (all ?? []).filter((c) => !c.dissolved);
  const candidates = live.length ? live : (all ?? []).filter(heMatch);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const score = (c: WikidataItem) => (heMatch(c) ? 2 : 0) + (labelsMatch(c, '', en) ? 1 : 0);
  const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
  return score(best) > 0 ? best : null;
}
