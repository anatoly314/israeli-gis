import fs from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { inject } from 'vitest';
import type { DatasetValues, LevelId, Manifest } from '../pipeline/lib/contract.ts';

/** Reads a file from the fresh build made in tests/global-setup.ts. */
export function readBuilt<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(inject('buildDir'), rel), 'utf8')) as T;
}

export const manifest = () => readBuilt<Manifest>('layers.json');

type Props = Record<string, unknown>;

export function levelTopology(level: LevelId) {
  return readBuilt<Topology>(manifest().levels[level].file);
}

export function levelFeatures(level: LevelId): FeatureCollection<Polygon | MultiPolygon, Props> {
  const meta = manifest().levels[level];
  const topo = levelTopology(level);
  return feature(topo, topo.objects[meta.object]) as FeatureCollection<Polygon | MultiPolygon, Props>;
}

export function placeholderPoints(level: LevelId): FeatureCollection<Point, Props> {
  const meta = manifest().levels[level];
  const topo = levelTopology(level);
  return feature(topo, topo.objects[meta.placeholderObject]) as FeatureCollection<Point, Props>;
}

export const levelCodes = (level: LevelId) => new Set(levelFeatures(level).features.map((f) => f.properties.code as string));

export const byCode = (level: LevelId) => new Map(levelFeatures(level).features.map((f) => [f.properties.code as string, f]));

export const dataset = (rel: string) => readBuilt<DatasetValues>(rel);
