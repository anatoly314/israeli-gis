// User-facing wording for every geometry level, in one place. The build applies it to each level by its kind
// (the level id without the vintage), so a new vintage such as `statistical-areas-2022` or a new dataset picks
// up the same names without any string edits. To change wording: edit this file, `npm run build:data`,
// `npm run build:viewer`.
import { z } from 'zod';
import { CountForms, I18n, LevelKind, type LevelId } from './lib/contract.ts';

export const LevelTerms = z.strictObject({
  /** Plain name shown to users ("Neighborhoods"). */
  title: I18n,
  /** The official CBS term, shown as small secondary text ("CBS statistical areas"). */
  officialTerm: I18n,
  /** What one feature is called ("Neighborhood"). */
  featureType: I18n,
  /** Per-value feature types, when the level mixes types; keys are the values of the level's type property. */
  featureTypes: z.record(z.string(), I18n).optional(),
  /** Feature label template; `{name}` and `{<property>}` refer to feature properties (contract v1 syntax). */
  featureLabel: I18n.optional(),
  /**
   * Labels of the level's extra fields, keyed by feature property; `shortLabel` for compact mentions, `searchTerm`
   * (one value, singular, in running text) for searchable fields.
   */
  extraFields: z
    .record(z.string(), z.strictObject({ label: I18n, shortLabel: I18n.optional(), searchTerm: I18n.optional() }))
    .optional(),
  /** "N features" phrases by plural category (contract `CountForms`), for levels whose parts are counted per place. */
  countForms: CountForms.optional(),
});
export type LevelTerms = z.infer<typeof LevelTerms>;

export const Terminology = z.strictObject(Object.fromEntries(LevelKind.options.map((k) => [k, LevelTerms])) as Record<LevelKind, typeof LevelTerms>);

const LOCALITY: I18n = { he: 'יישוב', en: 'Locality', ru: 'Населённый пункт' };

export const TERMINOLOGY: Record<LevelKind, LevelTerms> = Terminology.parse({
  'local-authorities': {
    title: { he: 'רשויות מקומיות', en: 'Municipalities', ru: 'Муниципалитеты' },
    officialTerm: { he: 'רשויות מקומיות', en: 'Local authorities', ru: 'органы местного самоуправления' },
    featureType: { he: 'רשות מקומית', en: 'Municipality', ru: 'Муниципалитет' },
    featureTypes: {
      city: { he: 'עירייה', en: 'City', ru: 'Город' },
      'local-council': { he: 'מועצה מקומית', en: 'Local council', ru: 'Местный совет' },
      'regional-council': { he: 'מועצה אזורית', en: 'Regional council', ru: 'Региональный совет' },
    },
  },
  localities: {
    title: { he: 'יישובים', en: 'Localities', ru: 'Населённые пункты' },
    // Says what sets this level apart from "kibbutzim, moshavim & villages" (cities included) instead of repeating
    // the title; a missing officialTerm would leave the two locality levels looking alike in the layer list.
    officialTerm: {
      he: 'כל היישובים, כולל ערים (קובץ היישובים של הלמ"ס)',
      en: 'All CBS localities, cities included',
      ru: 'все населённые пункты ЦСБ, включая города',
    },
    featureType: LOCALITY,
  },
  'rc-localities': {
    title: { he: 'קיבוצים, מושבים ויישובים', en: 'Kibbutzim, moshavim & villages', ru: 'Кибуцы, мошавы и посёлки' },
    officialTerm: {
      he: 'יישובים במועצות אזוריות',
      en: 'Localities in regional councils',
      ru: 'населённые пункты в региональных советах',
    },
    featureType: LOCALITY,
  },
  'statistical-areas': {
    title: { he: 'שכונות', en: 'Neighborhoods', ru: 'Кварталы' },
    // The Russian CBS term is "статистические районы" everywhere (official term, sources, attribution).
    officialTerm: { he: 'אזורים סטטיסטיים של הלמ"ס', en: 'CBS statistical areas', ru: 'статистические районы ЦСБ' },
    // One feature is an area, which may hold several named neighbourhoods (neighborhoods_he).
    featureType: { he: 'אזור', en: 'Area', ru: 'Участок' },
    // {name} is the parent city's name, {sa} the area number.
    featureLabel: { he: '{name} – אזור {sa}', en: '{name} – area {sa}', ru: '{name} – участок {sa}' },
    // A city's areas, counted in search results: "169 участков". Hebrew 1 is "אזור אחד" (number after the noun).
    countForms: {
      he: { one: 'אזור אחד', two: '{n} אזורים', other: '{n} אזורים' },
      en: { one: '{n} area', other: '{n} areas' },
      ru: { one: '{n} участок', few: '{n} участка', many: '{n} участков', other: '{n} участка' },
    },
    extraFields: {
      neighborhoods_he: {
        label: { he: 'שכונות באזור', en: 'Neighborhoods in this area', ru: 'Кварталы на участке' },
        shortLabel: { he: 'שכונות', en: 'Neighborhoods', ru: 'Кварталы' },
        searchTerm: { he: 'שכונה', en: 'neighborhood', ru: 'квартал' },
      },
      streets_he: { label: { he: 'רחובות עיקריים', en: 'Main streets', ru: 'Главные улицы' } },
    },
  },
});

