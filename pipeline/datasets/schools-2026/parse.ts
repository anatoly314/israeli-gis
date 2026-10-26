import { collapse } from '../../lib/names.ts';
import { readCsv } from '../../lib/sheets.ts';

export interface SchoolRow {
  code: string;
  name: string;
  localityCode: string;
  stream: number;
  stage: number;
  status: number;
  gender?: number;
  special?: 1;
  /** Low geocoding precision: the school is placed at its locality's centre. */
  approx?: 1;
  x: number;
  y: number;
}

/** `SHLAV_CHINUH` 1–7 are schools; 0 and the rest are kindergartens, day-care and other frameworks. */
const SCHOOL_STAGES = new Set(['1', '2', '3', '4', '5', '6', '7']);

/**
 * Education stream from sector (`TEUR_MIGZAR`) and supervision (`TEUR_PIKOH1`): Jewish schools split by supervision
 * (1 state, 2 state-religious, 3 Haredi); Arab and Bedouin 4; Druze and Circassian 5.
 */
export function streamOf(sector: string, supervision: string): number {
  if (sector === 'יהודי') {
    const s = ({ ממלכתי: 1, 'ממלכתי דתי': 2, חרדי: 3 } as Record<string, number>)[supervision];
    if (s) return s;
  }
  if (sector === 'ערבי' || sector === 'בדואי') return 4;
  if (sector === 'דרוזי' || sector === 'צרקסי') return 5;
  throw new Error(`schools: unexpected sector/supervision "${sector}" / "${supervision}"`);
}

/**
 * `SHLAV_CHINUH` → 1 primary (1), 2 middle school (3), 3 high school incl. 7–12 (4 upper only, 2 middle + upper),
 * 4 all-through from primary (5 primary + middle, 6 primary + upper, 7 primary + middle + upper).
 */
export function stageOf(code: string): number {
  const s = ({ '1': 1, '3': 2, '4': 3, '2': 3, '5': 4, '6': 4, '7': 4 } as Record<string, number>)[code];
  if (!s) throw new Error(`schools: unexpected SHLAV_CHINUH "${code}"`);
  return s;
}

const STATUS: Record<string, number> = { רשמי: 1, 'מוכר שאיננו רשמי': 2, 'תרבותי-ייחודי': 3, פטור: 4 };
const GENDER: Record<string, number> = { בנים: 1, בנות: 2, מעורב: 3 };

/** mosdot_edu.csv: the 6,641 schools (of 34,898 institutions), with ITM coordinates. Throws on unknown codes. */
export function parseSchools(file: string): { rows: SchoolRow[]; duplicates: number } {
  const seen = new Set<string>();
  let duplicates = 0;
  const rows: SchoolRow[] = [];
  for (const r of readCsv(file)) {
    if (!SCHOOL_STAGES.has(r.SHLAV_CHINUH)) continue;
    const code = r.SEMEL_MOSAD.trim();
    if (seen.has(code)) {
      duplicates++;
      continue;
    }
    seen.add(code);
    const status = STATUS[r.TEUR_MAMAD];
    if (!status) throw new Error(`schools: unexpected legal status "${r.TEUR_MAMAD}" for ${code}`);
    const gender = GENDER[r.TEUR_HERKEV_UCHLOSIYA]; // 483 schools have "NULL": left out
    rows.push({
      code,
      name: collapse(r.SHEM_MOSAD),
      localityCode: String(Number(r.SEMEL_ISHUV_PNIM)),
      stream: streamOf(r.TEUR_MIGZAR, r.TEUR_PIKOH1),
      stage: stageOf(r.SHLAV_CHINUH),
      status,
      ...(gender && { gender }),
      ...(r.TEUR_SUG_CHINUCH === 'מיוחד' && { special: 1 as const }),
      ...(r.RAMAT_DIYUK_MIKUM === 'נמוכה' && { approx: 1 as const }),
      x: Number(r.X),
      y: Number(r.Y),
    });
  }
  return { rows, duplicates };
}
