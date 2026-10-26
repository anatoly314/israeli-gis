import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { DatasetValues } from '../../pipeline/lib/contract.ts';
import { CLASS_PROP, MISSING, classKey } from './classify.ts';
import type { Layer, Level, Manifest } from './manifest.ts';

export type Props = Record<string, unknown> & { code: string; name_he: string; name_en: string; name_ru: string; placeholder: boolean };
export type BBox = [number, number, number, number];
type Area = Polygon | MultiPolygon;

export interface FeatureInfo {
  props: Props;
  bbox: BBox;
  /** Label / popup anchor: pole of inaccessibility of the largest part, or the placeholder point. */
  anchor: [number, number];
  /**
   * Size for ordering (label priority, search ties): residents (`population`, a contract geometry property)
   * plus the polygon area in square degrees, which only decides between places without residents.
   */
  size: number;
}

export interface LevelData {
  polygons: FeatureCollection<Area, Props>;
  markers: FeatureCollection<Point, Props>;
  features: Map<string, FeatureInfo>;
  bbox: BBox;
}

export interface LayerData {
  polygons: FeatureCollection<Area, Props>;
  markers: FeatureCollection<Point, Props>;
  labels: FeatureCollection<Point, Props>;
  values: DatasetValues;
  /** Features without the layer's value ("not calculated"); with none, the legend leaves out that class. */
  missing: number;
}

const ringArea = (r: Position[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
};

export function bboxOf(g: Area | Point): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (p: Position) => {
    if (p[0] < b[0]) b[0] = p[0];
    if (p[1] < b[1]) b[1] = p[1];
    if (p[0] > b[2]) b[2] = p[0];
    if (p[1] > b[3]) b[3] = p[1];
  };
  if (g.type === 'Point') add(g.coordinates);
  else for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) poly[0].forEach(add);
  return b;
}

