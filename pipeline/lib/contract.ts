// The data contract consumed by the viewer; docs/data-contract.md describes it in prose.
// The zod schemas are the single source of truth: types are inferred from them, and the build validates
// layers.json against them and writes dist/data/layers.schema.json from them.
import { z } from 'zod';

export const LANGS = ['he', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

const text = z.string().min(1);
const slug = z.string().regex(/^[a-z0-9-]+$/);
export const I18n = z.strictObject({ he: text, en: text, ru: text });
export type I18n = z.infer<typeof I18n>;

/** Level ids carry the boundary vintage: everything here derives from the CBS 2011 statistical-areas layer. */
export const LevelId = z.enum(['local-authorities-2011', 'localities-2011', 'rc-localities-2011', 'statistical-areas-2011']);
export type LevelId = z.infer<typeof LevelId>;
export const LEVEL_IDS = LevelId.options;

/** What a level is, independent of vintage: the level id is `<kind>-<vintage>`. Wording is keyed by it. */
export const LevelKind = z.enum(['local-authorities', 'localities', 'rc-localities', 'statistical-areas']);
export type LevelKind = z.infer<typeof LevelKind>;

const color = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * A descriptive feature property to show in the popup (the first one also in the tooltip). `list`: the property
 * is a non-empty string[] when present and absent otherwise. `textLang` is the language the values are written in,
 * whatever the UI language; `searchable` asks the viewer to index the values for search.
 */
export const ExtraField = z.strictObject({
  property: text,
  kind: z.literal('list'),
  textLang: z.enum(LANGS),
  label: I18n,
  /** Compact form of `label` for passing mentions (e.g. a search hint: "also searchable: Neighborhoods"). */
  shortLabel: I18n.optional(),
  /**
   * One value as a noun inside running text, singular and in sentence case ("neighborhood" / "שכונה" / "квартал"),
   * for the search placeholder ("Search a place or neighborhood"). Required when `searchable`.
   */
  searchTerm: I18n.optional(),
  searchable: z.boolean(),
});
export type ExtraField = z.infer<typeof ExtraField>;

/** CLDR plural categories, as `Intl.PluralRules` returns them. */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const countForm = text.refine((s) => s.includes('{n}') || !/\d/.test(s), { message: 'a count form holds {n} or no digits' });
/** Count phrases for one language, by plural category; `{n}` is the number ("{n} участков"). `other` is required. */
const CountFormsLang = z.strictObject({
  zero: countForm.optional(),
  one: countForm.optional(),
  two: countForm.optional(),
  few: countForm.optional(),
  many: countForm.optional(),
  other: countForm,
});
/**
 * "N features" for a level, per language and plural category ("169 участков", "169 אזורים", "169 areas"); the viewer
 * picks the form with `Intl.PluralRules(lang).select(n)`. The build checks every integer category of each language
 * has a form.
 */
export const CountForms = z.strictObject({ he: CountFormsLang, en: CountFormsLang, ru: CountFormsLang });
export type CountForms = z.infer<typeof CountForms>;

export const Level = z.strictObject({
  kind: LevelKind,
  /** Plain user-facing name ("Neighborhoods"). */
  title: I18n,
  /** The official CBS term for the level ("CBS statistical areas"), for small secondary text. */
  officialTerm: I18n.optional(),
  /**
   * `false`: show `officialTerm` in the layer switcher only, not in popups (where it would repeat on every feature
   * without adding anything). Absent: show it in both.
   */
  popupOfficialTerm: z.literal(false).optional(),
  /** TopoJSON file, relative to layers.json. */
  file: text,
  /** Name of the polygon object inside the TopoJSON `objects`. */
  object: text,
  /** Name of the point object holding one point per placeholder polygon (may be empty). */
  placeholderObject: text,
  /** Feature property holding the join code (always a string). */
  idProperty: z.literal('code'),
  featureCount: z.number().int().nonnegative(),
  placeholderCount: z.number().int().nonnegative(),
  /** Label template; `{name}` and other `{prop}` placeholders refer to feature properties. */
  featureLabel: I18n.optional(),
  /**
   * Set when features are parts of a larger named place: the property holding that place's code. `name_*` then hold
   * the place's name, shared by all its parts (statistical areas → `locality_code`, the city).
   */
  parentCode: text.optional(),
  /** Year of the features' `population` property (residents, for ordering places by size). */
  populationYear: z.number().int().optional(),
  /** What one feature of this level is called ("Statistical area"). */
  featureType: I18n.optional(),
  /** "N features" phrases ("169 участков"); set on levels with a `parentCode`, whose parts are counted per place. */
  countForms: CountForms.optional(),
  /** When the type varies within the level: the feature property holding it and a label per value. */
  featureTypes: z.strictObject({ property: text, labels: z.record(z.string(), I18n) }).optional(),
  /** Descriptive properties on the features (e.g. neighbourhood and street names), in display order. */
  extraFields: z.array(ExtraField).optional(),
});
export type Level = z.infer<typeof Level>;

const Missing = z.strictObject({ label: I18n, description: I18n, color });

/** One class per discrete value (e.g. CBS clusters 1–10). */
export const Categorical = z.strictObject({
  type: z.literal('categorical'),
  /** In display order; for ordered classifications also low → high. */
  classes: z.array(z.strictObject({ value: z.number(), label: I18n, color })).min(1),
  /**
   * `false` for nominal categories (locality type): no order, so no range slider and no "low → high" reading; class
   * order is display order only. Absent means ordered (CBS clusters 1–10).
   */
  ordered: z.literal(false).optional(),
  missing: Missing,
  note: I18n.optional(),
});

/**
 * Continuous values cut at ascending `breaks`: colors[0] below breaks[0], colors[i] for
 * breaks[i-1] ≤ v < breaks[i], the last color at or above the last break (MapLibre `step`).
 */
export const Stepped = z
  .strictObject({
    type: z.literal('stepped'),
    breaks: z.array(z.number()).min(1),
    colors: z.array(color),
    missing: Missing,
    note: I18n.optional(),
  })
  .refine((s) => s.colors.length === s.breaks.length + 1, { message: 'colors.length must be breaks.length + 1' })
  .refine((s) => s.breaks.every((b, i) => i === 0 || b > s.breaks[i - 1]), { message: 'breaks must ascend' });

export const Classification = z.union([Categorical, Stepped]);
export type Classification = z.infer<typeof Classification>;

export const PopupFormat = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('integer') }),
  z.strictObject({ type: z.literal('decimal'), decimals: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal('rank'), total: z.number().int().positive() }),
  /** The value is already in percent (2.5 → "2.5%"); `signed` shows "+" on positive values (growth). */
  z.strictObject({ type: z.literal('percent'), decimals: z.number().int().nonnegative(), signed: z.literal(true).optional() }),
  /** The value is a category code; show `labels[String(value)]`. */
  z.strictObject({ type: z.literal('category'), labels: z.record(z.string(), I18n) }),
  /**
   * A money amount (ISO 4217 code, e.g. "ILS"): `Intl.NumberFormat(lang, { style: 'currency', currency })`. When it
   * formats the layer's `valueField`, the legend's bin labels use it too ("₪80,000 – ₪100,000").
   */
  z.strictObject({ type: z.literal('currency'), currency: z.string().regex(/^[A-Z]{3}$/), decimals: z.number().int().nonnegative() }),
]);

