// The data contract consumed by the viewer; docs/data-contract.md describes it in prose.
// The zod schemas are the single source of truth: types are inferred from them, and the build validates
// layers.json against them and writes dist/data/layers.schema.json from them.
import { z } from 'zod';

export const LANGS = ['he', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

const text = z.string().min(1);
export const I18n = z.strictObject({ he: text, en: text, ru: text });
export type I18n = z.infer<typeof I18n>;

/** Level ids carry the boundary vintage: everything here derives from the CBS 2011 statistical-areas layer. */
export const LevelId = z.enum(['local-authorities-2011', 'localities-2011', 'rc-localities-2011', 'statistical-areas-2011']);
export type LevelId = z.infer<typeof LevelId>;
export const LEVEL_IDS = LevelId.options;

const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const Level = z.strictObject({
  title: I18n,
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
  /** When the type varies within the level: the feature property holding it and a label per value. */
  featureTypes: z.strictObject({ property: text, labels: z.record(z.string(), I18n) }).optional(),
});
export type Level = z.infer<typeof Level>;

const Missing = z.strictObject({ label: I18n, description: I18n, color });

/** One class per discrete value (e.g. CBS clusters 1–10). */
export const Categorical = z.strictObject({
  type: z.literal('categorical'),
  classes: z.array(z.strictObject({ value: z.number(), label: I18n, color })).min(1),
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
]);

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

export const Manifest = z
  .strictObject({
    version: z.literal(1),
    levels: z.record(LevelId, Level),
    layers: z.array(Layer),
    /** Credit for the geometry and names, shown whenever any level is on the map. */
    attribution: I18n,
    sources: z.array(Source),
  })
  .refine((m) => new Set(m.layers.map((l) => l.id)).size === m.layers.length, { message: 'layer ids must be unique' });
export type Manifest = z.infer<typeof Manifest>;

/** Dataset file for a choropleth layer: code → record. A code without a record is "not calculated". */
export const DatasetValues = z.record(z.string().regex(/^\d+$/), z.record(z.string(), z.number()));
export type DatasetValues = z.infer<typeof DatasetValues>;

/** Problems as readable lines, or [] when valid. */
export function validateManifest(m: unknown): string[] {
  const r = Manifest.safeParse(m);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export const manifestJsonSchema = () => z.toJSONSchema(Manifest, { io: 'input', unrepresentable: 'any' });
