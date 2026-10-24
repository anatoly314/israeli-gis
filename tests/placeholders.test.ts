import { describe, expect, inject, it } from 'vitest';
import { LEVEL_IDS } from '../pipeline/lib/contract.ts';
import { distanceM } from '../pipeline/lib/gdal.ts';
import { byCode, levelFeatures, manifest, placeholderPoints } from './dist.ts';

describe('West Bank placeholder circles', () => {
  it('finds all 126 in the source layer', () => {
    expect(inject('buildReport').placeholders).toBe(126);
  });

  // 12 of the 126 are local councils (Efrat, Qiryat Arba, ...), the rest regional-council members.
  it.each([
    ['localities-2011', 126],
    ['rc-localities-2011', 114],
  ] as const)('flags them and ships one point per circle on %s (%i)', (level, count) => {
    const flagged = levelFeatures(level).features.filter((f) => f.properties.placeholder === true);
    expect(flagged).toHaveLength(count);
    expect(manifest().levels[level].placeholderCount).toBe(count);
    const points = placeholderPoints(level).features;
    expect(points).toHaveLength(count);
    expect(new Set(points.map((p) => p.properties.code))).toEqual(new Set(flagged.map((f) => f.properties.code)));
  });

  it('marks West Bank regional councils, made only of circles, as placeholders too', () => {
    const authorities = byCode('local-authorities-2011');
    for (const rc of ['5572', '5573', '5574', '5575', '5576', '5578']) expect(authorities.get(rc)?.properties.placeholder).toBe(true);
    expect(authorities.get('5501')?.properties.placeholder).toBe(false);
    expect(authorities.get('3650')?.properties.placeholder).toBe(true); // Efrat local council
  });

  it('puts each point at its circle centre and has a points object on every level', () => {
    // After simplification the circle is a triangle, so compare against its vertex mean (well within 50 m).
    const efrat = byCode('localities-2011').get('3650')!.geometry;
    const ring = (efrat.type === 'Polygon' ? efrat.coordinates[0] : efrat.coordinates[0][0]).slice(0, -1);
    const mean: [number, number] = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    const point = placeholderPoints('localities-2011').features.find((p) => p.properties.code === '3650')!;
    expect(distanceM(mean, point.geometry.coordinates as [number, number])).toBeLessThan(30);
    for (const level of LEVEL_IDS) expect(placeholderPoints(level).type).toBe('FeatureCollection');
    expect(placeholderPoints('statistical-areas-2011').features).toHaveLength(0);
  });

  it('every feature carries a boolean placeholder flag', () => {
    for (const level of LEVEL_IDS) {
      for (const f of levelFeatures(level).features) expect(typeof f.properties.placeholder).toBe('boolean');
    }
  });
});
