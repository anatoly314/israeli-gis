import type { MultiPolygon, Polygon, Position } from 'geojson';

/**
 * CBS stores 126 West Bank localities as identical 50 m circles (a 50-gon, 7833 m²) instead of a real
 * boundary; the layer has no attribute marking them. Detected by shape: a single ring whose vertices all lie
 * 50 ± 1 m from their mean.
 */
export const PLACEHOLDER_RADIUS_M = 50;

const M_PER_DEG_LAT = 110_950;

export function placeholderCentre(g: Polygon | MultiPolygon): [number, number] | null {
  const polys: Position[][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (polys.length !== 1 || polys[0].length !== 1) return null;
  const ring = polys[0][0].slice(0, -1);
  if (ring.length < 16) return null;
  const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const isCircle = ring.every((p) => {
    const r = Math.hypot((p[0] - lon) * mPerDegLon, (p[1] - lat) * M_PER_DEG_LAT);
    return Math.abs(r - PLACEHOLDER_RADIUS_M) < 1;
  });
  return isCircle ? [lon, lat] : null;
}
