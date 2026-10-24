import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface WrittenFile {
  path: string;
  bytes: number;
  gzipBytes: number;
}

/** Writes `relPath` under `outDir` and returns its raw and gzipped size. */
export function writeOut(outDir: string, relPath: string, content: string): WrittenFile {
  const file = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const buf = Buffer.from(content);
  return { path: relPath, bytes: buf.length, gzipBytes: zlib.gzipSync(buf, { level: 9 }).length };
}

export const writeOutJson = (outDir: string, relPath: string, data: unknown, pretty = false) =>
  writeOut(outDir, relPath, JSON.stringify(data, null, pretty ? 2 : undefined) + '\n');

export const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
