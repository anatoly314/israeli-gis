import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, inject, it } from 'vitest';
import { DIST_DIR } from '../pipeline/lib/paths.ts';

function hashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const file = path.join(dir, rel);
    if (fs.statSync(file).isFile()) out[rel] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return out;
}

it('committed dist/data is exactly what the pipeline builds from data/raw (run `npm run build` if this fails)', () => {
  expect(fs.existsSync(DIST_DIR)).toBe(true);
  expect(hashes(DIST_DIR)).toEqual(hashes(inject('buildDir')));
});