export function areaOf(g: Area): number {
  const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return parts.reduce((sum, rings) => sum + ringArea(rings[0]) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
}

export const unionBBox = (boxes: BBox[]): BBox =>
  boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

/** Pole of inaccessibility of the largest polygon part: stays inside concave and multi-part shapes. */
export function labelPoint(g: Area): [number, number] {
  const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const largest = parts.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
  const [w, s, e, n] = bboxOf({ type: 'Polygon', coordinates: largest });
  const p = polylabel(largest, Math.max(e - w, n - s) / 200);
  return [p[0], p[1]];
}

export function decodeLevel(topo: Topology, level: Level): LevelData {
  const polygons = feature(topo, topo.objects[level.object]) as unknown as FeatureCollection<Area, Props>;
  const markers = feature(topo, topo.objects[level.placeholderObject]) as unknown as FeatureCollection<Point, Props>;
  const features = new Map<string, FeatureInfo>();
  for (const f of polygons.features) {
    // Read before the join: a dataset may have its own `population` field, which then wins in the joined copy.
    const size = (Number(f.properties.population) || 0) + areaOf(f.geometry);
    features.set(f.properties.code, { props: f.properties, bbox: bboxOf(f.geometry), anchor: labelPoint(f.geometry), size });
  }
  // Placeholder circles are invisible at country zoom: anchor and frame them by their marker points instead.
  const points = new Map<string, Position[]>();
  for (const m of markers.features) points.set(m.properties.code, [...(points.get(m.properties.code) ?? []), m.geometry.coordinates]);
  for (const [code, pts] of points) {
    const info = features.get(code);
    if (!info?.props.placeholder) continue;
    info.anchor = pts[0] as [number, number];
    info.bbox = unionBBox(pts.map((p) => bboxOf({ type: 'Point', coordinates: p })));
  }
  return { polygons, markers, features, bbox: unionBBox([...features.values()].map((f) => f.bbox)) };
}

/** A points layer's own FeatureCollection, shaped like a level: every point is a marker, values in its properties. */
export function decodePoints(fc: FeatureCollection<Point, Partial<Props>>): LevelData {
  const markers: FeatureCollection<Point, Props> = {
    type: 'FeatureCollection',
    features: fc.features.map((f, i) => {
      const code = String(f.properties?.code ?? i);
      const name = String(f.properties?.name_he ?? code);
      const props = { name_he: name, name_en: name, name_ru: name, ...f.properties, code, placeholder: false } as Props;
      return { ...f, properties: props };
    }),
  };
  const features = new Map<string, FeatureInfo>();
  for (const m of markers.features) {
    const c = m.geometry.coordinates as [number, number];
    features.set(m.properties.code, { props: m.properties, bbox: [c[0], c[1], c[0], c[1]], anchor: c, size: Number(m.properties.population) || 0 });
  }
  return { polygons: { type: 'FeatureCollection', features: [] }, markers, features, bbox: unionBBox([...features.values()].map((f) => f.bbox)) };
}

/** Codes of the points at exactly the same coordinates (a shared campus), keyed by each of their codes. */
export function colocated(level: LevelData): Map<string, string[]> {
  const bySpot = new Map<string, string[]>();
  for (const [code, f] of level.features) {
    const spot = f.anchor.join(',');
    bySpot.set(spot, [...(bySpot.get(spot) ?? []), code]);
  }
  const out = new Map<string, string[]>();
  for (const codes of bySpot.values()) if (codes.length > 1) for (const c of codes) out.set(c, codes);
  return out;
}

/** Copies each feature with its dataset record and class key; codes without a record become "not calculated". */
export function joinLayer(level: LevelData, values: DatasetValues, layer: Layer): LayerData {
  const points = layer.kind === 'points';
  const withValues = <G extends Area | Point>(f: Feature<G, Props>): Feature<G, Props> => {
    const v = values[f.properties.code];
    // Choropleth values come from the dataset record only: a geometry property of the same name (`population`,
    // residents 2020) must not stand in for a missing record or field. Points layers carry their values themselves.
    const value = points ? f.properties[layer.valueField] : v?.[layer.valueField];
    const props: Props = { ...f.properties, ...v, [CLASS_PROP]: classKey(layer.classification, typeof value === 'number' ? value : undefined) };
    if (!points) for (const field of layer.popup) if (!v || !(field.field in v)) delete props[field.field];
    return { ...f, properties: props };
  };
  const polygons = level.polygons.features.map(withValues);
  const markers = level.markers.features.map(withValues);
  // Placeholder markers repeat their polygon's code: count polygons, or the points of a points layer.
  const missing = (points ? markers : polygons).filter((f) => f.properties[CLASS_PROP] === MISSING).length;
  return {
    polygons: { type: 'FeatureCollection', features: polygons },
    markers: { type: 'FeatureCollection', features: markers },
    missing,
    labels: {
      type: 'FeatureCollection',
      features: polygons.map((f) => {
        const info = level.features.get(f.properties.code)!;
        // Bigger places win label collisions.
        return { type: 'Feature', geometry: { type: 'Point', coordinates: info.anchor }, properties: { ...f.properties, _w: info.size } };
      }),
    },
    values,
  };
}

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(url: URL): Promise<T> {
  const key = url.href;
  if (!cache.has(key)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

const levels = new Map<string, Promise<LevelData>>();

export function loadLevel(base: URL, level: Level): Promise<LevelData> {
  const key = new URL(level.file, base).href;
  if (!levels.has(key)) {
    const p = fetchJson<Topology>(new URL(level.file, base)).then((topo) => decodeLevel(topo, level));
    p.catch(() => levels.delete(key));
    levels.set(key, p);
  }
  return levels.get(key)!;
}

export const loadValues = (base: URL, layer: Layer) => fetchJson<DatasetValues>(new URL(layer.data, base));

const points = new Map<string, Promise<LevelData>>();

/** Geometry and values for any layer kind (cached). */
export async function loadLayerSource(base: URL, m: Manifest, layer: Layer): Promise<{ level: LevelData; values: DatasetValues }> {
  if (layer.kind === 'choropleth') {
    const [level, values] = await Promise.all([loadLevel(base, m.levels[layer.level]), loadValues(base, layer)]);
    return { level, values };
  }
  // By file: the measures of a points dataset share one file and one decoded copy.
  const key = new URL(layer.data, base).href;
  if (!points.has(key)) {
    const p = fetchJson<FeatureCollection<Point, Partial<Props>>>(new URL(layer.data, base)).then(decodePoints);
    p.catch(() => points.delete(key));
    points.set(key, p);
  }
  return { level: await points.get(key)!, values: {} };
}
