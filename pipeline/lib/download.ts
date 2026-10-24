import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { raw } from './paths.ts';

export interface RawFile {
  /** Path under data/raw/. */
  path: string;
  url: string;
  /** Pinned content hash, checked after download and before every build. */
  sha256: string;
  headers?: Record<string, string>;
  /** Shown when the automatic download fails. */
  manual?: string;
  /** Downloaded and committed for reference/tests, but `build` doesn't need it. */
  reference?: boolean;
}

// data.gov.il file downloads return CloudFront 403 to non-browser User-Agents (docs/data-sources.md §2).
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Wikimedia asks for a descriptive UA with contact info.
export const BOT_UA = 'israeli-gis-pipeline/0.1 (https://anatoly.dev)';

export function sparqlUrl(query: string): string {
  // CSV is negotiated through `Accept: text/csv`; a `format=csv` parameter yields XML.
  return `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
}

export const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

/** Throws if a raw file is missing or its content differs from the pinned hash. */
export function verifyRawFile(f: RawFile): void {
  const file = raw(f.path);
  if (!fs.existsSync(file)) throw new Error(`data/raw/${f.path} is missing (run \`npm run download\`)`);
  const got = sha256(fs.readFileSync(file));
  if (got !== f.sha256) {
    throw new Error(`data/raw/${f.path}: sha256 ${got} does not match the pinned ${f.sha256}. ` +
      'If the source was updated on purpose, update `sha256` in its RawFile entry.');
  }
}

export type DownloadResult = 'present' | 'downloaded' | 'failed';

export async function fetchIfMissing(f: RawFile): Promise<DownloadResult> {
  const dest = raw(f.path);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'present';
  try {
    const res = await fetch(f.url, { headers: f.headers, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (/text\/html|sparql-results\+xml/.test(type)) throw new Error(`got ${type} instead of the file`);
    const body = Buffer.from(await res.arrayBuffer());
    const got = sha256(body);
    // Live sources (Wikidata) change over time; keep the new copy aside instead of using it silently.
    if (got !== f.sha256) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(`${dest}.unverified`, body);
      throw new Error(`content changed upstream (sha256 ${got}); saved as ${f.path}.unverified for review`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.part`, body);
    fs.renameSync(`${dest}.part`, dest);
    return 'downloaded';
  } catch (err) {
    console.error(`  ✗ ${f.path}: ${(err as Error).message}`);
    console.error(`    Download it manually from ${f.url}`);
    if (f.manual) console.error(`    ${f.manual}`);
    console.error(`    and save it as data/raw/${f.path}`);
    return 'failed';
  }
}
