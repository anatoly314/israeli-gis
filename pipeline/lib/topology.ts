import type { FeatureCollection } from 'geojson';
import mapshaper from 'mapshaper';

export interface TopologyOptions {
  /** TopoJSON object name. */
  object: string;
  /** Property to dissolve on; features sharing a value become one (multi)polygon. */
  dissolve: string;
  /** Extra properties carried through the dissolve (first value wins). */
  copyFields: string[];
  /** Numeric properties summed over the dissolved features. */
  sumFields?: string[];
  /** Share of removable vertices to keep, e.g. "5%". */
  simplify: string;
  /** Grid size per axis over the bounding box. */
  quantization: number;
}

export interface Topology {
  type: 'Topology';
  transform: { scale: [number, number]; translate: [number, number] };
  objects: Record<string, { type: 'GeometryCollection'; geometries: { type: string; properties?: Record<string, unknown> }[] }>;
  arcs: number[][][];
}

/** Dissolve → simplify → TopoJSON, all in mapshaper. Input must already be WGS84. */
export async function toTopoJSON(fc: FeatureCollection, o: TopologyOptions): Promise<Topology> {
  const cmd = [
    `-i in.json name=${o.object} encoding=utf8`,
    `-dissolve ${o.dissolve} copy-fields=${o.copyFields.join(',')}${o.sumFields?.length ? ` sum-fields=${o.sumFields.join(',')}` : ''}`,
    `-simplify ${o.simplify} keep-shapes`,
    '-clean',
    // fix-geometry reverts segments that quantization made intersect; those arcs keep a few decimal deltas.
    `-o out.json format=topojson quantization=${o.quantization} fix-geometry`,
  ].join(' ');
  const out = await mapshaper.applyCommands(cmd, { 'in.json': JSON.stringify(fc) });
  return JSON.parse(out['out.json'].toString()) as Topology;
}

/** Adds a GeometryCollection of Points, quantized with the topology's own transform. */
export function addPointObject(topo: Topology, name: string, points: { coordinates: [number, number]; properties: Record<string, unknown> }[]) {
  const { scale, translate } = topo.transform;
  topo.objects[name] = {
    type: 'GeometryCollection',
    geometries: points.map((p) => ({
      type: 'Point',
      coordinates: [Math.round((p.coordinates[0] - translate[0]) / scale[0]), Math.round((p.coordinates[1] - translate[1]) / scale[1])],
      properties: p.properties,
    })),
  };
}
