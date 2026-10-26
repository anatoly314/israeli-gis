// Building blocks for multi-measure datasets (population, census): stepped and nominal classifications, popup
// fields and layers, all worded from the dataset's entry in pipeline/terminology.ts.
import type { ChoroplethLayer, Classification, I18n, LevelId, PopupField, PopupFormat, Source } from '../lib/contract.ts';
import { datasetTerms, layerTitle, levelKind, NO_DATA, type MeasureTerms } from '../terminology.ts';
import { MISSING_COLOR } from './cluster-index.ts';

type Categorical = Extract<Classification, { type: 'categorical' }>;
type Stepped = Extract<Classification, { type: 'stepped' }>;

/** Layer ids use the level kind ("localities"), not the vintage: `<dataset>-<measure>-<kind>`. */
const levelShort = (level: LevelId) => levelKind(level);

export function measureKit(dataset: string, source: Source) {
  const terms = datasetTerms(dataset);
  const measureTerms = (id: string): MeasureTerms => {
    const m = terms.measures?.[id];
    if (!m) throw new Error(`${dataset}: no wording for measure "${id}" in pipeline/terminology.ts`);
    return m;
  };

  const missing = (measure: string, level: LevelId) => {
    const description = measureTerms(measure).missing[levelKind(level)];
    if (!description) throw new Error(`${dataset}/${measure}: no "no data" wording for ${level} in pipeline/terminology.ts`);
    return { color: MISSING_COLOR, label: NO_DATA, description };
  };

  const stepped = (measure: string, level: LevelId, breaks: number[], colors: string[]): Stepped => ({
    type: 'stepped',
    breaks,
    colors,
    missing: missing(measure, level),
    note: measureTerms(measure).note,
  });

  /** Unordered classes in the given order; labels from the measure's `classes` in the terminology. */
  const nominal = (measure: string, level: LevelId, colors: Record<number, string>): Categorical => {
    const labels = measureTerms(measure).classes ?? {};
    return {
      type: 'categorical',
      classes: Object.entries(colors).map(([value, color]) => {
        const label = labels[value];
        if (!label) throw new Error(`${dataset}/${measure}: no label for class ${value} in pipeline/terminology.ts`);
        return { value: Number(value), label, color };
      }),
      ordered: false,
      missing: missing(measure, level),
      note: measureTerms(measure).note,
    };
  };

  const classLabels = (measure: string) => measureTerms(measure).classes ?? {};

  /** Popup fields labelled from the dataset's `fields` wording. */
  const popup = (fields: [string, PopupFormat][]): PopupField[] =>
    fields.map(([field, format]) => {
      const label: I18n | undefined = terms.fields[field];
      if (!label) throw new Error(`${dataset}: no popup label for "${field}" in pipeline/terminology.ts`);
      return { field, format, label };
    });

  const layer = (level: LevelId, measure: string, valueField: string, classification: Classification, fields: PopupField[]): ChoroplethLayer => ({
    id: `${dataset}-${measure}-${levelShort(level)}`,
    dataset,
    measure,
    kind: 'choropleth',
    level,
    title: layerTitle(terms.title, level, measureTerms(measure).title),
    data: `datasets/${dataset}/${level}.json`,
    valueField,
    classification,
    popup: fields,
    attribution: terms.attribution,
    source,
  });

  return { terms, missing, stepped, nominal, classLabels, popup, layer };
}
