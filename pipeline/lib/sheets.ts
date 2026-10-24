import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';

export type Row = unknown[];

/** A sheet (default: the first) as an array of rows; empty cells are null. Formula cells yield their cached value. */
export async function readSheetRows(file: string, sheet?: string): Promise<Row[]> {
  return (await (sheet ? readSheet(file, sheet, { trim: false }) : readSheet(file, { trim: false }))) as Row[];
}

/** CSV as objects keyed by header; every cell stays a string, so "0046" stays "0046". */
export function readCsv(file: string): Record<string, string>[] {
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true });
}

/** Fail loudly if CBS shifts the layout: some row above the data must contain `text` in column `col`. */
export function assertHeader(rows: Row[], col: number, text: string, file: string): void {
  const found = rows.slice(0, 20).some((r) => String(r[col] ?? '').toUpperCase().includes(text));
  if (!found) throw new Error(`${file}: expected header "${text}" in column ${col}; layout changed?`);
}

/** Numeric cell → number; '..' (CBS "not calculated") and blanks → null. */
export function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && value.trim() !== '..') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const isNumeric = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
