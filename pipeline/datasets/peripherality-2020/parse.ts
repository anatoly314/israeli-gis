import { authorityCode, toCode } from '../../lib/keys.ts';
import { assertHeader, isNumeric, num, readSheetRows, type Row } from '../../lib/sheets.ts';

export interface PeripheralityRecord {
  code: string;
  cluster: number;
  index: number;
  rank: number;
  population: number;
}

export interface LocalityRecord extends PeripheralityRecord {
  distance_km: number;
}

function base(code: string, r: Row, c: { pop: number; idx: number; rank: number; cluster: number }, file: string): PeripheralityRecord {
  const [cluster, index, rank, population] = [num(r[c.cluster]), num(r[c.idx]), num(r[c.rank]), num(r[c.pop])];
  if (cluster == null || index == null || rank == null || population == null) {
    throw new Error(`${file}: incomplete row for ${code}: ${JSON.stringify(r.slice(0, 17))}`);
  }
  if (!Number.isInteger(cluster) || cluster < 1 || cluster > 10) throw new Error(`${file}: cluster ${cluster} for ${code}`);
  if (!Number.isInteger(rank)) throw new Error(`${file}: non-integer rank ${rank} for ${code}`);
  // 4 decimals is far finer than any display needs; population is a whole-person count already.
  return { code, cluster, index: Math.round(index * 1e4) / 1e4, rank, population: Math.round(population) };
}

/**
 * Table 1 (24_22_420t1.xlsx, sheet "לוח 1"): 255 local authorities. Municipalities and local councils are keyed by
 * locality code; regional councils have no locality code and are keyed 5500 + council number (column 0).
 * Columns: 0 status, 1 code, 2–3 names, 4 population 2020, 5–8 components, 9 index, 10 rank, 11 cluster, 12 cluster 2015.
 */
export async function parseAuthorities(file: string): Promise<PeripheralityRecord[]> {
  const rows = await readSheetRows(file);
  assertHeader(rows, 1, 'CODE OF LOCALITY', file);
  return rows
    .filter((r) => isNumeric(r[0]) && isNumeric(r[9]) && isNumeric(r[11]))
    .map((r) => base(authorityCode(r[0] as number, toCode(r[1])), r, { pop: 4, idx: 9, rank: 10, cluster: 11 }, file));
}

/**
 * Table 2 (24_22_420t2.xlsx, sheet "לוח 2"): 1,213 localities, cities included, keyed by locality code.
 * Columns: 0 status, 1–2 RC names, 3 code, 4–5 names, 6 sub-district, 7 population 2020, 8 distance from the Tel Aviv
 * District boundary (km), 9–12 components, 13 index, 14 rank, 15 cluster, 16 cluster 2015.
 */
export async function parseLocalities(file: string): Promise<LocalityRecord[]> {
  const rows = await readSheetRows(file);
  assertHeader(rows, 3, 'CODE OF LOCALITY', file);
  return rows
    .filter((r) => isNumeric(r[3]) && isNumeric(r[13]))
    .map((r) => {
      const code = String(toCode(r[3]));
      const distance = num(r[8]);
      if (distance == null) throw new Error(`${file}: no distance for ${code}`);
      return { ...base(code, r, { pop: 7, idx: 13, rank: 14, cluster: 15 }, file), distance_km: Math.round(distance * 10) / 10 };
    });
}
