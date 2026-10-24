// Code conventions (docs/data-sources.md §4, §6). All codes leave the pipeline as strings.

/** Municipal status values in CBS tables: 0 = municipality, 99 = local council, anything else = regional council number. */
export const MUNICIPALITY = 0;
export const LOCAL_COUNCIL = 99;

export const RC_CODE_BASE = 5500;

export function isRegionalCouncilStatus(status: number | null | undefined): status is number {
  return status != null && status !== MUNICIPALITY && status !== LOCAL_COUNCIL;
}

/** Statistical area key: locality_code * 10000 + area number within the locality (Tel Aviv SA 437 → "50000437"). */
export function saKey(localityCode: number, saNumber: number): string {
  if (!Number.isInteger(localityCode) || !Number.isInteger(saNumber) || saNumber < 1 || saNumber > 9999) {
    throw new Error(`Invalid SA key parts: locality=${localityCode} sa=${saNumber}`);
  }
  return String(localityCode * 10000 + saNumber);
}

/** Regional councils are keyed 5500 + council number, never by the bare number (it collides with locality codes). */
export function regionalCouncilCode(rcNumber: number): string {
  if (!Number.isInteger(rcNumber) || rcNumber < 1 || rcNumber > 99) {
    throw new Error(`Invalid regional council number: ${rcNumber}`);
  }
  return String(RC_CODE_BASE + rcNumber);
}

export function isRegionalCouncilCode(code: number): boolean {
  return code > RC_CODE_BASE && code < RC_CODE_BASE + 100;
}

/** Local-authority code for a locality: its own code for municipalities/local councils, 5500+n for regional-council members. */
export function authorityCode(status: number, localityCode: number | null): string {
  if (isRegionalCouncilStatus(status)) return regionalCouncilCode(status);
  if (localityCode == null) throw new Error(`Municipality/local council without locality code (status ${status})`);
  return String(localityCode);
}

/** CBS spreadsheets store codes as numeric cells; Wikidata stores them as zero-padded strings. */
export function toCode(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
