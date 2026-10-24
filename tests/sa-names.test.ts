import { describe, expect, inject, it } from 'vitest';
import { LANGS } from '../pipeline/lib/contract.ts';
import { SA_NAMES_MIN_MATCH } from '../pipeline/boundaries/index.ts';
import { parseList, readSaNames } from '../pipeline/boundaries/sa-names.ts';
import { raw } from '../pipeline/lib/paths.ts';
import { termsFor } from '../pipeline/terminology.ts';
import { byCode, levelFeatures, manifest } from './dist.ts';

describe('parseList', () => {
  it('splits on commas, trims and collapses whitespace, drops empty items', () => {
    expect(parseList(' אל שוקפאן,  הואדי ,, עשואן ,')).toEqual(['אל שוקפאן', 'הואדי', 'עשואן']);
    expect(parseList('שכ   עין  איברהים')).toEqual(['שכ עין איברהים']);
    expect(parseList(`שכ${String.fromCharCode(0xa0)}אלבאטן`)).toEqual(['שכ אלבאטן']); // NBSP
    expect(parseList(null)).toEqual([]);
    expect(parseList(' , ')).toEqual([]);
  });

  it('dedupes keeping the first occurrence and order', () => {
    expect(parseList('ב, א, ב, ג, א')).toEqual(['ב', 'א', 'ג']);
  });

  it('keeps CBS abbreviations as written', () => {
    expect(parseList('שכ אלגזלאת, שכ אלבאטן')).toEqual(['שכ אלגזלאת', 'שכ אלבאטן']);
    expect(parseList('שד נורדאו')).toEqual(['שד נורדאו']);
  });
});

describe('streets and neighborhoods file', () => {
  it('has 1917 rows whose full SA code is locality*10000 + SA', async () => {
    const names = await readSaNames(raw('cbs-socioeconomic-2021/streets_neighborhoods_sa2011.xlsx'));
    expect(names.size).toBe(1917);
    expect(names.get('4730001')?.neighborhoods[0]).toBe('השכונה הדרומית');
  });

  it('matches every SA-2011 polygon and every indexed SA', () => {
    const c = inject('buildReport').companions.find((j) => j.level === 'statistical-areas-2011')!;
    expect([c.matched, c.rows, c.featuresMatched, c.features, c.unmatched]).toEqual([1917, 1917, 1917, 1917, []]);
    expect(c.layers).toEqual([{ id: 'ses-2021-statistical-areas', rows: 1641, matched: 1641 }]);
    expect([c.withNeighborhoods, c.withStreets, c.withNeither]).toEqual([1298, 1761, 4]);
    expect(c.featuresMatched / c.features).toBeGreaterThanOrEqual(SA_NAMES_MIN_MATCH);
  });
});

describe('neighborhoods_he / streets_he on statistical areas', () => {
  const areas = byCode('statistical-areas-2011');

  it('pins Abu Snan 4730002', () => {
    const p = areas.get('4730002')!.properties;
    expect(p.neighborhoods_he).toEqual(['אל שוקפאן', 'הואדי', 'עשואן', 'שכונת השוק', "אלג'ורה", "כרם אלרג'ומה", 'אלמפצלה']);
    expect(p.streets_he).toEqual(['סולטאן באשא אל-אטרש']);
  });

  it('pins Tel Aviv 50000315 (streets only, so no neighborhoods_he property)', () => {
    const p = areas.get('50000315')!.properties;
    expect(p.streets_he).toEqual(['שד נורדאו', "ז'בוטינסקי", 'יהושע בן נון', 'אבן גבירול', 'בזל']);
    expect('neighborhoods_he' in p).toBe(false);
  });

  it('pins Jerusalem 30000112', () => {
    const p = areas.get('30000112')!.properties;
    expect(p.neighborhoods_he).toEqual(['קרית קמניץ']);
    expect(p.streets_he).toEqual(['הרב זווין', 'כפר עברי', 'ניימן שמואל', 'הרב וינוגרד', 'אסטורה']);
  });

  it('never ships an empty list, and only string lists', () => {
    for (const f of levelFeatures('statistical-areas-2011').features) {
      for (const k of ['neighborhoods_he', 'streets_he']) {
        const v = f.properties[k];
        if (v === undefined) continue;
        expect(Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() === s && s !== '')).toBe(true);
      }
    }
    const counts = ['neighborhoods_he', 'streets_he'].map((k) => levelFeatures('statistical-areas-2011').features.filter((f) => k in f.properties).length);
    expect(counts).toEqual([1298, 1761]);
  });

  it('only statistical areas carry these properties', () => {
    for (const id of ['local-authorities-2011', 'localities-2011', 'rc-localities-2011'] as const) {
      expect(levelFeatures(id).features.some((f) => 'neighborhoods_he' in f.properties || 'streets_he' in f.properties)).toBe(false);
      expect(manifest().levels[id].extraFields).toBeUndefined();
    }
  });
});

describe('extraFields in the manifest', () => {
  const fields = manifest().levels['statistical-areas-2011'].extraFields!;

  it('declares both lists, Hebrew text, neighborhoods searchable', () => {
    expect(fields.map((f) => [f.property, f.kind, f.textLang, f.searchable])).toEqual([
      ['neighborhoods_he', 'list', 'he', true],
      ['streets_he', 'list', 'he', false],
    ]);
  });

  it('takes labels from the terminology, complete in all three languages', () => {
    for (const f of fields) {
      for (const l of LANGS) expect(f.label[l].trim()).not.toBe('');
      expect(f.label).toEqual(termsFor('statistical-areas-2011').extraFields?.[f.property]?.label);
      if (f.shortLabel) for (const l of LANGS) expect(f.shortLabel[l].trim()).not.toBe('');
    }
    expect(fields.map((f) => [f.label, f.shortLabel])).toEqual([
      [
        { he: 'שכונות באזור', en: 'Neighborhoods in this area', ru: 'Кварталы на участке' },
        { he: 'שכונות', en: 'Neighborhoods', ru: 'Кварталы' },
      ],
      [{ he: 'רחובות עיקריים', en: 'Main streets', ru: 'Главные улицы' }, undefined],
    ]);
    expect(termsFor('statistical-areas-2022').extraFields).toEqual(termsFor('statistical-areas-2011').extraFields);
  });

  it('credits the streets/neighborhoods file in the sources', () => {
    expect(manifest().sources.some((s) => /streets and neighborhoods/.test(s.name.en))).toBe(true);
  });
});
