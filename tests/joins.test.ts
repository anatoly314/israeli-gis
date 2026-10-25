import type { MultiPolygon, Polygon, Position } from 'geojson';
import { describe, expect, inject, it } from 'vitest';
import { LEVEL_IDS, type ChoroplethLayer } from '../pipeline/lib/contract.ts';
import { join } from '../pipeline/lib/dataset.ts';
import { invalidGeometries } from '../pipeline/lib/gdal.ts';
import { isRegionalCouncilCode, LOCAL_COUNCIL, MUNICIPALITY } from '../pipeline/lib/keys.ts';
import { readLocalitiesFile } from '../pipeline/boundaries/names.ts';
import { raw } from '../pipeline/lib/paths.ts';
import { files } from '../pipeline/datasets/ses-2021/index.ts';
import { parseAuthorities, parseLocalities, parseStatisticalAreas } from '../pipeline/datasets/ses-2021/parse.ts';
import { byCode, dataset, levelCodes, levelFeatures, manifest } from './dist.ts';

describe('SES 2021 joins against the built geometry', () => {
  it('matches 1641/1641 statistical areas', async () => {
    const codes = (await parseStatisticalAreas(raw(files.statisticalAreas))).map((r) => r.code);
    const j = join('sa', 'statistical-areas-2011', codes, levelCodes('statistical-areas-2011'));
    expect([j.matched, j.rows, j.unmatched]).toEqual([1641, 1641, []]);
    expect(j.geometryWithoutData).toBe(276);
  });

  it('matches 996/996 regional-council localities', async () => {
    const codes = (await parseLocalities(raw(files.localities))).map((r) => r.code);
    const j = join('loc', 'rc-localities-2011', codes, levelCodes('rc-localities-2011'));
    expect([j.matched, j.rows, j.unmatched]).toEqual([996, 996, []]);
    expect(j.geometryWithoutData).toBe(78);
  });

  it('matches 201/201 municipalities + local councils and 54/54 regional councils', () => {
    const report = inject('buildReport').joins.find((j) => j.level === 'local-authorities-2011')!;
    expect([report.matched, report.rows, report.geometryWithoutData]).toEqual([255, 255, 2]);
    expect(report.breakdown.map((b) => [b.label, b.matched, b.rows])).toEqual([
      ['municipalities + local councils', 201, 201],
      ['regional councils', 54, 54],
    ]);
  });
});

describe('dataset values equal the raw CBS rows', () => {
  // Hand-copied from the xlsx rows (t1 / t3 / t4), rounded as the contract says.
  const pinned: [string, string, { cluster: number; index: number; rank: number; population: number }][] = [
    ['statistical-areas-2011', '50000437', { cluster: 9, index: 2.4021, rank: 1632, population: 2685 }], // Tel Aviv SA 437
    ['statistical-areas-2011', '310006', { cluster: 2, index: -1.5756, rank: 144, population: 6704 }], // Ofaqim SA 6
    ['statistical-areas-2011', '310001', { cluster: 3, index: -0.6217, rank: 384, population: 5224 }], // Ofaqim SA 1
    ['statistical-areas-2011', '30000111', { cluster: 2, index: -1.7512, rank: 107, population: 2946 }], // Jerusalem SA 111
    ['rc-localities-2011', '539', { cluster: 2, index: -1.4236, rank: 29, population: 1262 }], // Rummane
    ['rc-localities-2011', '128', { cluster: 9, index: 1.7611, rank: 952, population: 317 }], // Gat Rimmon
    ['local-authorities-2011', '5568', { cluster: 1, index: -2.8646, rank: 1, population: 13290 }], // Neve Midbar RC
    ['local-authorities-2011', '587', { cluster: 10, index: 2.5867, rank: 255, population: 4051 }], // Savyon
    ['local-authorities-2011', '1192', { cluster: 1, index: -2.4533, rank: 2, population: 19665 }], // Ar'ara-BaNegev
  ];
  it.each(pinned)('%s %s', (level, code, expected) => {
    expect(dataset(`datasets/ses-2021/${level}.json`)[code]).toEqual(expected);
  });
});

