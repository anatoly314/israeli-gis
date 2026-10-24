import { describe, expect, it } from 'vitest';
import { detectLang, dirOf, featureName, fillTemplate, t } from '../src/i18n.ts';
import { featureTitle, featureType, formatField, popupHtml } from '../src/popup.ts';
import { layer } from './fixtures.ts';

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

  it('interpolates UI strings', () => {
    expect(t('areas', 'en', { n: '3' })).toBe('3 areas');
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
    expect(fillTemplate('{name} – statistical area {sa}', { ...telAviv, sa: 437 }, 'en')).toBe('Tel Aviv - Yafo – statistical area 437');
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
    expect(featureType(sa, areas.level, 'he')).toBe('אזור סטטיסטי');
    expect(featureTitle(sa, areas.level, 'en').text).toBe('Tel Aviv - Yafo – statistical area 437');
  });

  it('shows values, or the "not calculated" text, and escapes names', () => {
    const props = { ...areas.data.features.get('50000437')!.props, ...areas.values['50000437'], _k: '9' };
    const html = bare(popupHtml(areas.layer, areas.level, props, 'en'));
    expect(html).toContain('Cluster 9');
    expect(html).toContain('1,632 of 1,641');
    expect(html).toContain('dir="auto"');
    const missing = popupHtml(authorities.layer, authorities.level, { ...authorities.data.features.get('1722')!.props, _k: 'na' }, 'en');
    expect(missing).toContain('Not calculated');
    expect(missing).not.toContain('<dl>');
    const evil = popupHtml(authorities.layer, authorities.level, { ...authorities.data.features.get('5000')!.props, name_en: '<img onerror=x>', _k: 'na' }, 'en');
    expect(evil).not.toContain('<img');
  });
});
