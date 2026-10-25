import fs from 'node:fs';
import path from 'node:path';
import { LEVEL_IDS } from './lib/contract.ts';
import { kb } from './lib/io.ts';
import { DIST_DIR } from './lib/paths.ts';
import { buildAll } from './run.ts';

// Build next to dist/data (same filesystem, so the swap is a rename) and publish only if everything passed.
const t0 = Date.now();
const staging = path.join(path.dirname(DIST_DIR), `.data-staging-${process.pid}`);
fs.rmSync(staging, { recursive: true, force: true });

let report;
try {
  report = await buildAll(staging);
} catch (err) {
  fs.rmSync(staging, { recursive: true, force: true });
  console.error(`\nbuild failed; dist/data left untouched.\n${(err as Error).message}`);
  process.exit(1);
}

const previous = `${DIST_DIR}.previous-${process.pid}`;
if (fs.existsSync(DIST_DIR)) fs.renameSync(DIST_DIR, previous);
fs.renameSync(staging, DIST_DIR);
fs.rmSync(previous, { recursive: true, force: true });

console.log(`datum shift check: max error ${report.datumErrorM.toFixed(3)} m over control points`);
console.log('\njoin report (table rows matched to geometry):');
for (const j of report.joins) {
  const parts = j.breakdown.map((b) => `${b.label} ${b.matched}/${b.rows}`).join(', ');
  console.log(`  ✓ ${j.label.padEnd(28)} ${`${j.matched}/${j.rows}`.padEnd(10)} ${parts ? `(${parts}) ` : ''}` +
    `— ${j.geometryWithoutData} ${j.level} features without data → "not calculated"`);
  for (const [code, why] of Object.entries(j.expectedUnmatched ?? {})) console.log(`      no polygon (expected): ${code} ${why}`);
}
for (const c of report.companions) {
  const layers = c.layers.map((l) => `${l.id} ${l.matched}/${l.rows}`).join(', ');
  console.log(
    `  ✓ ${c.label.padEnd(28)} ${`${c.matched}/${c.rows}`.padEnd(10)} — ${c.featuresMatched}/${c.features} ${c.level} features` +
      `${layers ? `, ${layers}` : ''}; ${c.withNeighborhoods} with neighborhoods, ${c.withStreets} with streets, ${c.withNeither} with neither`,
  );
  if (c.unmatched.length) console.log(`      unmatched: ${c.unmatched.join(', ')}`);
}

console.log('\nnames per level (features: ru from Wikidata / ru = en fallback / en is Hebrew because no source has one):');
for (const id of LEVEL_IDS) {
  const n = report.names[id];
  console.log(`  ${id.padEnd(24)} ${n.total - n.ruFallback}/${n.total} ru, ${n.ruFallback} fallback, ${n.enIsHebrew} Hebrew-only`);
}
console.log(
  `\nplaceholder circles: ${report.placeholders}; dropped from local authorities: ${report.dropped.noJurisdiction} ` +
    `no-jurisdiction polygons, ${report.dropped.noStatus} without municipal status`,
);

console.log(`\nreview: ${report.review.length} lone Wikidata items whose labels differ from the CBS name (re-check WIKIDATA_REJECT):`);
for (const line of report.review) console.log(`  review ${line}`);

console.log('\noutput (dist/data):');
for (const f of report.written) console.log(`  ${f.path.padEnd(48)} ${kb(f.bytes).padStart(8)}  gzip ${kb(f.gzipBytes).padStart(7)}`);
const joined = report.joins.reduce((n, j) => n + j.matched, 0);
console.log(
  `\nchecks passed: checksums OK (${report.checks.rawFiles} files), datum shift OK, joins OK (${joined} rows), ` +
    `geometry valid (${report.checks.validFeatures} features), manifest and terminology OK; done in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