describe('built outputs', () => {
  it('has one dataset row per table row, every key present in its geometry level', () => {
    const expected: Record<string, number> = {
      'ses-2021-local-authorities': 255,
      'ses-2021-localities': 996,
      'ses-2021-statistical-areas': 1641,
      'peripherality-2020-local-authorities': 255,
      'peripherality-2020-localities': 1213,
      'population-2024-size-local-authorities': 255,
      'population-2024-growth-local-authorities': 255,
      'population-2024-size-localities': 1216,
      'population-2024-growth-localities': 1216,
      'population-2024-group-localities': 1216,
      'population-2024-type-localities': 1216,
    };
    expect(manifest().layers.map((l) => l.id)).toEqual(Object.keys(expected));
    for (const layer of manifest().layers as ChoroplethLayer[]) {
      const values = dataset(layer.data);
      const codes = levelCodes(layer.level);
      expect(Object.keys(values)).toHaveLength(expected[layer.id]);
      expect(Object.keys(values).filter((c) => !codes.has(c))).toEqual([]);
    }
  });

  it('keeps every code a string and unique, and counts honest', () => {
    for (const level of LEVEL_IDS) {
      const fc = levelFeatures(level);
      const codes = fc.features.map((f) => f.properties.code);
      expect(codes.every((c) => typeof c === 'string' && /^\d+$/.test(c))).toBe(true);
      expect(new Set(codes).size).toBe(codes.length);
      expect(manifest().levels[level].featureCount).toBe(codes.length);
    }
    expect(Object.fromEntries(LEVEL_IDS.map((l) => [l, manifest().levels[l].featureCount]))).toEqual({
      'local-authorities-2011': 257,
      'localities-2011': 1283,
      'rc-localities-2011': 1074,
      'statistical-areas-2011': 1917,
    });
  });

  it('has only valid geometries (GEOS)', async () => {
    for (const level of LEVEL_IDS) expect(await invalidGeometries(levelFeatures(level), 'code')).toEqual([]);
  });

  it('gives every feature names in all three languages', () => {
    for (const level of LEVEL_IDS) {
      for (const f of levelFeatures(level).features) {
        for (const k of ['name_he', 'name_en', 'name_ru']) expect(typeof f.properties[k] === 'string' && f.properties[k] !== '').toBe(true);
      }
    }
  });

  it('carries clusters 1–10 only (cluster indices)', () => {
    for (const layer of manifest().layers.filter((l) => l.valueField === 'cluster')) {
      for (const v of Object.values(dataset(layer.data))) expect(v.cluster).toBeOneOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });
});

function inside([x, y]: Position, g: Polygon | MultiPolygon): boolean {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const inRing = (ring: Position[]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return polys.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
}

/** A vertex-average point that is inside the polygon for compact shapes; asserted below. */
function interiorPoint(g: Polygon | MultiPolygon): Position {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
  const pt = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  expect(inside(pt, g)).toBe(true);
  return pt;
}

describe('local-authority merge', () => {
  const authorities = byCode('local-authorities-2011');
  const localities = byCode('localities-2011');

  // There is no locality 4; 77 Ayelet HaShahar and 35 Gadot belong to HaGalil HaElyon (RC 1 → 5501).
  it.each(['77', '35'])('puts RC member locality %s inside HaGalil HaElyon (5501)', (code) => {
    expect(inside(interiorPoint(localities.get(code)!.geometry), authorities.get('5501')!.geometry)).toBe(true);
    expect(authorities.has(code)).toBe(false);
  });

  it('keeps municipalities and local councils as their own authority', () => {
    expect(authorities.get('5000')?.properties.name_en).toBe('Tel Aviv - Yafo');
    expect(inside(interiorPoint(localities.get('5000')!.geometry), authorities.get('5000')!.geometry)).toBe(true);
  });

  it('holds only municipalities/local councils (own code) and regional councils (55xx), never 99xx', async () => {
    const bycode = await readLocalitiesFile(raw('cbs-localities-file/bycode2021.xlsx'));
    const codes = [...authorities.keys()].map(Number);
    expect(codes.filter((c) => c >= 9900)).toEqual([]);
    const odd = codes.filter((c) => !isRegionalCouncilCode(c) && ![MUNICIPALITY, LOCAL_COUNCIL].includes(bycode.get(c)?.status as number));
    expect(odd).toEqual([]);
    expect(codes.filter(isRegionalCouncilCode)).toHaveLength(54);
  });
});
