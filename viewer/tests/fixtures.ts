import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Topology } from 'topojson-specification';
import type { DatasetValues, Manifest } from '../../pipeline/lib/contract.ts';
import type { FeatureCollection, Point } from 'geojson';
import { decodeLevel, decodePoints, type Props } from '../src/data.ts';
import type { ChoroplethLayer, PointsLayer } from '../src/manifest.ts';

// The committed pipeline output; tests/dist-fresh.test.ts keeps it equal to a fresh build.
const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/data');
const read = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')) as T;

export const manifest = () => read<Manifest>('layers.json');

/** A points layer with its decoded file. */
export function pointsLayer(id: string) {
  const l = manifest().layers.find((x) => x.id === id) as PointsLayer;
  return { layer: l, data: decodePoints(read<FeatureCollection<Point, Partial<Props>>>(l.data)) };
}

export function layer(id: string) {
  const m = manifest();
  const l = m.layers.find((x) => x.id === id) as ChoroplethLayer;
  const level = m.levels[l.level];
  return { layer: l, level, data: decodeLevel(read<Topology>(level.file), level), values: read<DatasetValues>(l.data) };
}
