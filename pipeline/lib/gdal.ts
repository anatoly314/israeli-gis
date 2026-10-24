import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FeatureCollection, Point } from 'geojson';
import initGdalJs from 'gdal3.js/node.js';

/**
 * EPSG:2039 with an explicit 7-parameter shift to WGS84 (docs/data-sources.md §9): ~0.2 m from PROJ's best
 * EPSG operation. Reprojecting with the ESRI .prj alone drops the datum shift and lands ~78 m off.
 */
export const ITM_TOWGS84 =
  '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 ' +
  '+ellps=GRS80 +towgs84=23.772,17.49,17.859,-0.3132,-1.85274,1.67299,5.4262 +units=m +no_defs';

let gdalPromise: ReturnType<typeof initGdalJs> | null = null;

const quiet = (msg: string) => /GEOS warning/.test(msg);

async function viaGdal3js(input: string, args: string[], zipped: boolean): Promise<string> {
  gdalPromise ??= initGdalJs({
    logHandler: (msg) => quiet(msg) || console.log(msg),
    errorHandler: (msg) => quiet(msg) || console.error(msg),
  });
  const Gdal = await gdalPromise;
  const { datasets, errors } = await Gdal.open(input, [], zipped ? ['vsizip'] : []);
  if (!datasets.length) throw new Error(`gdal3.js could not open ${input}: ${errors.join('; ')}`);
  try {
    const out = await Gdal.ogr2ogr(datasets[0], args);
    return Buffer.from(await Gdal.getFileBytes(out)).toString('utf8');
  } finally {
    await Gdal.close(datasets[0]);
  }
}

function viaSystemOgr2ogr(input: string, args: string[], zipped: boolean): string {
  try {
    execFileSync('ogr2ogr', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'gdal3.js failed and no system GDAL was found. Install it (macOS: `brew install gdal`) so `ogr2ogr` is on PATH.',
    );
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'israeli-gis-'));
  const out = path.join(dir, 'out.geojson');
  try {
    execFileSync('ogr2ogr', [...args, out, zipped ? `/vsizip/${input}` : input], { stdio: ['ignore', 'ignore', 'inherit'] });
    return fs.readFileSync(out, 'utf8');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs ogr2ogr (gdal3.js, falling back to system GDAL) and returns the GeoJSON output. */
async function ogr2ogr<T extends FeatureCollection>(input: string, args: string[], zipped = false): Promise<T> {
  let text: string;
  try {
    text = await viaGdal3js(input, args, zipped);
  } catch (err) {
    console.warn(`gdal3.js failed (${(err as Error).message}); trying system ogr2ogr`);
    text = viaSystemOgr2ogr(input, args, zipped);
  }
  return JSON.parse(text) as T;
}

export interface ToWgs84Options {
  /** Path is a .zip (e.g. a zipped FileGDB) and must be read through /vsizip/. */
  zipped?: boolean;
  /** Attribute fields to keep. */
  select?: string[];
  /** Force MultiPolygon output, so a polygon layer can never come back as GeometryCollections. */
  multiPolygon?: boolean;
}

/** Reads an EPSG:2039 vector file and returns it as WGS84 GeoJSON. */
export function toWgs84<T extends FeatureCollection = FeatureCollection>(input: string, opts: ToWgs84Options = {}): Promise<T> {
  return ogr2ogr<T>(
    input,
    [
      '-f', 'GeoJSON',
      '-s_srs', ITM_TOWGS84,
      '-t_srs', 'EPSG:4326',
      ...(opts.select ? ['-select', opts.select.join(',')] : []),
      ...(opts.multiPolygon ? ['-nlt', 'MULTIPOLYGON'] : []),
      // No RFC7946/COORDINATE_PRECISION: with them the GeoJSON writer repairs rounded rings into
      // GeometryCollections with line slivers. Full precision is fine since mapshaper quantizes later.
    ],
    opts.zipped,
  );
}

/** GEOS validity (OGC simple features) per feature; returns the `idField` and reason of each invalid one. */
export async function invalidGeometries(fc: FeatureCollection, idField: string): Promise<{ id: string; reason: string }[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'israeli-gis-'));
  const file = path.join(dir, 'check.geojson');
  try {
    fs.writeFileSync(file, JSON.stringify(fc));
    const out = await ogr2ogr(file, [
      '-f', 'GeoJSON',
      '-dialect', 'SQLite',
      '-sql', `SELECT "${idField}" AS id, ST_IsValidReason(geometry) AS reason FROM "check" WHERE NOT ST_IsValid(geometry)`,
    ]);
    return out.features.map((f) => ({ id: String(f.properties?.id), reason: String(f.properties?.reason) }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Reprojects ITM (EPSG:2039) points through the exact same path as the geometry. */
export async function itmToWgs84(points: [number, number][]): Promise<[number, number][]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'israeli-gis-'));
  const file = path.join(dir, 'points.geojson');
  try {
    const fc: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: points.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } })),
    };
    fs.writeFileSync(file, JSON.stringify(fc));
    const out = await toWgs84<FeatureCollection<Point>>(file);
    return out.features.map((f) => f.geometry.coordinates as [number, number]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Great-circle distance in metres. */
export function distanceM([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

/**
 * Control points in EPSG:2039 with WGS84 positions from PROJ 9 via pyproj, operation
 * "Israel 1993 to WGS 84 (2)" (EPSG accuracy 0.5 m).
 */
export const CONTROL_POINTS: { itm: [number, number]; wgs84: [number, number] }[] = [
  { itm: [180000, 665000], wgs84: [34.786537704, 32.077601922] },
  { itm: [219529.584, 626907.39], wgs84: [35.205213782, 31.734763037] },
  { itm: [220000, 632000], wgs84: [35.210180653, 31.780690305] },
  { itm: [200000, 740000], wgs84: [34.996823938, 32.754431523] },
  { itm: [180000, 560000], wgs84: [34.790745075, 31.130668095] },
];

/** Throws if the reprojection drifts more than `maxErrorM` from the PROJ reference. */
export async function assertDatumShift(maxErrorM = 1): Promise<number> {
  const got = await itmToWgs84(CONTROL_POINTS.map((p) => p.itm));
  const worst = Math.max(...got.map((g, i) => distanceM(g, CONTROL_POINTS[i].wgs84)));
  if (worst > maxErrorM) throw new Error(`Reprojection error ${worst.toFixed(2)} m exceeds ${maxErrorM} m`);
  return worst;
}
