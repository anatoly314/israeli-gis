import { beforeAll, describe, expect, it } from 'vitest';
import { buildEntries, matchScore, normalize, search, skeleton, type SearchEntry } from '../src/search.ts';
import { layer, manifest } from './fixtures.ts';

describe('normalize', () => {
  it.each([
    ['Tel Aviv - Yafo', 'tel aviv yafo'],
    ['TEL-AVIV', 'tel aviv'],
    ['תֵּל אָבִיב', 'תל אביב'],
    ['בית ג\'ן', 'בית גן'],
    ['בית ג׳ן', 'בית גן'],
    ['צה״ל', 'צהל'],
    ['צה"ל', 'צהל'],
    ['תל־אביב', 'תל אביב'], // maqaf
    ['Тель-Авив', 'тель авив'],
    ['Беэр-Шева', 'беэр шева'],
    ['Ёкнеам', 'екнеам'],
    ['Йокнеам', 'екнеам'],
    ['Modi’in–Makkabbim', 'modiin makkabbim'],
    ['Qiryat Shemona', 'kiryat shemona'],
    ['Kefar Sava', 'kfar sava'],
    ['  many   spaces ', 'many spaces'],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('builds looser skeletons for spelling variants', () => {
    const same = (a: string, b: string) => expect(skeleton(normalize(a))).toBe(skeleton(normalize(b)));
    same('Kiryat Shmona', 'Qiryat Shemona');
    same('Kfar Saba', 'Kefar Sava');
    same('Kfar Vradim', 'Kefar Weradim');
    same('קרית שמונה', 'קריית שמונה');
    same('Беер Шева', 'Беэр-Шева');
  });
});

describe('matchScore', () => {
  it('ranks exact < prefix < word prefix < all words < substring', () => {
    expect(matchScore('tel aviv yafo', 'tel aviv yafo')).toBe(0);
    expect(matchScore('tel aviv yafo', 'tel av')).toBe(1);
    expect(matchScore('tel aviv yafo', 'yafo')).toBe(2);
    expect(matchScore('tel aviv yafo statistical area 437', 'tel aviv 437')).toBe(3);
    expect(matchScore('telaviv', 'tel aviv')).toBe(4);
    expect(matchScore('haifa', 'tel')).toBe(-1);
  });
});

describe('search over the shipped levels', () => {
  let entries: SearchEntry[];
  const LA = 'local-authorities-2011';
  const SA = 'statistical-areas-2011';
  const RC = 'rc-localities-2011';
  // The current layer's level ranks first, the rest in manifest order.
  const rankFor = (current: string) => (lvl: string) => (lvl === current ? 0 : [LA, RC, SA].indexOf(lvl) + 1);
  const find = (q: string, current = LA) => search(entries, q, { levelRank: rankFor(current) });

  beforeAll(() => {
    entries = manifest().layers.flatMap((l) => {
      const { level, data } = layer(l.id);
      return buildEntries((l as { level: string }).level, level, data);
    });
  });

  it('indexes each (level, code) once', () => {
    const keys = entries.map((e) => `${e.level}/${e.code ?? e.codes[0]}/${e.code == null}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(['תל אביב', 'Tel Aviv', 'Тель-Авив', 'tel-aviv', 'תל-אביב יפו', 'tel', 'תל'])('%s finds Tel Aviv-Yafo first', (q) => {
    const [first] = find(q);
    expect([first.level, first.code]).toEqual([LA, '5000']);
  });

  it('ranks the current level first: on statistical areas, the city group comes first', () => {
    const [first] = find('tel aviv', SA);
    expect(first.level).toBe(SA);
    expect(first.code).toBeNull();
    expect(first.codes.length).toBeGreaterThan(100);
    expect(find('tel aviv').filter((e) => e.level === SA)).toHaveLength(1);
  });

  it('finds a single statistical area when a number is typed', () => {
    const [sa] = find('tel aviv 437');
    expect(sa.code).toBe('50000437');
    expect(sa.names.en).toBe('Tel Aviv - Yafo – statistical area 437');
  });

  it('"קרית" finds the קריית cities, Qiryat Shemona among the first eight', () => {
    const results = find('קרית');
    expect(results.every((e) => e.names.he.startsWith('קרי'))).toBe(true);
    expect(results.map((e) => e.code)).toContain('2800');
  });

  it('"באר" finds Be\'er Sheva first', () => {
    expect(find('באר')[0].code).toBe('9000');
  });

  it('"кфар" finds Kfar … places', () => {
    const results = find('кфар');
    expect(results).toHaveLength(8);
    expect(results[0].code).toBe('6900');
    // Plain matches first, biggest first; spelling variants (Кафр-…) after them.
    expect(results.slice(0, 6).every((e) => e.names.ru.startsWith('Кфар'))).toBe(true);
  });

  it('matches spelling variants, maqaf and Cyrillic variants', () => {
    expect(find('Kiryat Shmona')[0].code).toBe('2800');
    expect(find('Kfar Saba')[0].code).toBe('6900');
    expect(find('קרית שמונה')[0].code).toBe('2800');
    expect(find('Беэр-Шева')[0].code).toBe('9000');
    expect(find('Беер Шева')[0].code).toBe('9000');
    expect(find('Ёкнеам')[0].names.he).toMatch(/^יקנעם/);
    expect(find('תל־אביב')[0].code).toBe('5000');
  });

  it('keeps spelling variants from adding noise', () => {
    expect(find('Tel Aviv').map((e) => e.names.en)).not.toContain('Abu Tulul');
    expect(find('Haifa').every((e) => /haifa/i.test(e.names.en))).toBe(true);
  });

  it('caps results and returns nothing for an empty query', () => {
    expect(find('k')).toHaveLength(8);
    expect(find('  ')).toEqual([]);
  });
});