export type PopupFormat = z.infer<typeof PopupFormat>;

export const PopupField = z.strictObject({ field: text, label: I18n, format: PopupFormat });
export type PopupField = z.infer<typeof PopupField>;

export const Source = z.strictObject({
  name: I18n,
  url: z.url(),
  license: text,
  licenseUrl: z.url(),
  /** Full citation in the form the publisher requires. */
  citation: text,
});
export type Source = z.infer<typeof Source>;

const layerBase = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Dataset folder the layer came from (pipeline/datasets/<dataset>); layers sharing it can be grouped. */
  dataset: text,
  /**
   * Which of the dataset's `measures` this layer maps, when the dataset has several layers on one level (population
   * size, growth…). Absent for single-measure datasets.
   */
  measure: slug.optional(),
  title: I18n,
  /** Dataset file, relative to layers.json. */
  data: text,
  valueField: text,
  classification: Classification,
  popup: z.array(PopupField),
  /** Short credit line for the map attribution control. */
  attribution: I18n,
  source: Source,
};

/** Polygons from a geometry level, coloured by a dataset record joined on `code`. */
export const ChoroplethLayer = z.strictObject({ ...layerBase, kind: z.literal('choropleth'), level: LevelId });
export type ChoroplethLayer = z.infer<typeof ChoroplethLayer>;

