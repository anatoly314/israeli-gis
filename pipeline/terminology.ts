// User-facing wording for every geometry level, in one place. The build applies it to each level by its kind
// (the level id without the vintage), so a new vintage such as `statistical-areas-2022` or a new dataset picks
// up the same names without any string edits; `{vintage}` in an official term becomes the level's year. To change
// wording: edit this file, `npm run build:data`,
// `npm run build:viewer`.
import { z } from 'zod';
import { CountForms, I18n, LevelKind, type DatasetInfo, type LevelId } from './lib/contract.ts';

export const LevelTerms = z.strictObject({
  /** Plain name shown to users ("Neighborhoods"). */
  title: I18n,
  /** The official CBS term, shown as small secondary text ("CBS statistical areas"). */
  officialTerm: I18n,
  /** `false`: the official term only distinguishes levels in the switcher; don't repeat it in every popup. */
  popupOfficialTerm: z.literal(false).optional(),
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
    popupOfficialTerm: false,
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
    // The Russian CBS term is "статистические районы" everywhere (official term, sources, attribution). Two SA
    // vintages ship (2011 under the socio-economic index, 2022 under the census) with different boundaries and
    // numbering, so the official term names the division; `{vintage}` is the year from the level id.
    officialTerm: {
      he: 'אזורים סטטיסטיים של הלמ"ס, חלוקת {vintage}',
      en: 'CBS statistical areas, {vintage} division',
      ru: 'статистические районы ЦСБ, деление {vintage} года',
    },
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

/**
 * Terminology for a level id, with `{vintage}` in the official term replaced by the id's year; throws when its kind
 * has no complete entry, so a new kind can't ship unnamed.
 */
export function termsFor(id: LevelId | string): LevelTerms {
  const kind = levelKind(id);
  const terms = TERMINOLOGY[kind];
  if (!terms) throw new Error(`No terminology for level kind "${kind}" (add it to pipeline/terminology.ts)`);
  const vintage = id.slice(kind.length + 1);
  const o = terms.officialTerm;
  const officialTerm = { he: o.he.replace('{vintage}', vintage), en: o.en.replace('{vintage}', vintage), ru: o.ru.replace('{vintage}', vintage) };
  return LevelTerms.parse({ ...terms, officialTerm });
}

/** Separator between dataset and level in layer titles (grouping uses `manifest.datasets`, not the title). */
export const TITLE_SEP = ' – ';

/**
 * Layer title = dataset title + the level's plain name, per language; with a measure, dataset + measure + level
 * ("Population 2024 – Growth 2022–24 – Localities").
 */
export function layerTitle(dataset: I18n, level: LevelId, measure?: I18n): I18n {
  const t = termsFor(level).title;
  const join = (l: keyof I18n) => [dataset[l], ...(measure ? [measure[l]] : []), t[l]].join(TITLE_SEP);
  return { he: join('he'), en: join('en'), ru: join('ru') };
}

/** Points layers have no level: title = dataset title (+ measure title), e.g. "Schools 2026 – Education stream". */
export function pointsLayerTitle(dataset: I18n, measure?: I18n): I18n {
  const join = (l: keyof I18n) => [dataset[l], ...(measure ? [measure[l]] : [])].join(TITLE_SEP);
  return { he: join('he'), en: join('en'), ru: join('ru') };
}

// Dataset wording, keyed by dataset id (pipeline/datasets/<id>). Dataset modules read it from here, so every
// user-facing string still lives in this file.

/**
 * What cluster 1 and cluster 10 of an index mean. `rankLow` is a shorter `low` for the rank label, when `low` is too
 * long for a popup label.
 */
const Scale = z.strictObject({ low: I18n, high: I18n, rankLow: I18n.optional() });
type Scale = z.infer<typeof Scale>;

/** Wording shared by the CBS cluster indices (socio-economic, peripherality): clusters 1–10 + index + rank. */
export const CLUSTER_INDEX = {
  classLabel: (n: number): I18n => ({ he: `אשכול ${n}`, en: `Cluster ${n}`, ru: `Кластер ${n}` }),
  missingLabel: { he: 'לא חושב', en: 'Not calculated', ru: 'Не рассчитан' } satisfies I18n,
  fields: {
    cluster: { he: 'אשכול', en: 'Cluster', ru: 'Кластер' },
    index: { he: 'ערך מדד', en: 'Index value', ru: 'Значение индекса' },
  } satisfies Record<string, I18n>,
  /**
   * Popup label of CBS's rank, which counts from the bottom (1 = lowest index value). Says what rank 1 means, since
   * a bare "Rank" / "Место" reads as a competition place where 1 is best. Russian takes "Ранг", not "Место".
   */
  rankLabel: (scale: Scale): I18n => {
    const low = scale.rankLow ?? scale.low;
    return { he: `דירוג (1 – ${low.he})`, en: `Rank (1 = ${low.en})`, ru: `Ранг (1 — ${low.ru})` };
  },
  /**
   * Legend note "1 – <low>, 10 – <high>", one style for every cluster index. An en dash rather than "=": it is the
   * usual Hebrew way to gloss a number, and in an RTL paragraph "1 – הכי פריפריאלי" keeps the digit at the start of
   * its phrase (the dash is a neutral between a number and Hebrew letters, so it stays with the phrase).
   */
  note: (scale: Scale): I18n => ({
    he: `1 – ${scale.low.he}, 10 – ${scale.high.he}`,
    en: `1 – ${scale.low.en}, 10 – ${scale.high.en}`,
    ru: `1 – ${scale.low.ru}, 10 – ${scale.high.ru}`,
  }),
};

/** One variable of a multi-measure dataset: its title, legend note, "not calculated" texts and class labels. */
export const MeasureTerms = z.strictObject({
  title: I18n,
  /** Legend caption. */
  note: I18n.optional(),
  /** "Not calculated" explanation for each level kind the measure is mapped on. */
  missing: z.partialRecord(LevelKind, I18n),
  /** Points layers (no level): explanation for a point without a value. */
  missingPoint: I18n.optional(),
  /** Labels of nominal classes, keyed by the class value. */
  classes: z.record(z.string(), I18n).optional(),
});
export type MeasureTerms = z.infer<typeof MeasureTerms>;

export const DatasetTerms = z.strictObject({
  /** Dataset title: the group heading and the first part of every layer title. */
  title: I18n,
  /** Compact title for tight spaces (mobile sheet). */
  shortTitle: I18n.optional(),
  /** Optional longer text shown under the group heading (caveats that apply to every layer). */
  description: I18n.optional(),
  /** Per-feature caveats by level kind and feature code (manifest `datasets[id].notes`, keyed by level id). */
  notes: z.partialRecord(LevelKind, z.record(z.string(), I18n)).optional(),
  /** Short credit for the map attribution control. */
  attribution: I18n,
  /** Points datasets: what one point is called ("School"). */
  featureType: I18n.optional(),
  /** Points datasets: "N schools" phrases by plural category (contract `CountForms`), copied to each points layer. */
  countForms: CountForms.optional(),
  /** Cluster indices: what cluster 1 and cluster 10 mean; the legend note is CLUSTER_INDEX.note(scale). */
  scale: Scale.optional(),
  /** Single-measure datasets: "not calculated" explanation for each level kind the dataset ships. */
  missing: z.partialRecord(LevelKind, I18n).optional(),
  /** Popup labels of the dataset's own fields (beyond CLUSTER_INDEX.fields), keyed by record field. */
  fields: z.record(z.string(), I18n),
  /** Multi-measure datasets, in display order (object key order), keyed by measure id. */
  measures: z.record(z.string(), MeasureTerms).optional(),
  /** Class labels of popup-only category fields, by field and value. */
  popupClasses: z.record(z.string(), z.record(z.string(), I18n)).optional(),
});
export type DatasetTerms = z.infer<typeof DatasetTerms>;

const NOT_CALCULATED_AUTHORITY: I18n = {
  he: 'הלמ"ס לא חישבה מדד לרשות זו.',
  en: 'CBS did not calculate the index for this authority.',
  ru: 'ЦСБ не рассчитывало индекс для этого органа власти.',
};

/** Missing-data label for non-index datasets (population and later). */
export const NO_DATA: I18n = { he: 'אין נתון', en: 'No data', ru: 'Нет данных' };

const NO_POPULATION_LOCALITY: I18n = {
  he: 'הלמ"ס אינה מפרסמת אוכלוסייה למקום זה (שטח לא מיושב, אזור תעשייה או שבט בדואי).',
  en: 'CBS publishes no population for this place (uninhabited, an industrial zone or a Bedouin tribe).',
  ru: 'ЦСБ не публикует численность для этого места (незаселённое, промзона или бедуинское племя).',
};
const NOT_CLASSIFIED_SCHOOL: I18n = {
  he: 'משרד החינוך אינו מסווג מוסד זה.',
  en: 'The Ministry of Education gives no class for this institution.',
  ru: 'Министерство образования не классифицирует это учреждение.',
};
const NO_CENSUS_LOCALITY: I18n = {
  he: 'הלמ"ס אינה מפרסמת נתון מפקד למקום זה (שטח לא מיושב, יישוב מוסדי, או אומדן לא אמין).',
  en: 'CBS publishes no census figure for this place (uninhabited, institutional, or no reliable estimate).',
  ru: 'ЦСБ не публикует данные переписи для этого места (незаселённое, учреждение или нет надёжной оценки).',
};
const NO_CENSUS_SA: I18n = {
  he: 'הלמ"ס אינה מפרסמת נתון מפקד לאזור זה: שטח פתוח, אזור תעשייה או מוסדות; עיר שפורסמה רק ברמת היישוב (דיר חנא, כאבול, מג\'דל שמס); או שאין אומדן אמין לנתון זה.',
  en: 'CBS publishes no census figure for this area: open land, industry or institutions; a city published at locality level only (Deir Hanna, Kabul, Majdal Shams); or no reliable estimate for this figure.',
  ru: 'ЦСБ не публикует этот показатель переписи для участка: открытая местность, промзона или учреждения; город, опубликованный только целиком (Дейр-Ханна, Кабуль, Мадждаль-Шамс); или нет надёжной оценки.',
};
/**
 * Popup note on an SA whose census row CBS published jointly with neighbouring SAs; `n` is the group size, this SA
 * included (2–6). Russian "для N участков" takes the genitive: plural "участков" except after numbers ending in 1
 * (21, 31…: "участка"), which Intl's `one` category marks.
 */
export function combinedSaNote(n: number): I18n {
  if (!Number.isInteger(n) || n < 2) throw new Error(`combinedSaNote: a group has 2+ areas, got ${n}`);
  const ru = new Intl.PluralRules('ru').select(n) === 'one' ? 'участка' : 'участков';
  return {
    he: `נתונים שפורסמו במשותף ל-${n} אזורים (כולל זה); האוכלוסייה היא סך כולם`,
    en: `Figures published jointly for ${n} areas (incl. this one); population is their combined total.`,
    ru: `Данные опубликованы совместно для ${n} ${ru} (включая этот); население — их общая сумма`,
  };
}

const NO_POPULATION_AUTHORITY: I18n = {
  he: 'אין אוכלוסייה לרשות זו (מועצה מקומית תעשייתית).',
  en: 'This authority has no residents (an industrial local council).',
  ru: 'У этого органа власти нет жителей (промышленный местный совет).',
};

export const DATASET_TERMS: Record<string, DatasetTerms> = z.record(z.string(), DatasetTerms).parse({
  'ses-2021': {
    title: { he: 'מדד חברתי-כלכלי 2021', en: 'Socio-economic index 2021', ru: 'Социально-экономический индекс 2021' },
    shortTitle: { he: 'מדד חברתי-כלכלי 2021', en: 'Socio-economic 2021', ru: 'Соц.-экон. индекс 2021' },
    attribution: { he: 'מדד חברתי-כלכלי 2021: הלמ"ס', en: 'Socio-Economic Index 2021: CBS Israel', ru: 'Социально-экономический индекс 2021: ЦСБ Израиля' },
    scale: {
      low: { he: 'הרמה החברתית-כלכלית הנמוכה ביותר', en: 'lowest socio-economic level', ru: 'самый низкий социально-экономический уровень' },
      high: { he: 'הגבוהה ביותר', en: 'highest', ru: 'самый высокий' },
      rankLow: { he: 'הנמוך ביותר', en: 'lowest', ru: 'самый низкий' },
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
    shortTitle: { he: 'פריפריאליות 2020', en: 'Peripherality 2020', ru: 'Периферийность 2020' },
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
  'population-2024': {
    title: { he: 'אוכלוסייה 2024', en: 'Population 2024', ru: 'Население 2024' },
    shortTitle: { he: 'אוכלוסייה 2024', en: 'Population 2024', ru: 'Население 2024' },
    description: {
      he: 'אומדני אוכלוסייה לסוף 2024 (קובץ היישובים של הלמ"ס) על גבולות 2011: כוכב יעקב כולל את תל ציון; 5 יישובים שנוסדו אחרי 2021 אינם על המפה; רשויות לפי השיוך של 2011 (צור הדסה במטה יהודה, שער שומרון בשומרון). ייתכן ששינויים בין 2022 ל-2024 ביישובים מסוימים משקפים עקירה בזמן המלחמה (לא נבדק).',
      en: "End-2024 population estimates (CBS localities file) on 2011 boundaries: Kokhav Ya'akov includes Tel Zion; 5 localities founded after 2021 have no boundary; authorities follow 2011 membership (Tzur Hadassa in Mateh Yehuda, Sha'ar Shomron in Shomron). Changes from 2022 to 2024 in some places may reflect wartime displacement (not verified).",
      ru: 'Оценки населения на конец 2024 года (файл населённых пунктов ЦСБ) в границах 2011 года: Кохав-Яаков включает Тель-Цион; 5 населённых пунктов, основанных после 2021 года, на карте нет; органы власти — по составу 2011 года (Цур-Хадасса в Мате-Йехуде, Шаар-Шомрон в Шомроне). Изменения с 2022 по 2024 год в некоторых местах могут отражать вынужденное переселение во время войны (не проверено).',
    },
    notes: {
      localities: {
        3779: {
          he: 'כולל את תל ציון (3815), שהפכה ליישוב נפרד ב-2023; הצורה על המפה מכסה את שניהם.',
          en: 'Includes Tel Zion (3815), which became a separate locality in 2023; the shared polygon covers both.',
          ru: 'Включает Тель-Цион (3815), ставший отдельным населённым пунктом в 2023 году; общий полигон охватывает оба.',
        },
      },
      'local-authorities': {
        5526: {
          he: 'כולל את צור הדסה, מועצה מקומית נפרדת מאז 2024 (נספרת כאן בשתי השנים).',
          en: 'Includes Tzur Hadassa, a separate local council since 2024 (counted here in both years).',
          ru: 'Включает Цур-Хадассу, отдельный местный совет с 2024 года (учтена здесь за оба года).',
        },
        5572: {
          he: 'כולל את שער שומרון, מועצה מקומית נפרדת מאז 2022 (נספרת כאן בשתי השנים).',
          en: "Includes Sha'ar Shomron, a separate local council since 2022 (counted here in both years).",
          ru: 'Включает Шаар-Шомрон, отдельный местный совет с 2022 года (учтён здесь за оба года).',
        },
      },
    },
    attribution: { he: 'אוכלוסייה 2024: הלמ"ס', en: 'Population 2024: CBS Israel', ru: 'Население 2024: ЦСБ Израиля' },
    fields: {
      population: { he: 'תושבים 2024', en: 'Residents 2024', ru: 'Жители 2024' },
      israelis: { he: 'ישראלים 2024', en: 'Israeli residents 2024', ru: 'Израильские жители 2024' },
      israelis_2022: { he: 'ישראלים 2022', en: 'Israeli residents 2022', ru: 'Израильские жители 2022' },
      growth_pct: { he: 'גידול 2022–2024 (ישראלים)', en: 'Growth 2022–24 (Israelis)', ru: 'Прирост 2022–24 (израильтяне)' },
      jews_others_pct: { he: 'יהודים ואחרים (% מהישראלים)', en: 'Jews and others (% of Israelis)', ru: 'Евреи и прочие (% израильтян)' },
      arabs_pct: { he: 'ערבים (% מהישראלים)', en: 'Arabs (% of Israelis)', ru: 'Арабы (% израильтян)' },
      group: { he: 'קבוצת אוכלוסייה', en: 'Population group', ru: 'Группа населения' },
      type: { he: 'סוג יישוב', en: 'Locality type', ru: 'Тип населённого пункта' },
    },
    measures: {
      size: {
        title: { he: 'מספר תושבים', en: 'Residents', ru: 'Численность' },
        note: { he: 'תושבים בסוף 2024, כולל זרים', en: 'Residents at the end of 2024, foreigners included', ru: 'Жители на конец 2024 года, включая иностранцев' },
        missing: { localities: NO_POPULATION_LOCALITY, 'local-authorities': NO_POPULATION_AUTHORITY },
      },
      // Logical order "2022–2024": in an RTL paragraph the bidi algorithm shows it as 2024–2022, which a Hebrew
      // reader reads right to left as "from 2022 to 2024".
      growth: {
        title: { he: 'גידול 2022–2024', en: 'Growth 2022–24', ru: 'Прирост 2022–24' },
        note: {
          he: 'ישראלים בלבד; 2022 חושב מחדש לאחר מפקד 2022',
          en: 'Israeli residents only; 2022 recomputed after the 2022 census',
          ru: 'Только израильские жители; 2022 год пересчитан после переписи 2022 года',
        },
        missing: {
          localities: {
            he: 'לא מוצג: פחות מ-500 ישראלים ב-2022 (השינוי אינו יציב), או שאין נתון ל-2022.',
            en: 'Not shown: fewer than 500 Israeli residents in 2022 (too noisy), or no 2022 figure.',
            ru: 'Не показано: менее 500 израильских жителей в 2022 году (слишком неустойчиво) или нет данных за 2022 год.',
          },
          'local-authorities': NO_POPULATION_AUTHORITY,
        },
      },
      group: {
        title: { he: 'קבוצת אוכלוסייה', en: 'Population group', ru: 'Группа населения' },
        note: {
          he: 'סיווג היישוב בלמ"ס (דת יישוב); בקובץ 2024 אין פילוח של יהודים בלבד',
          en: 'CBS classification of the locality; the 2024 file has no Jews-only count',
          ru: 'Классификация населённого пункта ЦСБ; в файле 2024 года нет отдельного числа евреев',
        },
        missing: { localities: NO_POPULATION_LOCALITY },
        classes: {
          1: { he: 'יישוב יהודי', en: 'Jewish locality', ru: 'Еврейский населённый пункт' },
          2: {
            he: "יישוב לא-יהודי (ערבי, דרוזי, צ'רקסי)",
            en: 'Non-Jewish locality (Arab, Druze, Circassian)',
            ru: 'Нееврейский населённый пункт (арабский, друзский, черкесский)',
          },
          4: { he: 'יישוב מעורב', en: 'Mixed locality', ru: 'Смешанный населённый пункт' },
        },
      },
      type: {
        title: { he: 'סוג יישוב', en: 'Locality type', ru: 'Тип населённого пункта' },
        note: {
          he: 'סוג היישוב לפי הלמ"ס (2024), בקבוצות; יישוב עירוני – 2,000 תושבים ומעלה',
          en: 'CBS locality type (2024), grouped; towns and cities have 2,000+ residents',
          ru: 'Тип по ЦСБ (2024), сгруппирован; города — от 2000 жителей',
        },
        missing: { localities: NO_POPULATION_LOCALITY },
        classes: {
          // CBS's "Jewish" urban codes include the mixed cities (Tel Aviv, Jerusalem, Haifa…), hence "or mixed".
          1: { he: 'יישוב עירוני – יהודי או מעורב', en: 'Town or city – Jewish or mixed', ru: 'Город (еврейский или смешанный)' },
          2: { he: "יישוב עירוני – ערבי, דרוזי או צ'רקסי", en: 'Arab, Druze or Circassian town', ru: 'Арабский, друзский или черкесский город' },
          3: { he: 'מושב', en: 'Moshav', ru: 'Мошав' },
          4: { he: 'קיבוץ', en: 'Kibbutz', ru: 'Кибуц' },
          5: { he: 'יישוב קהילתי', en: 'Community settlement', ru: 'Общинное поселение' },
          6: { he: 'יישוב כפרי אחר או מוסדי', en: 'Other rural or institutional', ru: 'Другое сельское поселение или учреждение' },
          // CBS code 450: 26 villages in regional councils, Arab and Bedouin plus Druze Ein al-Asad and Circassian
          // Rihaniya.
          7: {
            he: "כפר ערבי, דרוזי, צ'רקסי או בדואי",
            en: 'Arab, Druze, Circassian or Bedouin village',
            ru: 'Арабская, друзская, черкесская или бедуинская деревня',
          },
        },
      },
    },
  },
  'census-2022': {
    title: { he: 'מפקד האוכלוסין 2022', en: 'Census 2022', ru: 'Перепись населения 2022' },
    shortTitle: { he: 'מפקד 2022', en: 'Census 2022', ru: 'Перепись 2022' },
    description: {
      he: 'מפקד האוכלוסין והדיור 2022 של הלמ"ס, לפי יישוב ולפי אזור סטטיסטי (חלוקת 2022, שונה מחלוקת 2011 של המדד החברתי-כלכלי). נתוני השכלה, שכר, דיור ודתיות הם אומדנים על בסיס מדגם של כ-20% מהאוכלוסייה; אחוזים מעוגלים לעשירית. אזורים קטנים פורסמו לעיתים יחד עם אזור שכן, ואז מוצג הנתון המשותף בכל אחד מהם. הפזורה הבדואית בדרום אינה על המפה.',
      en: "CBS Population and Housing Census 2022, by locality and by statistical area (2022 division, which differs from the socio-economic index's 2011 one). Education, wage, housing and religiosity figures are estimates based on a ~20% sample; percentages are rounded to 0.1. Small areas were sometimes published together with a neighbouring one; each then shows the shared figure. The southern Bedouin dispersion is not on the map.",
      ru: 'Перепись населения и жилья ЦСБ 2022 года по населённым пунктам и статистическим районам (деление 2022 года, отличается от деления 2011 года в социально-экономическом индексе). Данные об образовании, зарплате, жилье и религиозности — оценки по выборке около 20% населения; проценты округлены до 0,1. Малые участки иногда опубликованы вместе с соседним; тогда у каждого показаны общие данные. Бедуинского рассеянного населения на юге на карте нет.',
    },
    attribution: { he: 'מפקד האוכלוסין 2022: הלמ"ס', en: 'Census 2022: CBS Israel', ru: 'Перепись 2022: ЦСБ Израиля' },
    fields: {
      population: { he: 'אוכלוסייה (מפקד 2022)', en: 'Population (census 2022)', ru: 'Население (перепись 2022)' },
      age_median: { he: 'גיל חציוני', en: 'Median age', ru: 'Медианный возраст' },
      age65_pct: { he: 'בני 65 ומעלה', en: 'Aged 65+', ru: '65 лет и старше' },
      academic_pct: { he: 'בעלי תואר אקדמי (בני 15+)', en: 'Academic degree (aged 15+)', ru: 'С высшим образованием (15+ лет)' },
      wage_median: { he: 'שכר שנתי חציוני של שכירים', en: 'Median annual wage of employees', ru: 'Медианная годовая зарплата наёмных работников' },
      rent_pct: { he: 'משקי בית בשכירות', en: 'Households renting', ru: 'Домохозяйства, снимающие жильё' },
      religiosity: { he: 'רמת דתיות עיקרית של משקי הבית', en: 'Main household religiosity', ru: 'Преобладающая религиозность домохозяйств' },
    },
    measures: {
      'median-age': {
        title: { he: 'גיל חציוני', en: 'Median age', ru: 'Медианный возраст' },
        note: { he: 'בשנים; מחצית מהתושבים צעירים יותר', en: 'Years; half of the residents are younger', ru: 'Лет; половина жителей моложе' },
        missing: { localities: NO_CENSUS_LOCALITY, 'statistical-areas': NO_CENSUS_SA },
      },
      'aged-65': {
        title: { he: 'בני 65 ומעלה', en: 'Aged 65+', ru: '65 лет и старше' },
        note: { he: '% מהתושבים', en: '% of residents', ru: '% жителей' },
        missing: { localities: NO_CENSUS_LOCALITY, 'statistical-areas': NO_CENSUS_SA },
      },
      academic: {
        title: { he: 'בעלי תואר אקדמי', en: 'Academic degree', ru: 'С высшим образованием' },
        note: { he: '% מבני 15 ומעלה; אומדן מדגמי', en: '% of residents aged 15+; sample estimate', ru: '% жителей от 15 лет; выборочная оценка' },
        missing: { localities: NO_CENSUS_LOCALITY, 'statistical-areas': NO_CENSUS_SA },
      },
      wage: {
        title: { he: 'שכר חציוני של שכירים', en: 'Median employee wage', ru: 'Медианная зарплата наёмных работников' },
        note: {
          he: 'הכנסה שנתית חציונית מעבודה, ₪; אומדן מדגמי',
          en: 'Median annual income from work, ₪; sample estimate',
          ru: 'Медианный годовой доход от работы, ₪; выборочная оценка',
        },
        missing: { localities: NO_CENSUS_LOCALITY, 'statistical-areas': NO_CENSUS_SA },
      },
      renting: {
        title: { he: 'גרים בשכירות', en: 'Renting', ru: 'Снимают жильё' },
        note: { he: '% ממשקי הבית; אומדן מדגמי', en: '% of households; sample estimate', ru: '% домохозяйств; выборочная оценка' },
        missing: { localities: NO_CENSUS_LOCALITY, 'statistical-areas': NO_CENSUS_SA },
      },
      religiosity: {
        title: { he: 'רמת דתיות של משק הבית', en: 'Household religiosity', ru: 'Религиозность домохозяйства' },
        // Title kept as "רמת דתיות" rather than CBS's "אורח חיים עיקרי למשק בית": "lifestyle" alone doesn't say that
        // religious observance is what is measured. The note names the CBS variable, so both terms are on screen.
        note: {
          he: 'הרמה השכיחה ביותר במשקי הבית ביישוב או באזור, בדיווח עצמי ("אורח חיים עיקרי למשק בית" בלמ"ס). חלה על כל הדתות: ביישובים ערביים ודרוזיים זו מידת השמירה על הדת המוסלמית, הנוצרית או הדרוזית, באותו סולם. אומדן מדגמי.',
          en: "The most common level among the households of the locality or area, self-reported (CBS \"main household lifestyle\"). It covers all religions: in Arab and Druze localities it is Muslim, Christian or Druze observance on the same scale. Sample estimate.",
          ru: 'Самый частый уровень среди домохозяйств населённого пункта или участка, по самоопределению (в ЦСБ — «основной образ жизни домохозяйства»). Относится ко всем религиям: в арабских и друзских населённых пунктах это соблюдение мусульманской, христианской или друзской традиции по той же шкале. Выборочная оценка.',
        },
        missing: { localities: NO_CENSUS_LOCALITY, 'statistical-areas': NO_CENSUS_SA },
        classes: {
          1: { he: 'חילוני', en: 'Secular', ru: 'Светские' },
          2: { he: 'מסורתי', en: 'Traditional', ru: 'Традиционные' },
          3: { he: 'דתי או דתי מאוד', en: 'Religious or very religious', ru: 'Религиозные или очень религиозные' },
          4: { he: 'חרדי', en: 'Haredi', ru: 'Харедим (ультраортодоксы)' },
          6: { he: 'אחר', en: 'Other', ru: 'Другое' },
        },
      },
    },
  },
  'schools-2026': {
    title: { he: 'בתי ספר 2026', en: 'Schools 2026', ru: 'Школы 2026' },
    shortTitle: { he: 'בתי ספר', en: 'Schools', ru: 'Школы' },
    description: {
      he: 'רשימת מוסדות החינוך של משרד החינוך (data.gov.il, אוקטובר 2026): בתי ספר יסודיים ועל-יסודיים, כולל ישיבות קטנות ותלמודי תורה, בלי גני ילדים. אין מספרי תלמידים. 309 בתי ספר מוקמו במרכז היישוב בלבד.',
      en: 'Ministry of Education list of institutions (data.gov.il, October 2026): primary and secondary schools, including yeshivot ketanot and talmudei torah, without kindergartens. No student counts. 309 schools are placed only at their locality centre.',
      ru: 'Список учебных заведений Министерства образования (data.gov.il, октябрь 2026): начальные и средние школы, включая малые ешивы и талмуд-торы, без детских садов. Числа учеников нет. 309 школ размещены лишь в центре населённого пункта.',
    },
    attribution: { he: 'בתי ספר: משרד החינוך, data.gov.il', en: 'Schools: Ministry of Education, data.gov.il', ru: 'Школы: Министерство образования, data.gov.il' },
    featureType: { he: 'בית ספר', en: 'School', ru: 'Школа' },
    // Schools at one location (a shared campus): "15 школ". Hebrew 1 is "בית ספר אחד" (number after the noun).
    countForms: {
      he: { one: 'בית ספר אחד', two: '{n} בתי ספר', other: '{n} בתי ספר' },
      en: { one: '{n} school', other: '{n} schools' },
      ru: { one: '{n} школа', few: '{n} школы', many: '{n} школ', other: '{n} школы' },
    },
    fields: {
      stream: { he: 'זרם חינוך', en: 'Education stream', ru: 'Тип школы' },
      stage: { he: 'שלב חינוך', en: 'School level', ru: 'Ступень' },
      status: { he: 'מעמד משפטי', en: 'Legal status', ru: 'Правовой статус' },
      gender: { he: 'הרכב תלמידים', en: 'Students', ru: 'Ученики' },
      special: { he: 'סוג חינוך', en: 'Education type', ru: 'Тип обучения' },
      approx: { he: 'מיקום', en: 'Location', ru: 'Расположение' },
    },
    measures: {
      stream: {
        title: { he: 'זרם חינוך', en: 'Education stream', ru: 'Тип школы' },
        note: {
          he: 'לפי מגזר ופיקוח במשרד החינוך',
          en: 'By Ministry of Education sector and supervision',
          ru: 'По сектору и надзору Министерства образования',
        },
        missing: {},
        missingPoint: NOT_CLASSIFIED_SCHOOL,
        classes: {
          1: { he: 'ממלכתי', en: 'State', ru: 'Государственные' },
          2: { he: 'ממלכתי-דתי', en: 'State-religious', ru: 'Государственно-религиозные' },
          3: { he: 'חרדי', en: 'Haredi', ru: 'Харедимные (ультраортодоксальные)' },
          4: { he: 'ערבי ובדואי', en: 'Arab and Bedouin', ru: 'Арабские и бедуинские' },
          5: { he: "דרוזי וצ'רקסי", en: 'Druze and Circassian', ru: 'Друзские и черкесские' },
        },
      },
      stage: {
        title: { he: 'שלב חינוך', en: 'School level', ru: 'Ступень' },
        note: { he: 'השכבות שבית הספר מלמד', en: 'The grades a school teaches', ru: 'Классы, в которых учит школа' },
        missing: {},
        missingPoint: NOT_CLASSIFIED_SCHOOL,
        classes: {
          1: { he: 'יסודי', en: 'Primary', ru: 'Начальная' },
          2: { he: 'חטיבת ביניים', en: 'Middle school', ru: 'Средняя (7–9 классы)' },
          3: { he: 'תיכון (כולל שש-שנתי)', en: 'High school (incl. grades 7–12)', ru: 'Старшая (включая 7–12 классы)' },
          4: { he: 'רב-שלבי (מהיסודי ומעלה)', en: 'Primary through secondary', ru: 'Многоступенчатая (с 1 класса)' },
        },
      },
    },
    popupClasses: {
      status: {
        1: { he: 'רשמי', en: 'Official (state-run)', ru: 'Официальная (государственная)' },
        2: { he: 'מוכר שאינו רשמי', en: 'Recognised, unofficial', ru: 'Признанная неофициальная' },
        3: { he: 'תרבותי-ייחודי', en: 'Unique cultural', ru: 'Уникально-культурная' },
        4: { he: 'פטור', en: 'Exempt (Compulsory Education Law)', ru: 'Освобождённая (закон об обязательном образовании)' },
      },
      gender: {
        1: { he: 'בנים', en: 'Boys', ru: 'Мальчики' },
        2: { he: 'בנות', en: 'Girls', ru: 'Девочки' },
        3: { he: 'מעורב', en: 'Mixed', ru: 'Смешанная' },
      },
      special: { 1: { he: 'חינוך מיוחד', en: 'Special education', ru: 'Специальное образование' } },
      approx: {
        1: { he: 'משוער – במרכז היישוב', en: 'Approximate: locality centre', ru: 'Приблизительно: центр населённого пункта' },
      },
    },
  },
});

/**
 * `manifest.datasets[id]` from the dataset's wording: title, short title, description, measures (in order) and the
 * per-feature notes, re-keyed from level kind to the level ids the dataset ships.
 */
export function datasetInfo(id: string, levels: LevelId[]): DatasetInfo {
  const t = datasetTerms(id);
  const notes = Object.fromEntries(
    levels.flatMap((level) => {
      const n = t.notes?.[levelKind(level)];
      return n ? [[level, n]] : [];
    }),
  );
  return {
    title: t.title,
    ...(t.shortTitle && { shortTitle: t.shortTitle }),
    ...(t.description && { description: t.description }),
    ...(t.measures && { measures: Object.entries(t.measures).map(([mid, m]) => ({ id: mid, title: m.title })) }),
    ...(Object.keys(notes).length && { notes }),
  };
}

/** Wording for a dataset id; throws when it has no entry, so a new dataset can't ship unnamed. */
export function datasetTerms(id: string): DatasetTerms {
  const terms = DATASET_TERMS[id];
  if (!terms) throw new Error(`No wording for dataset "${id}" (add it to DATASET_TERMS in pipeline/terminology.ts)`);
  return terms;
}
