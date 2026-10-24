import { describe, expect, it } from 'vitest';
import { cleanEn, cleanHe, cleanRu, heKey, withRuFallback } from '../pipeline/lib/names.ts';
import { pickItem, readWikidataItems, type WikidataItem } from '../pipeline/boundaries/names.ts';
import { raw } from '../pipeline/lib/paths.ts';
import { byCode } from './dist.ts';

describe('Russian name fallback', () => {
  it('uses the Russian name when there is one', () => {
    expect(withRuFallback('גבת', 'Gevat', 'Гват')).toEqual({ he: 'גבת', en: 'Gevat', ru: 'Гват', ruIsFallback: false });
  });

  it('falls back to English, not to a transliteration', () => {
    expect(withRuFallback('יפעת', "Yif'at", null)).toEqual({ he: 'יפעת', en: "Yif'at", ru: "Yif'at", ruIsFallback: true });
    expect(withRuFallback('יפעת', "Yif'at", undefined).ru).toBe("Yif'at");
  });
});

describe('label cleanup', () => {
  it('strips disambiguators and council prefixes', () => {
    expect(cleanRu('Рейхан (мошав)')).toBe('Рейхан');
    expect(cleanRu('Маабарот (кибуц)')).toBe('Маабарот');
    expect(cleanRu('региональный совет Менаше')).toBe('Менаше');
    expect(cleanRu('Региональный совет Дром-ха-Шарон')).toBe('Дром-ха-Шарон');
  });

  it('rejects non-Cyrillic ru labels', () => {
    expect(cleanRu('Givat Brenner')).toBeNull();
    expect(cleanRu('Kawkab Abu-Al-Hij, Hazafon, Israel')).toBeNull();
    expect(cleanRu('')).toBeNull();
  });

  it('cleans CBS names', () => {
    expect(cleanHe('חריש *')).toBe('חריש');
    expect(cleanHe('  אבו  גוש ')).toBe('אבו גוש');
    expect(cleanEn("KOKHAV YA'IR")).toBe("Kokhav Ya'ir");
    expect(cleanEn("AR'ARA-BANEGEV")).toBe("Ar'ara-Banegev");
    expect(cleanEn('sedot dan')).toBe('Sedot Dan');
    expect(cleanEn('Mishmar HaEmeq')).toBe('Mishmar HaEmeq');
  });

  it('normalises Hebrew for matching', () => {
    expect(heKey('באקה אל-גרבייה')).toBe(heKey('באקה אל-גרביה'));
    expect(heKey('מג׳ד אל־כרום')).toBe(heKey("מג'ד אל-כרום"));
    expect(heKey("מע'אר")).toBe(heKey('מגאר'));
    expect(heKey('מועצה אזורית מטה אשר')).toBe(heKey('מטה אשר'));
    expect(heKey("מועצה אזורית בוסתאן אל מרג'")).toBe(heKey("בוסתן אל-מרג'"));
  });
});

describe('Wikidata item choice', () => {
  const item = (he: string, en: string, ru: string, dissolved = false): WikidataItem => ({ item: he, he, en, ru, dissolved });

  it('prefers the Hebrew match, then the English one, among items sharing a code', () => {
    const merger = item('באקה-ג\'ת', 'Baqa-Jatt', 'Бака-Джат');
    const town = item('באקה אל-גרבייה', 'Baqa al-Gharbiyye', 'Бака-эль-Гарбия');
    expect(pickItem([merger, town], 'באקה אל-גרביה', 'Baqa Al-Gharbiyye')).toBe(town);
    const region = item('רמות מנשה', 'Manasseh Hills', 'Высоты Менаше');
    const kibbutz = item('רמות מנשה', 'Ramot Menashe', 'Рамот-Менаше');
    expect(pickItem([region, kibbutz], 'רמות מנשה', 'Ramot Menashe')).toBe(kibbutz);
  });

  it('takes a lone live item whatever its label (wrong ones go on WIKIDATA_REJECT) and skips dissolved ones', () => {
    expect(pickItem([item('בית יתיר', 'Beit Yatir', 'Бейт-Ятир')], 'מצדות יהודה', 'Mezadot Yehuda')?.ru).toBe('Бейт-Ятир');
    expect(pickItem([item('כפר מעש', "Kfar Ma'as", 'Кфар-Маас')], 'מעש', "Ma'as")?.ru).toBe('Кфар-Маас');
    expect(pickItem([item('בקה', 'B', 'x', true), item('בקה', 'B', 'y')], 'בקה', 'B')?.ru).toBe('y');
    expect(pickItem([item('מודיעין עילית', "Modi'in Illit", 'Модиин-Илит', true)], 'מודיעין עילית', '')?.ru).toBe('Модиин-Илит');
  });

  it('reads the ru.wikipedia title before the ru label', () => {
    const items = readWikidataItems(raw('wikidata-p3466/p3466_items.csv'), raw('wikidata-p3466/regional_councils_Q1022469.csv'));
    expect(items.get(197)?.[0].ru).toBe('Маабарот');
    expect(items.get(5507)?.find((i) => !i.dissolved)?.ru).toBe('Эмек-ха-Мааянот');
  });
});

describe('names in the built localities', () => {
  const localities = byCode('localities-2011');
  const name = (code: string) => {
    const p = localities.get(code)!.properties;
    return { he: p.name_he, en: p.name_en, ru: p.name_ru };
  };

  it.each([
    ['6000', 'Бака-эль-Гарбия'], // not the dissolved Baqa-Jatt merger
    ['516', 'Мажд-эль-Курум'], // not Shaghur
    ['445', 'Рамот-Менаше'], // the kibbutz, not the Menashe Heights region
    ['197', 'Маабарот'], // ruwiki title, not the label "Маабара"
    ['5000', 'Тель-Авив'],
    ['505', 'Каукаб-абу-аль-Хиджа'], // Latin label rejected, rescued by the ruwiki title
    ['3797', 'Модиин-Илит'], // Wikidata wrongly marks it dissolved
    ['3745', 'Бейт-Ятир'], // lone item under another name (Mezadot Yehuda / Beit Yatir), accepted
  ])('%s → %s', (code, ru) => {
    expect(name(code).ru).toBe(ru);
  });

  it('fills a missing CBS English name from the lone Wikidata item', () => {
    expect(name('1748').en).toBe('Ben Gurion Airport');
  });

  it.each([
    ['897', 'מדרשת רופין', 'Midreshet Ruppin'], // item is the Ruppin Academic Center
    ['926', 'נווה אבות', 'Newe Avot'], // item is a geriatric centre linked to Shoham
    ['2010', 'כפר בן נון', 'Kefar Bin Nun'], // item is Hasolelim
  ])('rejects the Wikidata item for %s (English fallback)', (code, he, en) => {
    expect(name(code)).toEqual({ he, en, ru: en });
  });

  it('1770 is Neot Hovav in every language', () => {
    expect(name('1770')).toEqual({ he: 'נאות חובב', en: 'Neot Hovav', ru: 'Неот-Ховав' });
  });

  it('5540 carries its 2021 name, Emek Lod', () => {
    const p = byCode('local-authorities-2011').get('5540')!.properties;
    expect([p.name_he, p.name_en, p.name_ru]).toEqual(['עמק לוד', 'Emek Lod', 'Эмек-Лод']);
  });
});
