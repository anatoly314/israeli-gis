import { describe, expect, it } from 'vitest';
import { LEVEL_IDS } from '../pipeline/lib/contract.ts';
import { byCode, levelFeatures, manifest } from './dist.ts';

describe('feature types', () => {
  it('names the feature type of every level', () => {
    for (const id of LEVEL_IDS) expect(manifest().levels[id].featureType?.en).toBeTruthy();
    expect(manifest().levels['statistical-areas-2011'].featureType?.en).toBe('Area');
  });

  it('splits local authorities into 79 cities, 124 local councils and 54 regional councils', () => {
    const types = manifest().levels['local-authorities-2011'].featureTypes!;
    expect(types.property).toBe('authority_type');
    const counts: Record<string, number> = {};
    for (const f of levelFeatures('local-authorities-2011').features) {
      const t = f.properties.authority_type as string;
      expect(types.labels[t]).toBeDefined();
      counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts).toEqual({ city: 79, 'local-council': 124, 'regional-council': 54 });
  });

  it.each([
    ['5000', 'city'], // Tel Aviv-Yafo
    ['3650', 'local-council'], // Efrat
    ['587', 'local-council'], // Savyon
    ['5501', 'regional-council'], // HaGalil HaElyon
    ['5568', 'regional-council'], // Neve Midbar
  ])('%s is a %s', (code, type) => {
    expect(byCode('local-authorities-2011').get(code)?.properties.authority_type).toBe(type);
  });

  it('carries residents (year in populationYear), summed over each feature, on every level', () => {
    for (const id of LEVEL_IDS) expect(manifest().levels[id].populationYear).toBe(2020);
    const total = (id: (typeof LEVEL_IDS)[number]) => levelFeatures(id).features.reduce((s, f) => s + (f.properties.population as number), 0);
    for (const id of LEVEL_IDS) expect(levelFeatures(id).features.every((f) => Number.isInteger(f.properties.population))).toBe(true);
    expect(total('localities-2011')).toBe(9_217_568);
    expect(byCode('localities-2011').get('5000')?.properties.population).toBe(463_794);
    expect(byCode('local-authorities-2011').get('9000')?.properties.population).toBe(210_587);
    // A city equals the sum of its statistical areas.
    const tlvAreas = levelFeatures('statistical-areas-2011').features.filter((f) => f.properties.locality_code === '5000');
    expect(tlvAreas.reduce((s, f) => s + (f.properties.population as number), 0)).toBe(463_794);
  });

  it('marks statistical areas as parts of their city', () => {
    const m = manifest();
    expect(m.levels['statistical-areas-2011'].parentCode).toBe('locality_code');
    for (const id of LEVEL_IDS.filter((l) => l !== 'statistical-areas-2011')) expect(m.levels[id].parentCode).toBeUndefined();
    const sa = byCode('statistical-areas-2011').get('50000437')!.properties;
    expect([sa.locality_code, sa.name_en]).toEqual(['5000', 'Tel Aviv - Yafo']);
  });

  it('carries no authority type on the other levels', () => {
    for (const id of LEVEL_IDS.filter((l) => l !== 'local-authorities-2011')) {
      expect(manifest().levels[id].featureTypes).toBeUndefined();
      expect(levelFeatures(id).features.some((f) => 'authority_type' in f.properties)).toBe(false);
    }
  });
});
