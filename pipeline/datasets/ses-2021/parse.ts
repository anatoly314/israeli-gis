import { authorityCode, isRegionalCouncilStatus, saKey, toCode } from '../../lib/keys.ts';
import { assertHeader, isNumeric, num, readSheetRows, type Row } from '../../lib/sheets.ts';

export interface IndexRecord {
  code: string;
  cluster: number;
  index: number;
  rank: number;
  population: number;
}

export interface AuthorityRecord extends IndexRecord {
  kind: 'municipality-or-local-council' | 'regional-council';
}

function record(code: string, r: Row, c: { pop: number; idx: number; rank: number; cluster: number }, file: string): IndexRecord {
  const cluster = num(r[c.cluster]);
  const index = num(r[c.idx]);
  const rank = num(r[c.rank]);
  const population = num(r[c.pop]);
  if (cluster == null || index == null || rank == null || population == null) {
    throw new Error(`${file}: incomplete row for ${code}: ${JSON.stringify(r.slice(0, 14))}`);
  }
  if (!Number.isInteger(cluster) || cluster < 1 || cluster > 10) throw new Error(`${file}: cluster ${cluster} for ${code}`);
  return {
    code,
    cluster,
    // The source carries ~15 significant digits; 4 decimals is far finer than any display needs.
    index: Math.round(index * 1e4) / 1e4,
    rank,
    // CBS index population is a weighted estimate with fractions.
    population: Math.round(population),
  };
}

/** Table A1 (L1): 201 municipalities/local councils keyed by locality code, 54 regional councils keyed 5500+n. */
export async function parseAuthorities(file: string): Promise<AuthorityRecord[]> {
  const rows = await readSheetRows(file);
  assertHeader(rows, 1, 'CODE OF LOCALITY', file);
  return rows
    .filter((r) => isNumeric(r[0]) && isNumeric(r[6]))
    .map((r) => {
      const status = r[0] as number;
      const code = authorityCode(status, toCode(r[1]));
      const kind = isRegionalCouncilStatus(status) ? 'regional-council' : 'municipality-or-local-council';
      return { ...record(code, r, { pop: 4, idx: 5, rank: 6, cluster: 7 }, file), kind };
    });
}

/** Table B (L2): localities within regional councils, keyed by locality code. */
export async function parseLocalities(file: string): Promise<IndexRecord[]> {
  const rows = await readSheetRows(file);
  assertHeader(rows, 5, 'CODE OF LOCALITY', file);
  return rows
    .filter((r) => isNumeric(r[5]))
    .map((r) => record(String(toCode(r[5])), r, { pop: 9, idx: 10, rank: 11, cluster: 12 }, file));
}

/** Table C (L3): statistical areas, keyed locality*10000 + area number. */
export async function parseStatisticalAreas(file: string): Promise<IndexRecord[]> {
  const rows = await readSheetRows(file);
  assertHeader(rows, 6, 'CODE OF STATISTICAL AREA', file);
  return rows
    .filter((r) => isNumeric(r[1]) && isNumeric(r[6]))
    .map((r) => record(saKey(toCode(r[1])!, toCode(r[6])!), r, { pop: 7, idx: 8, rank: 9, cluster: 10 }, file));
}