/** `statistical-areas-2011` → `statistical-areas`. Throws for an id that is not `<known kind>-<year>`. */
export function levelKind(id: LevelId | string): LevelKind {
  const m = /^(.+)-\d{4}$/.exec(id);
  const kind = LevelKind.safeParse(m?.[1]);
  if (!kind.success) throw new Error(`Level id "${id}" is not <kind>-<vintage> with a kind in ${LevelKind.options.join(', ')}`);
  return kind.data;
}

/** Terminology for a level id; throws when its kind has no complete entry, so a new kind can't ship unnamed. */
export function termsFor(id: LevelId | string): LevelTerms {
  const kind = levelKind(id);
  const terms = TERMINOLOGY[kind];
  if (!terms) throw new Error(`No terminology for level kind "${kind}" (add it to pipeline/terminology.ts)`);
  return LevelTerms.parse(terms);
}

/** Separator between dataset and level in layer titles (grouping uses `manifest.datasets`, not the title). */
export const TITLE_SEP = ' – ';

/** Layer title = dataset title + the level's plain name, per language. */
export function layerTitle(dataset: I18n, level: LevelId): I18n {
  const t = termsFor(level).title;
  return { he: `${dataset.he}${TITLE_SEP}${t.he}`, en: `${dataset.en}${TITLE_SEP}${t.en}`, ru: `${dataset.ru}${TITLE_SEP}${t.ru}` };
}

// Dataset wording, keyed by dataset id (pipeline/datasets/<id>). Dataset modules read it from here, so every
// user-facing string still lives in this file.

/** Wording shared by the CBS cluster indices (socio-economic, peripherality): clusters 1–10 + index + rank. */
export const CLUSTER_INDEX = {
  classLabel: (n: number): I18n => ({ he: `אשכול ${n}`, en: `Cluster ${n}`, ru: `Кластер ${n}` }),
  missingLabel: { he: 'לא חושב', en: 'Not calculated', ru: 'Не рассчитан' } satisfies I18n,
  fields: {
    cluster: { he: 'אשכול', en: 'Cluster', ru: 'Кластер' },
    index: { he: 'ערך מדד', en: 'Index value', ru: 'Значение индекса' },
    rank: { he: 'דירוג', en: 'Rank', ru: 'Место' },
  } satisfies Record<string, I18n>,
  /**
   * Legend note "1 – <low>, 10 – <high>", one style for every cluster index. An en dash rather than "=": it is the
   * usual Hebrew way to gloss a number, and in an RTL paragraph "1 – הכי פריפריאלי" keeps the digit at the start of
   * its phrase (the dash is a neutral between a number and Hebrew letters, so it stays with the phrase).
   */
  note: (scale: { low: I18n; high: I18n }): I18n => ({
    he: `1 – ${scale.low.he}, 10 – ${scale.high.he}`,
    en: `1 – ${scale.low.en}, 10 – ${scale.high.en}`,
    ru: `1 – ${scale.low.ru}, 10 – ${scale.high.ru}`,
  }),
};

export const DatasetTerms = z.strictObject({
  /** Dataset title: the group heading and the first half of every layer title. */
  title: I18n,
  /** Short credit for the map attribution control. */
  attribution: I18n,
  /** What cluster 1 and cluster 10 mean; the legend note is CLUSTER_INDEX.note(scale). */
  scale: z.strictObject({ low: I18n, high: I18n }),
  /** "Not calculated" explanation for each level kind the dataset ships. */
  missing: z.partialRecord(LevelKind, I18n),
  /** Popup labels of the dataset's own fields (beyond CLUSTER_INDEX.fields), keyed by record field. */
  fields: z.record(z.string(), I18n),
});
export type DatasetTerms = z.infer<typeof DatasetTerms>;

