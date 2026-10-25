import { describe, expect, it } from 'vitest';
import { detectLang, dirOf, featureName, fillTemplate, inLangNote, searchPlaceholder, t } from '../src/i18n.ts';
import { featureTitle, featureType, formatField, headerLines, popupHtml } from '../src/popup.ts';
import { joinLayer } from '../src/data.ts';
import { layer, manifest } from './fixtures.ts';

const bare = (s: string) => s.replace(/[⁦⁩]/g, '');

describe('language choice', () => {
  it('prefers the URL, then the browser, then Hebrew', () => {
    expect(detectLang('ru', ['en-US'])).toBe('ru');
    expect(detectLang('fr', ['en-US', 'he'])).toBe('en');
    expect(detectLang(null, ['de-DE', 'ru-RU'])).toBe('ru');
    expect(detectLang(null, ['iw-IL'])).toBe('he');
    expect(detectLang(null, ['fr-FR'])).toBe('he');
    expect(detectLang(null, [])).toBe('he');
  });

  it('is RTL only for Hebrew', () => {
    expect([dirOf('he'), dirOf('en'), dirOf('ru')]).toEqual(['rtl', 'ltr', 'ltr']);
  });

  it('builds the search placeholder from the searchable fields\' search terms', () => {
    const neighborhood = manifest().levels['statistical-areas-2011'].extraFields!.find((f) => f.searchable)!.searchTerm!;
    expect([searchPlaceholder('he', [neighborhood]), searchPlaceholder('en', [neighborhood]), searchPlaceholder('ru', [neighborhood])]).toEqual([
      'חיפוש יישוב או שכונה',
      'Search a place or neighborhood',
      'Поиск: город, посёлок, квартал',
    ]);
    expect([searchPlaceholder('he', []), searchPlaceholder('en', []), searchPlaceholder('ru', [])]).toEqual([
      'חיפוש יישוב',
      'Search a place',
      'Поиск: город, посёлок',
    ]);
    const street = { he: 'רחוב', en: 'street', ru: 'улица' };
    expect(searchPlaceholder('en', [neighborhood, street])).toBe('Search a place or neighborhood or street');
    expect(searchPlaceholder('ru', [neighborhood, street])).toBe('Поиск: город, посёлок, квартал или улица');
  });

  it('interpolates UI strings', () => {
    expect(t('alsoSearchable', 'en', { fields: 'Neighborhoods (in Hebrew)' })).toBe('Also searchable: Neighborhoods (in Hebrew)');
    expect([inLangNote('he', 'he'), inLangNote('he', 'en'), inLangNote('he', 'ru')]).toEqual(['', '(in Hebrew)', '(на иврите)']);
    expect(t('of', 'ru')).toBe('из');
  });
});

describe('feature names', () => {
  const telAviv = { name_he: 'תל אביב -יפו', name_en: 'Tel Aviv - Yafo', name_ru: 'Тель-Авив' };
  const noRu = { name_he: 'גבעת חן', name_en: 'Givat Hen', name_ru: 'Givat Hen' };
  const hebrewOnly = { name_he: 'מפעלי גליל עליון', name_en: 'מפעלי גליל עליון', name_ru: 'מפעלי גליל עליון' };

  it('picks the name in the language', () => {
    expect(featureName(telAviv, 'ru')).toEqual({ text: 'Тель-Авив', fallback: false });
    expect(featureName(telAviv, 'he').text).toBe('תל אביב -יפו');
  });

  it('flags name_ru === name_en as a missing Russian name', () => {
    expect(featureName(noRu, 'ru')).toEqual({ text: 'Givat Hen', fallback: true });
    expect(featureName(noRu, 'en')).toEqual({ text: 'Givat Hen', fallback: false });
  });

  it('flags Hebrew in name_en as a missing English name', () => {
    expect(featureName(hebrewOnly, 'en').fallback).toBe(true);
  });

  it('fills label templates with the localized name and other properties', () => {
    expect(fillTemplate('{name} – area {sa}', { ...telAviv, sa: 437 }, 'en')).toBe('Tel Aviv - Yafo – area 437');
    expect(fillTemplate('{name} {missing}', telAviv, 'ru')).toBe('Тель-Авив {missing}');
  });
});

