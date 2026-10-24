import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology as TopoSpec } from 'topojson-specification';
import { buildBoundaries, levelTopology, rawFiles as boundaryFiles, attribution, sources, type NameStats } from './boundaries/index.ts';
import { datasets } from './datasets/index.ts';
import { DatasetValues, LEVEL_IDS, Manifest, manifestJsonSchema, type Layer, type Level, type LevelId } from './lib/contract.ts';
import type { JoinReport } from './lib/dataset.ts';
import { verifyRawFile } from './lib/download.ts';
import { assertDatumShift, invalidGeometries } from './lib/gdal.ts';
import { writeOut, writeOutJson, type WrittenFile } from './lib/io.ts';

export interface BuildReport {
  datumErrorM: number;
  joins: JoinReport[];
  names: Record<LevelId, NameStats>;
  placeholders: number;
  dropped: { noJurisdiction: number; noStatus: number };
  review: string[];
  /** What the passed checks covered. */
  checks: { rawFiles: number; validFeatures: number };
  written: WrittenFile[];
}

export const allRawFiles = () => [...boundaryFiles, ...datasets.flatMap((d) => d.rawFiles)];

/**
 * raw → `outDir`. Throws, after writing whatever it got to, if a raw file fails its hash, a table code has no
 * geometry, a geometry is invalid, or the manifest breaks the contract; callers decide whether to publish.
 */
export async function buildAll(outDir: string): Promise<BuildReport> {
  const verified = allRawFiles().filter((f) => !f.reference);
  for (const f of verified) verifyRawFile(f);
  let validFeatures = 0;

  const datumErrorM = await assertDatumShift(1);
  const boundaries = await buildBoundaries();

  const written: WrittenFile[] = [];
  const levels = {} as Record<LevelId, Level>;
  const geometryCodes = {} as Record<LevelId, Set<string>>;

  for (const id of LEVEL_IDS) {
    const level = boundaries.levels[id];
    const topo = await levelTopology(level);
    const polygons = feature(topo as unknown as TopoSpec, topo.objects[level.meta.object] as never) as unknown as FeatureCollection;
    const codes = polygons.features.map((f) => String(f.properties?.code));
    geometryCodes[id] = new Set(codes);
    if (geometryCodes[id].size !== codes.length) throw new Error(`${id}: duplicate codes after dissolve`);

    const invalid = await invalidGeometries(polygons, 'code');
    if (invalid.length) {
      throw new Error(`${id}: ${invalid.length} invalid geometries, e.g. ${invalid.slice(0, 5).map((i) => `${i.id} ${i.reason}`).join('; ')}`);
    }
    validFeatures += codes.length;

    levels[id] = {
      ...level.meta,
      featureCount: codes.length,
      placeholderCount: polygons.features.filter((f) => f.properties?.placeholder === true).length,
    };
    written.push(writeOut(outDir, level.meta.file, JSON.stringify(topo)));
  }

  const layers: Layer[] = [];
  const joins: JoinReport[] = [];
  for (const d of datasets) {
    const out = await d.build({ geometryCodes });
    for (const [path, data] of Object.entries(out.files)) {
      DatasetValues.parse(data);
      written.push(writeOutJson(outDir, path, data));
    }
    layers.push(...out.layers);
    joins.push(...out.joins);
  }

  const unmatched = joins.filter((j) => j.unmatched.length);
  if (unmatched.length) {
    throw new Error(`Table codes without geometry:\n${unmatched.map((j) => `  ${j.label}: ${j.unmatched.join(', ')}`).join('\n')}`);
  }

  const manifest = Manifest.parse({ version: 1, levels, layers, attribution, sources } satisfies Manifest);
  written.push(writeOutJson(outDir, 'layers.json', manifest, true));
  written.push(writeOutJson(outDir, 'layers.schema.json', manifestJsonSchema(), true));

  return {
    datumErrorM,
    joins,
    names: boundaries.names,
    placeholders: boundaries.placeholders,
    dropped: boundaries.dropped,
    review: boundaries.review,
    checks: { rawFiles: verified.length, validFeatures },
    written,
  };
}
