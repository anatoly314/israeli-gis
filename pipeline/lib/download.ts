import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { raw } from './paths.ts';

export interface RawFile {
  /** Path under data/raw/. */
  path: string;
  url: string;
  /** Pinned content hash of the file at `path`, checked after download and before every build. */
  sha256: string;
  /**
   * Set when `path` is a gzip of the download (to keep large sources out of git): sha256 of the original download.
   * `download` checks it, then stores `gzipRaw(body)`; the build checks it again after gunzipping.
   */
  gunzipSha256?: string;
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

/**
 * Deterministic gzip (level 9) for stored raw sources: Node's zlib writes mtime 0; the OS byte is fixed to 3 (Unix)
 * so the same input gives the same bytes on every platform.
 */
export function gzipRaw(buf: Buffer): Buffer {
  const gz = zlib.gzipSync(buf, { level: 9 });
  gz[9] = 3;
  return gz;
}

/** Throws if a raw file is missing or its content differs from the pinned hash(es). */
export function verifyRawFile(f: RawFile): void {
  const file = raw(f.path);
  if (!fs.existsSync(file)) throw new Error(`data/raw/${f.path} is missing (run \`npm run download\`)`);
  const buf = fs.readFileSync(file);
  const got = sha256(buf);
  if (got !== f.sha256) {
    throw new Error(`data/raw/${f.path}: sha256 ${got} does not match the pinned ${f.sha256}. ` +
      'If the source was updated on purpose, update `sha256` in its RawFile entry.');
  }
  if (f.gunzipSha256) {
    const inner = sha256(zlib.gunzipSync(buf));
    if (inner !== f.gunzipSha256) throw new Error(`data/raw/${f.path}: gunzipped sha256 ${inner} does not match the pinned ${f.gunzipSha256}`);
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
    const downloaded = Buffer.from(await res.arrayBuffer());
    const got = sha256(downloaded);
    const expected = f.gunzipSha256 ?? f.sha256;
    // Live sources (Wikidata) change over time; keep the new copy aside instead of using it silently.
    if (got !== expected) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(`${dest}.unverified`, downloaded);
      throw new Error(`content changed upstream (sha256 ${got}); saved as ${f.path}.unverified for review`);
    }
    const body = f.gunzipSha256 ? gzipRaw(downloaded) : downloaded;
    if (f.gunzipSha256 && sha256(body) !== f.sha256) {
      throw new Error(`the source matches, but its gzip (sha256 ${sha256(body)}) differs from the pinned ${f.sha256} (zlib version?)`);
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
