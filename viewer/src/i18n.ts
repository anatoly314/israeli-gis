import type { I18n, Lang } from '../../pipeline/lib/contract.ts';

export type { I18n, Lang };
export const LANGS: readonly Lang[] = ['he', 'en', 'ru'];

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);
export const dirOf = (lang: Lang) => (lang === 'he' ? 'rtl' : 'ltr');

/** URL param, else the browser's preferred languages, else Hebrew. */
export function detectLang(param: string | null, navigatorLangs: readonly string[] = []): Lang {
  if (isLang(param)) return param;
  for (const l of navigatorLangs) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'iw') return 'he';
    if (isLang(base)) return base;
  }
  return 'he';
}

const UI = {
  title: { he: 'מפת הנתונים הפתוחים של ישראל', en: 'Israel open data map', ru: 'Карта открытых данных Израиля' },
  searchPlace: { he: 'חיפוש יישוב', en: 'Search a place', ru: 'Поиск: город, посёлок' },
  // {terms}: the searchTerm of each searchable extra field ("neighborhood"), joined as an "or" list.
  searchPlaceOr: { he: 'חיפוש יישוב או {terms}', en: 'Search a place or {terms}', ru: 'Поиск: город, посёлок, {terms}' },
  alsoSearchable: { he: 'אפשר לחפש גם: {fields}', en: 'Also searchable: {fields}', ru: 'Также ищутся: {fields}' },
  searchLabel: { he: 'חיפוש', en: 'Search', ru: 'Поиск' },
  noResults: { he: 'לא נמצאו תוצאות', en: 'No matches', ru: 'Ничего не найдено' },
  searching: { he: 'טוען…', en: 'Loading…', ru: 'Загрузка…' },
  layers: { he: 'שכבות', en: 'Layers', ru: 'Слои' },
  legend: { he: 'מקרא', en: 'Legend', ru: 'Легенда' },
  legendHint: {
    he: 'לחצו על קבוצות כדי להדגיש אותן במפה, או גררו את קצות הטווח',
    en: 'Tap classes to highlight them on the map, or drag the range ends',
    ru: 'Нажимайте на классы, чтобы выделить их на карте, или двигайте края диапазона',
  },
  clear: { he: 'ניקוי', en: 'Clear', ru: 'Сбросить' },
  low: { he: 'נמוך', en: 'Low', ru: 'Низкий' },
  high: { he: 'גבוה', en: 'High', ru: 'Высокий' },
  range: { he: 'הדגשת טווח', en: 'Highlight range', ru: 'Выделить диапазон' },
  rangeMin: { he: 'הקבוצה הנמוכה בטווח', en: 'Minimum class', ru: 'Минимальный класс' },
  rangeMax: { he: 'הקבוצה הגבוהה בטווח', en: 'Maximum class', ru: 'Максимальный класс' },
  rangeAll: { he: 'הכול', en: 'all', ru: 'все' },
  rangeCustom: { he: 'בחירה חופשית', en: 'custom', ru: 'выборочно' },
  more: { he: 'עוד {n}', en: '+{n} more', ru: 'ещё {n}' },
  of: { he: 'מתוך', en: 'of', ru: 'из' },
  about: { he: 'אודות ומקורות', en: 'About & sources', ru: 'О карте и источники' },
  close: { he: 'סגירה', en: 'Close', ru: 'Закрыть' },
  fullscreen: { he: 'פתיחה במסך מלא', en: 'Open full map', ru: 'Открыть всю карту' },
  language: { he: 'שפה', en: 'Language', ru: 'Язык' },
  loading: { he: 'טוען נתונים…', en: 'Loading data…', ru: 'Загрузка данных…' },
  loadError: { he: 'טעינת הנתונים נכשלה', en: 'Could not load the data', ru: 'Не удалось загрузить данные' },
  placeholderNote: {
    he: 'מיקום משוער: הלמ"ס לא פרסמה גבול',
    en: 'Approximate location: CBS publishes no boundary',
    ru: 'Примерное место: ЦСБ не публикует границу',
  },
  noRuName: { he: '', en: '', ru: 'нет русского названия' },
  basemap: { he: 'מפת רקע', en: 'Basemap', ru: 'Подложка' },
  noEndorsement: {
    he: 'המפה אינה מטעם הלמ"ס, והלמ"ס אינה תומכת בה. הנתונים מוצגים כמות שהם.',
    en: 'This map is not produced or endorsed by CBS. The data is shown as is.',
    ru: 'Карта не создана и не одобрена ЦСБ. Данные показаны «как есть».',
  },
  licence: { he: 'רישיון', en: 'Licence', ru: 'Лицензия' },
  map: { he: 'מפה אינטראקטיבית', en: 'Interactive map', ru: 'Интерактивная карта' },
  results: { he: 'תוצאות: {n}', en: 'Results: {n}', ru: 'Результатов: {n}' },
  resultsLabel: { he: 'תוצאות חיפוש', en: 'Search results', ru: 'Результаты поиска' },
} satisfies Record<string, I18n>;

