import { describe, expect, it } from 'vitest';
import { compactHl, expandHl, normalizeSelection, rangeToSelection, selectionToRange } from '../src/range.ts';
import { parseUrl, serializeUrl } from '../src/url.ts';

const clusters = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const bins = ['s0', 's1', 's2', 's3', 's4', 's5'];
const negative = ['-3', '-2', '-1', '0', '1'];

describe('selection ↔ slider', () => {
  it('maps a contiguous selection to its ends', () => {
    expect(selectionToRange(clusters, ['4', '5', '6', '7'])).toEqual({ min: 3, max: 6, custom: false });
    expect(selectionToRange(clusters, ['5'])).toEqual({ min: 4, max: 4, custom: false });
    expect(selectionToRange(bins, ['s2', 's3'])).toEqual({ min: 2, max: 3, custom: false });
  });

  it('frames a non-contiguous selection, or one with "not calculated", and marks it custom', () => {
    expect(selectionToRange(clusters, ['9', '1', '5'])).toEqual({ min: 0, max: 8, custom: true });
    expect(selectionToRange(clusters, ['4', '5', 'na'])).toEqual({ min: 3, max: 4, custom: true });
    expect(selectionToRange(clusters, ['na'])).toEqual({ min: 0, max: 9, custom: true });
  });

  it('puts the handles at the full range when nothing is selected', () => {
    expect(selectionToRange(clusters, [])).toEqual({ min: 0, max: 9, custom: false });
  });

  it('turns a handle range into the classes between them; the full range means no highlight', () => {
    expect(rangeToSelection(clusters, 3, 6)).toEqual(['4', '5', '6', '7']);
    expect(rangeToSelection(clusters, 4, 4)).toEqual(['5']);
    expect(rangeToSelection(clusters, 6, 3)).toEqual(['4', '5', '6', '7']);
    expect(rangeToSelection(clusters, 0, 9)).toEqual([]);
    expect(rangeToSelection(bins, 0, 2)).toEqual(['s0', 's1', 's2']);
  });

  it('round-trips', () => {
    for (const [a, b] of [[0, 0], [2, 7], [9, 9], [0, 8]]) {
      const { min, max } = selectionToRange(clusters, rangeToSelection(clusters, a, b));
      expect([min, max]).toEqual([a, b]);
    }
  });
});

describe('one "everything" state', () => {
  it('treats every class (without "not calculated") as no highlight', () => {
    expect(normalizeSelection(clusters, clusters)).toEqual([]);
    expect(normalizeSelection([...clusters, 'na'], clusters)).toHaveLength(11);
    expect(normalizeSelection(['1', '1', '2'], clusters)).toEqual(['1', '2']);
    expect(expandHl(['1-10'], clusters)).toEqual([]);
    expect(expandHl(['1-10', 'na'], clusters)).toHaveLength(11);
  });
});

describe('URL hl', () => {
  it('compacts runs to first-last and keeps singles and "na"', () => {
    expect(compactHl(['4', '5', '6', '7'], clusters)).toEqual(['4-7']);
    expect(compactHl(['9', '1', '5'], clusters)).toEqual(['1', '5', '9']);
    expect(compactHl(['1', '2', '5', '8', '9', '10', 'na'], clusters)).toEqual(['1-2', '5', '8-10', 'na']);
    expect(compactHl(['s0', 's1', 's2'], bins)).toEqual(['s0-s2']);
    expect(compactHl([], clusters)).toEqual([]);
  });

  it('expands ranges and lists, in either order, ignoring unknown keys', () => {
    expect(expandHl(['4-7'], clusters)).toEqual(['4', '5', '6', '7']);
    expect(expandHl(['7-4'], clusters)).toEqual(['4', '5', '6', '7']);
    expect(expandHl(['1', '5', '9'], clusters)).toEqual(['1', '5', '9']);
    expect(expandHl(['1-2', '5', 'na', '99', '3-42'], clusters)).toEqual(['1', '2', '5', 'na']);
    expect(expandHl(['s1-s3'], bins)).toEqual(['s1', 's2', 's3']);
    expect(expandHl(['-3--1', '1'], negative)).toEqual(['-3', '-2', '-1', '1']);
    expect(expandHl(['-1'], negative)).toEqual(['-1']);
  });

  it('reads old list links and writes the compact form through the URL layer', () => {
    const old = parseUrl('?layer=ses-2021-localities&hl=8,9,10');
    expect(expandHl(old.hl, clusters)).toEqual(['8', '9', '10']);
    const q = serializeUrl({ ...old, hl: compactHl(['8', '9', '10'], clusters) });
    expect(q).toBe('?layer=ses-2021-localities&hl=8-10');
    expect(expandHl(parseUrl(q).hl, clusters)).toEqual(['8', '9', '10']);
    expect(serializeUrl({ ...old, hl: compactHl(['1', '5', '9'], clusters) })).toBe('?layer=ses-2021-localities&hl=1,5,9');
  });
});