/** Self-contained GeoJSON FeatureCollection<Point> at `data`; values live in feature properties. */
export const PointsLayer = z.strictObject({ ...layerBase, kind: z.literal('points') });
export type PointsLayer = z.infer<typeof PointsLayer>;

export const Layer = z.discriminatedUnion('kind', [ChoroplethLayer, PointsLayer]);
export type Layer = z.infer<typeof Layer>;

/** A dataset (pipeline/datasets/<id>): its title heads the group of its layers. */
export const DatasetInfo = z.strictObject({
  title: I18n,
  /** Compact form of `title` for tight spaces (mobile sheet header). */
  shortTitle: I18n.optional(),
  description: I18n.optional(),
  /**
   * The dataset's measures, in display order, when it maps several variables (one layer per measure and level).
   * Every layer of such a dataset names one of these in `layer.measure`.
   */
  measures: z.array(z.strictObject({ id: slug, title: I18n })).min(1).optional(),
  /**
   * Per-feature notes, by level id and feature code: a caveat about that one place (a merged locality, an authority
   * counted with 2011 membership). Shown in the popup of every layer of this dataset on that level.
   */
  notes: z.partialRecord(LevelId, z.record(z.string().regex(/^\d+$/), I18n)).optional(),
});
export type DatasetInfo = z.infer<typeof DatasetInfo>;

export const Manifest = z
  .strictObject({
    version: z.literal(1),
    levels: z.record(LevelId, Level),
    /** Keyed by dataset id; every `layers[*].dataset` has an entry. */
    datasets: z.record(slug, DatasetInfo),
    layers: z.array(Layer),
    /** Credit for the geometry and names, shown whenever any level is on the map. */
    attribution: I18n,
    sources: z.array(Source),
  })
  .refine((m) => new Set(m.layers.map((l) => l.id)).size === m.layers.length, { message: 'layer ids must be unique' })
  .refine((m) => m.layers.every((l) => m.datasets[l.dataset]), { message: 'every layer.dataset must have a datasets entry' })
  .refine(
    (m) =>
      m.layers.every((l) => {
        const measures = m.datasets[l.dataset]?.measures;
        return measures ? measures.some((x) => x.id === l.measure) : l.measure === undefined;
      }),
    { message: 'a layer has a measure exactly when its dataset lists measures, and it must be one of them' },
  )
  .refine(
    (m) => {
      const keys = m.layers.map((l) => `${l.dataset}/${l.measure ?? ''}/${l.kind === 'choropleth' ? l.level : 'points'}`);
      return new Set(keys).size === keys.length;
    },
    { message: 'at most one layer per (dataset, measure, level)' },
  )
  .refine((m) => Object.entries(m.levels).every(([id, l]) => id.startsWith(`${l.kind}-`)), {
    message: 'each level id must be <kind>-<vintage>',
  });
export type Manifest = z.infer<typeof Manifest>;

/**
 * Dataset file for a choropleth layer: code → record. A code without a record, or a record without the layer's
 * `valueField`, is "not calculated" for that layer (layers of one dataset share the file; growth is left out where it
 * would be noise).
 */
export const DatasetValues = z.record(z.string().regex(/^\d+$/), z.record(z.string(), z.number()));
export type DatasetValues = z.infer<typeof DatasetValues>;

/** Problems as readable lines, or [] when valid. */
export function validateManifest(m: unknown): string[] {
  const r = Manifest.safeParse(m);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export const manifestJsonSchema = () => z.toJSONSchema(Manifest, { io: 'input', unrepresentable: 'any' });
