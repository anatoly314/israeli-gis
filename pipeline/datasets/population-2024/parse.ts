import { toCode } from '../../lib/keys.ts';
import { num, readSheetRows } from '../../lib/sheets.ts';

export interface Locality2024 {
  code: number;
  /** Total residents at end-2024, foreigners included. */
  population: number;
  /** Israeli residents (total minus foreigners). */
  israelis: number;
  jewsOthers: number;
  arabs: number;
  /** CBS `דת יישוב`: 1 Jewish, 2 non-Jewish, 3 Bedouin tribe, 4 mixed. */
  religion: number;
  /** CBS `צורת יישוב שוטפת` (index2024.xlsx sheet "צורת יישוב"). */
  localityType: number;
  /** CBS `סמל רשות מקומית`: own code for municipalities/local councils, 55xx for regional-council members. */
  authority: number | null;
}

async function sheet(file: string): Promise<{ rows: unknown[][]; col: (name: string) => number }> {
  const rows = await readSheetRows(file);
  const header = rows[0].map((h) => String(h ?? '').trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${file}: column "${name}" not found`);
    return i;
  };
  return { rows: rows.slice(1), col };
}

/** bycode2024.xlsx: every locality with residents at end-2024 (places with an empty population cell are skipped). */
export async function parseLocalities2024(file: string): Promise<Locality2024[]> {
  const { rows, col } = await sheet(file);
  const c = {
    code: col('סמל יישוב'),
    population: col('סך הכל אוכלוסייה 2024'),
    israelis: col('סך הכל ישראלים 2024'),
    jewsOthers: col('יהודים ואחרים'),
    arabs: col('ערבים'),
    religion: col('דת יישוב'),
    type: col('צורת יישוב שוטפת'),
    authority: col('סמל רשות מקומית'),
  };
  const out: Locality2024[] = [];
  for (const r of rows) {
    const code = toCode(r[c.code]);
    const population = num(r[c.population]);
    if (code == null || !population) continue;
    const israelis = num(r[c.israelis]);
    const religion = toCode(r[c.religion]);
    const localityType = toCode(r[c.type]);
    if (israelis == null || religion == null || localityType == null) throw new Error(`${file}: incomplete row for ${code}`);
    out.push({
      code,
      population,
      israelis,
      // Empty group cells mean none of that group.
      jewsOthers: num(r[c.jewsOthers]) ?? 0,
      arabs: num(r[c.arabs]) ?? 0,
      religion,
      localityType,
      authority: toCode(r[c.authority]),
    });
  }
  return out;
}

export interface Locality2022 {
  code: number;
  /** Total residents at end-2022: census-based and, unlike 2023+, without foreigners, so comparable to 2024 Israelis. */
  population: number;
  /** CBS municipal status (0 municipality, 99 local council, RC number, or null). */
  status: number | null;
}

/** bycode2022.xlsx: populated localities with their 2022 total and municipal status. */
export async function parseLocalities2022(file: string): Promise<Locality2022[]> {
  const { rows, col } = await sheet(file);
  const [cCode, cPop, cStatus] = [col('סמל יישוב'), col('סך הכל אוכלוסייה 2022'), col('סמל מעמד מונציפאלי')];
  const out: Locality2022[] = [];
  for (const r of rows) {
    const code = toCode(r[cCode]);
    const population = num(r[cPop]);
    if (code == null || !population) continue;
    out.push({ code, population, status: toCode(r[cStatus]) });
  }
  return out;
}