const NOT_CALCULATED_AUTHORITY: I18n = {
  he: 'הלמ"ס לא חישבה מדד לרשות זו.',
  en: 'CBS did not calculate the index for this authority.',
  ru: 'ЦСБ не рассчитывало индекс для этого органа власти.',
};

export const DATASET_TERMS: Record<string, DatasetTerms> = z.record(z.string(), DatasetTerms).parse({
  'ses-2021': {
    title: { he: 'מדד חברתי-כלכלי 2021', en: 'Socio-economic index 2021', ru: 'Социально-экономический индекс 2021' },
    attribution: { he: 'מדד חברתי-כלכלי 2021: הלמ"ס', en: 'Socio-Economic Index 2021: CBS Israel', ru: 'Социально-экономический индекс 2021: ЦСБ Израиля' },
    scale: {
      low: { he: 'הרמה החברתית-כלכלית הנמוכה ביותר', en: 'lowest socio-economic level', ru: 'самый низкий социально-экономический уровень' },
      high: { he: 'הגבוהה ביותר', en: 'highest', ru: 'самый высокий' },
    },
    missing: {
      'local-authorities': NOT_CALCULATED_AUTHORITY,
      'rc-localities': {
        he: 'הלמ"ס לא חישבה מדד ליישוב זה (פחות מ-120 תושבים, יישוב מוסדי או שאינו יישוב מגורים).',
        en: 'CBS did not calculate the index for this locality (fewer than 120 residents, institutional or non-residential).',
        ru: 'ЦСБ не рассчитывало индекс для этого населённого пункта (менее 120 жителей, учреждение или нежилая территория).',
      },
      'statistical-areas': {
        he: 'הלמ"ס לא חישבה מדד לאזור זה: פחות מ-120 תושבים, אזור שאינו למגורים, או עיר שאין לה נתונים ברמת אזור סטטיסטי (בעיקר יישובים ערביים ודרוזיים).',
        en: 'CBS did not calculate the index for this area: fewer than 120 residents, a non-residential area, or a city without statistical-area data (mostly Arab and Druze cities).',
        ru: 'ЦСБ не рассчитывало индекс для этого участка: менее 120 жителей, нежилая территория или город без данных на уровне статистических районов (в основном арабские и друзские города).',
      },
    },
    fields: {
      population: { he: 'אוכלוסיית המדד', en: 'Index population', ru: 'Население (для индекса)' },
    },
  },
  'peripherality-2020': {
    title: { he: 'מדד פריפריאליות 2020', en: 'Peripherality index 2020', ru: 'Индекс периферийности 2020' },
    attribution: { he: 'מדד פריפריאליות 2020: הלמ"ס', en: 'Peripherality Index 2020: CBS Israel', ru: 'Индекс периферийности 2020: ЦСБ Израиля' },
    scale: {
      low: { he: 'הכי פריפריאלי', en: 'most peripheral', ru: 'самая периферия' },
      high: { he: 'הכי מרכזי', en: 'most central', ru: 'самый центр' },
    },
    missing: {
      'local-authorities': NOT_CALCULATED_AUTHORITY,
      localities: {
        he: 'הלמ"ס לא חישבה מדד ליישוב זה: המדד אינו כולל שבטים בדואיים, אזורי תעשייה, מרכזים אזוריים ומקומות ללא מעמד מוניציפלי.',
        en: 'CBS did not calculate the index for this locality: it does not cover Bedouin tribes, industrial zones, regional centres or places without municipal status.',
        ru: 'ЦСБ не рассчитывало индекс для этого населённого пункта: индекс не охватывает бедуинские племена, промзоны, региональные центры и места без муниципального статуса.',
      },
    },
    fields: {
      distance_km: {
        he: 'מרחק מגבול מחוז תל אביב (ק"מ)',
        en: 'Distance from the Tel Aviv District boundary (km)',
        ru: 'Расстояние до границы Тель-Авивского округа (км)',
      },
      population: { he: 'אוכלוסייה 2020', en: 'Population 2020', ru: 'Население 2020' },
    },
  },
});

/** Wording for a dataset id; throws when it has no entry, so a new dataset can't ship unnamed. */
export function datasetTerms(id: string): DatasetTerms {
  const terms = DATASET_TERMS[id];
  if (!terms) throw new Error(`No wording for dataset "${id}" (add it to DATASET_TERMS in pipeline/terminology.ts)`);
  return terms;
}
