import type { MultiPolygon, Polygon, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import { CONTROL_POINTS, distanceM, itmToWgs84 } from '../pipeline/lib/gdal.ts';
import { levelFeatures } from './dist.ts';

/** Area-weighted centroid of the outer rings (fine at city scale). */
function centroid(g: Polygon | MultiPolygon): [number, number] {
  const polys: Position[][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let a = 0;
  let x = 0;
  let y = 0;
  for (const [ring] of polys) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      a += cross;
      x += (x0 + x1) * cross;
      y += (y0 + y1) * cross;
    }
  }
  return [x / (3 * a), y / (3 * a)];
}

describe('EPSG:2039 → EPSG:4326', () => {
  it('stays within 1 m of PROJ "Israel 1993 to WGS 84 (2)" on control points', async () => {
    const got = await itmToWgs84(CONTROL_POINTS.map((p) => p.itm));
    const errors = got.map((g, i) => distanceM(g, CONTROL_POINTS[i].wgs84));
    expect(Math.max(...errors)).toBeLessThan(1);
  });

  // Centroids computed in EPSG:2039 on the raw polygons, then transformed with pyproj (same EPSG operation).
  // Simplification moves a centroid by metres; a dropped datum shift would move it ~78 m.
  it.each([
    ['50000437', 'Tel Aviv SA 437', [34.7973703, 32.0855063]],
    ['30000111', 'Jerusalem SA 111', [35.2508036, 31.8398998]],
  ] as const)('places %s (%s) where PROJ does in the built output', (code, _name, ref) => {
    const sa = levelFeatures('statistical-areas-2011').features.find((f) => f.properties.code === code);
    expect(sa).toBeDefined();
    expect(distanceM(centroid(sa!.geometry), [ref[0], ref[1]])).toBeLessThan(10);
  });
});