describe('popup', () => {
  const authorities = layer('ses-2021-local-authorities');
  const areas = layer('ses-2021-statistical-areas');

  it('formats the manifest fields, every number bidi-isolated', () => {
    const [cluster, index, rank, population] = areas.layer.popup;
    expect(bare(formatField(cluster, 9, 'en'))).toBe('9');
    expect(bare(formatField(index, 2.4021, 'en'))).toBe('2.402');
    expect(bare(formatField(index, -0.111, 'he'))).toBe('-0.111');
    expect(formatField(index, -0.111, 'he')).toBe('⁦-0.111⁩');
    expect(bare(formatField(rank, 1632, 'en'))).toBe('1,632 of 1,641');
    expect(formatField(rank, 117, 'he')).toBe('⁦117⁩ מתוך ⁦1,641⁩');
    expect(bare(formatField(rank, 1632, 'ru'))).toMatch(/^1\s632 из 1\s641$/);
    expect(bare(formatField(population, 2685, 'he'))).toBe('2,685');
  });

  it('shows a stepped value as the number with the bin as secondary text', () => {
    const base = areas.layer;
    const crime = {
      ...base,
      valueField: 'rate',
      classification: { type: 'stepped' as const, breaks: [-1, 0, 5], colors: ['#2166ac', '#67a9cf', '#d1e5f0', '#ef8a62'], missing: base.classification.missing },
      popup: [{ field: 'rate', label: { he: 'שיעור', en: 'Rate', ru: 'Уровень' }, format: { type: 'decimal' as const, decimals: 2 } }],
    };
    const props = { ...areas.data.features.get('50000437')!.props, rate: -0.5, _k: 's1' };
    const html = bare(popupHtml(crime, areas.level, props, 'he'));
    expect(html).toContain('<span>-0.50</span><span class="bin">-1 – 0</span>');
    expect(html).toContain('--c:#67a9cf');
  });

  it('names the type of local authorities and statistical areas', () => {
    const tlv = authorities.data.features.get('5000')!.props;
    expect(featureType(tlv, authorities.level, 'en')).toBe('City');
    expect(featureType(authorities.data.features.get('5501')!.props, authorities.level, 'ru')).toBe('Региональный совет');
    const sa = areas.data.features.get('50000437')!.props;
    expect(featureType(sa, areas.level, 'he')).toBe('אזור');
    expect(featureTitle(sa, areas.level, 'en').text).toBe('Tel Aviv - Yafo – area 437');
    // Under the title: the type, then the level's official CBS term.
    expect(headerLines(sa, areas.level, 'he')).toEqual(['אזור · אזורים סטטיסטיים של הלמ"ס']);
    expect(headerLines(tlv, authorities.level, 'en')).toEqual(['City · Local authorities']);
    expect(headerLines(tlv, authorities.level, 'he')).toEqual(['עירייה · רשויות מקומיות']);
    // No level (a points layer): just the type, here none.
    expect(headerLines(tlv, undefined, 'en')).toEqual([]);
  });

  it('shows values, or the "not calculated" text, and escapes names', () => {
    const props = { ...areas.data.features.get('50000437')!.props, ...areas.values['50000437'], _k: '9' };
    const html = bare(popupHtml(areas.layer, areas.level, props, 'en'));
    expect(html).toContain('Cluster 9');
    expect(html).toContain('1,632 of 1,641');
    expect(html).toContain('dir="auto"');
    // Joined as the map joins it: a geometry property of the same name (population 2020) never shows as a value.
    const joined = joinLayer(authorities.data, authorities.values, authorities.layer);
    const tefen = joined.polygons.features.find((f) => f.properties.code === '1722')!.properties;
    const missing = popupHtml(authorities.layer, authorities.level, tefen, 'en');
    expect(missing).toContain('Not calculated');
    expect(missing).not.toContain('<dl>');
    const evil = popupHtml(authorities.layer, authorities.level, { ...authorities.data.features.get('5000')!.props, name_en: '<img onerror=x>', _k: 'na' }, 'en');
    expect(evil).not.toContain('<img');
  });
});
