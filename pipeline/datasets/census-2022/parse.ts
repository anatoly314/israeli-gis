import { saKey, toCode } from '../../lib/keys.ts';
import { num, readSheetRows, type Row } from '../../lib/sheets.ts';

export interface CensusLocality {
  code: number;
  /** `pop_approx`: census population, rounded by CBS to the nearest 10 (stored with float noise, so re-rounded). */
  population: number;
  age_median?: number;
  age65_pct?: number;
  academic_pct?: number;
  wage_median?: number;
  rent_pct?: number;
  /** Main household religiosity code: 1 secular, 2 traditional, 3 religious/very religious, 4 Haredi, 6 other. */
  religiosity?: number;
}

export type CensusRecord = Omit<CensusLocality, 'code'>;

export interface CensusSa extends CensusRecord {
  /** SA-2022 key of the row's own area (`saKey(locality, StatArea)`). */
  code: string;
  locality: number;
  /**
   * Keys of the other SAs CBS folded into this row (`StatAreaCmb` "14+13+18" → 13, 18), too small to publish alone.
   * Empty for most rows.
   */
  members: string[];
}

/**
 * CBS "מפקד 2022 – נתונים נבחרים לפי יישובים ואזורים סטטיסטיים" (mifkad-2022.xlsx, 60 columns). Header labels in
 * row 2, codes in row 3. Empty cells (suppressed or unreliable estimates) are left out of the record, so the layer
 * shows them as "no data".
 */
async function readCensus(file: string) {
  const rows = await readSheetRows(file);
  const codes = (rows[2] ?? []).map((h) => String(h ?? '').trim());
  const col = (name: string) => {
    const i = codes.indexOf(name);
    if (i < 0) throw new Error(`${file}: column "${name}" not found in the code row`);
    return i;
  };
  const c = {
    code: col('LocalityCode'),
    sa: col('StatArea'),
    cmb: col('StatAreaCmb'),
    pop: col('pop_approx'),
    age: col('age_median'),
    age65: col('age65_pcnt'),
    academic: col('AcadmCert_pcnt'),
    wage: col('employeesAnnual_medWage'),
    rent: col('rent_pcnt'),
    // The headers of the religiosity code and name are swapped in this file (and in the data.gov.il CSV): the
    // column headed "_Name" holds the numeric code. Take whichever of the two holds numbers.
    relA: col('hh_MidatDatiyut'),
    relB: col('hh_MidatDatiyut_Name'),
  };
  const record = (r: Row, what: string): CensusRecord => {
    const population = num(r[c.pop]);
    if (population == null) throw new Error(`${file}: no population for ${what}`);
    const rel = typeof r[c.relB] === 'number' ? r[c.relB] : typeof r[c.relA] === 'number' ? r[c.relA] : null;
    // Cells carry float noise (490.00000000000006); CBS publishes percentages to 0.1 and wages to whole shekels.
    const opt = (key: keyof CensusRecord, v: unknown, digits = 1) => {
      const n = num(v);
      return n == null ? {} : { [key]: Math.round(n * 10 ** digits) / 10 ** digits };
    };
    return {
      population: Math.round(population / 10) * 10,
      ...opt('age_median', r[c.age]),
      ...opt('age65_pct', r[c.age65]),
      ...opt('academic_pct', r[c.academic]),
      ...opt('wage_median', r[c.wage], 0),
      ...opt('rent_pct', r[c.rent]),
      ...(rel != null && { religiosity: rel as number }),
    };
  };
  return { rows: rows.slice(3), c, record };
}

/** The locality rows (`StatArea` empty). */
export async function parseCensusLocalities(file: string): Promise<CensusLocality[]> {
  const { rows, c, record } = await readCensus(file);
  const out: CensusLocality[] = [];
  for (const r of rows) {
    if (r[c.sa] != null) continue; // statistical-area rows
    const code = toCode(r[c.code]);
    // 1,186 rows have no StatArea: 1,185 localities plus the national total ("כלל ארצי"), which has no code.
    if (code == null) continue;
    out.push({ code, ...record(r, String(code)) });
  }
  return out;
}

/**
 * The statistical-area rows (2022 division). `StatAreaCmb` lists the SAs a row covers, its own `StatArea` among them
 * ("3+1" on SA 3: SA 1 folded in; usually but not always first); it is the authoritative record of combined areas
 * (CBS's separate combined-SA list disagrees with the data rows for 18 SAs).
 */
export async function parseCensusSas(file: string): Promise<CensusSa[]> {
  const { rows, c, record } = await readCensus(file);
  const out: CensusSa[] = [];
  for (const r of rows) {
    if (r[c.sa] == null) continue;
    const locality = toCode(r[c.code]);
    const sa = toCode(r[c.sa]);
    if (locality == null || sa == null) throw new Error(`${file}: SA row without a locality or SA number`);
    const parts = String(r[c.cmb] ?? sa).split('+').map((s) => toCode(s));
    if (!parts.includes(sa) || parts.some((p) => p == null)) throw new Error(`${file}: StatAreaCmb "${r[c.cmb]}" does not include SA ${sa} (locality ${locality})`);
    const code = saKey(locality, sa);
    out.push({ code, locality, members: parts.filter((p) => p !== sa).map((p) => saKey(locality, p!)), ...record(r, code) });
  }
  return out;
}

/**
 * CBS's list of SA-2022 areas with no published census data (open land, industrial zones…). Locality code in column
 * B, SA number in C from the first row whose B cell is numeric; SA numbers carry float noise (2.000000000066393).
 */
export async function parseNotPublished(file: string): Promise<Set<string>> {
  const rows = await readSheetRows(file);
  if (!rows.some((r) => String(r[1] ?? '').includes('סמל יישוב'))) throw new Error(`${file}: header "סמל יישוב" not found; layout changed?`);
  const out = new Set<string>();
  for (const r of rows) {
    const locality = typeof r[1] === 'number' ? r[1] : null;
    if (locality == null) continue;
    const sa = num(r[2]);
    if (sa == null) throw new Error(`${file}: locality ${locality} without an SA number`);
    out.add(saKey(locality, Math.round(sa)));
  }
  return out;
}
