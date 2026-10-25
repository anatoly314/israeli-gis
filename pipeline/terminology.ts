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
    officialTerm: { he: 'יישובים (קובץ היישובים של הלמ"ס)', en: 'CBS localities', ru: 'населённые пункты ЦСБ' },
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
