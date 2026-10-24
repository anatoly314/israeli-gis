import { describe, expect, it } from 'vitest';
import { authorityCode, isRegionalCouncilCode, regionalCouncilCode, saKey, toCode } from '../pipeline/lib/keys.ts';
import { readCsv } from '../pipeline/lib/sheets.ts';
import { raw } from '../pipeline/lib/paths.ts';
import { parseAuthorities } from '../pipeline/datasets/ses-2021/parse.ts';
import { files } from '../pipeline/datasets/ses-2021/index.ts';

describe('statistical-area key', () => {
  it('is locality_code * 10000 + area number', () => {
    expect(saKey(5000, 437)).toBe('50000437');
    expect(saKey(31, 6)).toBe('310006');
    expect(saKey(70, 1)).toBe('700001');
  });

  it('rejects area numbers that would overflow into the locality part', () => {
    expect(() => saKey(5000, 10000)).toThrow();
    expect(() => saKey(5000, 0)).toThrow();
  });
});

describe('regional-council code', () => {
  it('is 5500 + council number', () => {
    expect(regionalCouncilCode(1)).toBe('5501');
    expect(regionalCouncilCode(78)).toBe('5578');
    expect(isRegionalCouncilCode(5565)).toBe(true);
    expect(isRegionalCouncilCode(5500)).toBe(false);
  });

  it('keeps council numbers and locality codes in separate key spaces', () => {
    // 8 is both HaGilboa RC and locality 8.
    expect(authorityCode(8, null)).toBe('5508');
    expect(authorityCode(0, 8)).toBe('8');
    expect(authorityCode(99, 1192)).toBe('1192');
  });

  it('matches the data.gov.il municipal authorities list for all 255 authorities', async () => {
    const govCodes = new Set(readCsv(raw('datagov-municipal-authorities/localauthorities.csv')).map((r) => r.LocalAuthorityCode));
    const ours = await parseAuthorities(raw(files.authorities));
    expect(ours).toHaveLength(255);
    expect(ours.filter((a) => !govCodes.has(a.code)).map((a) => a.code)).toEqual([]);
  });
});

describe('toCode', () => {
  it('normalizes zero-padded Wikidata strings and float cells', () => {
    expect(toCode('0046')).toBe(46);
    expect(toCode(5000.0)).toBe(5000);
    expect(toCode('')).toBeNull();
    expect(toCode(null)).toBeNull();
  });
});
