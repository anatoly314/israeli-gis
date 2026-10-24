import { fetchIfMissing, verifyRawFile, type RawFile } from './lib/download.ts';
import { allRawFiles } from './run.ts';

const all = new Map<string, RawFile>();
for (const f of allRawFiles()) all.set(f.path, f);

const counts = { present: 0, downloaded: 0, failed: 0 };
for (const f of all.values()) {
  let result = await fetchIfMissing(f);
  if (result === 'present') {
    try {
      verifyRawFile(f);
    } catch (err) {
      console.error(`  ✗ ${(err as Error).message}`);
      result = 'failed';
    }
  }
  counts[result]++;
  if (result === 'downloaded') console.log(`  ↓ ${f.path}`);
}

console.log(`raw files: ${counts.present} present and verified, ${counts.downloaded} downloaded, ${counts.failed} failed`);
if (counts.failed) {
  console.error('Some files are missing or changed; see the messages above.');
  process.exitCode = 1;
}
