// Shared shape of a CBS cluster index layer (socio-economic, peripherality): categorical clusters 1–10 coloured by
// a named palette, "not calculated" for features without a record, and popup fields cluster / index / rank plus the
// dataset's own fields. All wording comes from pipeline/terminology.ts.
import type { ChoroplethLayer, Classification, LevelId, PopupField, PopupFormat, Source } from '../lib/contract.ts';
import { palette10, type PaletteName } from '../lib/palettes.ts';
import { CLUSTER_INDEX, datasetTerms, layerTitle, levelKind } from '../terminology.ts';

export const MISSING_COLOR = '#c8c8c8';

export function clusterClassification(dataset: string, level: LevelId, palette: PaletteName): Classification {
  const terms = datasetTerms(dataset);
  const description = terms.missing?.[levelKind(level)];
  if (!description) throw new Error(`${dataset}: no "not calculated" wording for ${levelKind(level)} in pipeline/terminology.ts`);
  if (!terms.scale) throw new Error(`${dataset}: a cluster index needs a scale (low/high) in pipeline/terminology.ts`);
  return {
    type: 'categorical',
    classes: palette10(palette).map((color, i) => ({ value: i + 1, color, label: CLUSTER_INDEX.classLabel(i + 1) })),
    missing: { color: MISSING_COLOR, label: CLUSTER_INDEX.missingLabel, description },
    note: CLUSTER_INDEX.note(terms.scale),
  };
}

/** cluster, index (3 decimals), rank "N of total", then `extra` fields labelled from the dataset's wording. */
export function clusterPopup(dataset: string, rankTotal: number, extra: { field: string; format: PopupFormat }[]): PopupField[] {
  const terms = datasetTerms(dataset);
  const own = extra.map(({ field, format }) => {
    const label = terms.fields[field];
    if (!label) throw new Error(`${dataset}: no popup label for "${field}" in pipeline/terminology.ts`);
    return { field, format, label };
  });
  return [
    { field: 'cluster', format: { type: 'integer' }, label: CLUSTER_INDEX.fields.cluster },
    { field: 'index', format: { type: 'decimal', decimals: 3 }, label: CLUSTER_INDEX.fields.index },
    { field: 'rank', format: { type: 'rank', total: rankTotal }, label: CLUSTER_INDEX.fields.rank },
    ...own,
  ];
}

export interface ClusterLayerSpec {
  dataset: string;
  id: string;
  level: LevelId;
  data: string;
  palette: PaletteName;
  rankTotal: number;
  extraFields: { field: string; format: PopupFormat }[];
  source: Source;
}

export function clusterLayer(s: ClusterLayerSpec): ChoroplethLayer {
  const terms = datasetTerms(s.dataset);
  return {
    id: s.id,
    dataset: s.dataset,
    kind: 'choropleth',
    level: s.level,
    title: layerTitle(terms.title, s.level),
    data: s.data,
    valueField: 'cluster',
    classification: clusterClassification(s.dataset, s.level, s.palette),
    popup: clusterPopup(s.dataset, s.rankTotal, s.extraFields),
    attribution: terms.attribution,
    source: s.source,
  };
}