export type UiKey = keyof typeof UI;

/** UI string; `{var}` placeholders take already formatted values (see format.ts for numbers). */
export const t = (key: UiKey, lang: Lang, vars: Record<string, string> = {}) =>
  UI[key][lang].replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

/**
 * Search box placeholder: "Search a place", plus the manifest's searchable extra fields by their `searchTerm`
 * ("Search a place or neighborhood"); several terms are joined as an "or" list in the UI language.
 */
export function searchPlaceholder(lang: Lang, terms: readonly I18n[]): string {
  if (!terms.length) return t('searchPlace', lang);
  const list = new Intl.ListFormat(lang, { type: 'disjunction' }).format(terms.map((x) => x[lang]));
  return t('searchPlaceOr', lang, { terms: list });
}

/**
 * Note after a label whose values are in another language than the UI ("Районы (на иврите)"), keyed by the values'
 * language, then the UI language. Empty when they match.
 */
const IN_LANG: Record<Lang, I18n> = {
  he: { he: '', en: '(in Hebrew)', ru: '(на иврите)' },
  en: { he: '(באנגלית)', en: '', ru: '(на английском)' },
  ru: { he: '(ברוסית)', en: '(in Russian)', ru: '' },
};
export const inLangNote = (textLang: Lang, lang: Lang) => (textLang === lang ? '' : IN_LANG[textLang][lang]);

/** MapLibre's own UI strings; `en` repeats MapLibre's defaults so switching back to English restores them. */
export const MAP_LOCALE: Record<Lang, Record<string, string>> = {
  en: {
    'Map.Title': 'Map',
    'NavigationControl.ZoomIn': 'Zoom in',
    'NavigationControl.ZoomOut': 'Zoom out',
    'NavigationControl.ResetBearing': 'Drag to rotate map, click to reset north',
    'AttributionControl.ToggleAttribution': 'Toggle attribution',
    'AttributionControl.MapFeedback': 'Map feedback',
    'Popup.Close': 'Close popup',
    'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + scroll to zoom the map',
    'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + scroll to zoom the map',
    'CooperativeGesturesHandler.MobileHelpText': 'Use two fingers to move the map',
  },
  he: {
    'Map.Title': 'מפה',
    'NavigationControl.ZoomIn': 'הגדלת התצוגה',
    'NavigationControl.ZoomOut': 'הקטנת התצוגה',
    'NavigationControl.ResetBearing': 'איפוס הכיוון לצפון',
    'AttributionControl.ToggleAttribution': 'הצגה או הסתרה של הקרדיטים',
    'AttributionControl.MapFeedback': 'דיווח על טעות במפה',
    'Popup.Close': 'סגירה',
    'CooperativeGesturesHandler.WindowsHelpText': 'לשינוי הזום: Ctrl וגלילה',
    'CooperativeGesturesHandler.MacHelpText': 'לשינוי הזום: ⌘ וגלילה',
    'CooperativeGesturesHandler.MobileHelpText': 'הזיזו את המפה בשתי אצבעות',
  },
  ru: {
    'Map.Title': 'Карта',
    'NavigationControl.ZoomIn': 'Приблизить',
    'NavigationControl.ZoomOut': 'Отдалить',
    'NavigationControl.ResetBearing': 'Повернуть на север',
    'AttributionControl.ToggleAttribution': 'Показать или скрыть источники',
    'AttributionControl.MapFeedback': 'Сообщить об ошибке на карте',
    'Popup.Close': 'Закрыть',
    'CooperativeGesturesHandler.WindowsHelpText': 'Чтобы изменить масштаб, прокручивайте с Ctrl',
    'CooperativeGesturesHandler.MacHelpText': 'Чтобы изменить масштаб, прокручивайте с ⌘',
    'CooperativeGesturesHandler.MobileHelpText': 'Двигайте карту двумя пальцами',
  },
};

export interface NameProps {
  name_he: string;
  name_en: string;
  name_ru: string;
}

export interface DisplayName {
  text: string;
  /** No name in the requested language; `text` is the English (or Hebrew) one. */
  fallback: boolean;
}

const HEBREW = /[א-ת]/;

/**
 * Feature name in `lang`, following the contract's fallbacks: name_ru === name_en means there is no Russian
 * name, and name_en/name_ru hold Hebrew when no source has a Latin name.
 */
export function featureName(p: NameProps, lang: Lang): DisplayName {
  if (lang === 'he') return { text: p.name_he, fallback: false };
  if (lang === 'en') return { text: p.name_en, fallback: HEBREW.test(p.name_en) };
  return { text: p.name_ru, fallback: p.name_ru === p.name_en };
}

/** Fills a manifest label template: `{name}` is the localized name, `{prop}` any other feature property. */
export function fillTemplate(template: string, props: Record<string, unknown>, lang: Lang): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (k === 'name') return featureName(props as unknown as NameProps, lang).text;
    return props[k] == null ? m : String(props[k]);
  });
}
