import { toCode } from '../../lib/keys.ts';
import { num, readSheetRows } from '../../lib/sheets.ts';

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

/**
 * CBS "מפקד 2022 – נתונים נבחרים לפי יישובים ואזורים סטטיסטיים" (mifkad-2022.xlsx, 60 columns): the locality rows
 * (`StatArea` empty). Header labels in row 2, codes in row 3. Empty cells (suppressed or unreliable estimates) are
 * left out of the record, so the layer shows them as "no data".
 */
export async function parseCensusLocalities(file: string): Promise<CensusLocality[]> {
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
  const out: CensusLocality[] = [];
  for (const r of rows.slice(3)) {
    if (r[c.sa] != null) continue; // statistical-area rows
    const code = toCode(r[c.code]);
    // 1,186 rows have no StatArea: 1,185 localities plus the national total ("כלל ארצי"), which has no code.
    if (code == null) continue;
    const population = num(r[c.pop]);
    if (population == null) throw new Error(`${file}: no population for ${code}`);
    const rel = typeof r[c.relB] === 'number' ? r[c.relB] : typeof r[c.relA] === 'number' ? r[c.relA] : null;
    // Cells carry float noise (490.00000000000006); CBS publishes percentages to 0.1 and wages to whole shekels.
    const opt = (key: keyof CensusLocality, v: unknown, digits = 1) => {
      const n = num(v);
      return n == null ? {} : { [key]: Math.round(n * 10 ** digits) / 10 ** digits };
    };
    out.push({
      code,
      population: Math.round(population / 10) * 10,
      ...opt('age_median', r[c.age]),
      ...opt('age65_pct', r[c.age65]),
      ...opt('academic_pct', r[c.academic]),
      ...opt('wage_median', r[c.wage], 0),
      ...opt('rent_pct', r[c.rent]),
      ...(rel != null && { religiosity: rel as number }),
    });
  }
  return out;
}
