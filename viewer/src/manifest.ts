import type { ChoroplethLayer, Layer, Level, LevelId, Manifest, PointsLayer } from '../../pipeline/lib/contract.ts';
import type { I18n } from './i18n.ts';
import { LANGS } from './i18n.ts';

export type { ChoroplethLayer, Layer, Level, LevelId, Manifest, PointsLayer };

export async function loadManifest(url: string): Promise<{ manifest: Manifest; base: URL }> {
  const base = new URL(url, document.baseURI);
  const res = await fetch(base);
  if (!res.ok) throw new Error(`${base}: HTTP ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  if (manifest.version !== 1) throw new Error(`Unsupported manifest version ${manifest.version}`);
  return { manifest, base };
}

export const isChoropleth = (l: Layer): l is ChoroplethLayer => l.kind === 'choropleth';

/** One layer in the switcher, labelled by its level (points layers by what one point is, "School"). */
export interface LayerItem {
  layer: Layer;
  label: I18n;
  official?: I18n;
}

/** One measure of a multi-measure dataset, with its layers (one per level) in manifest order. */
export interface MeasureGroup {
  id: string;
  title: I18n;
  items: LayerItem[];
}

export interface LayerGroup {
  dataset: string;
  title: I18n;
  description?: I18n;
  /** Every layer of the dataset, in manifest order. */
  items: LayerItem[];
  /** Set when the dataset lists `measures`: the switcher shows one entry per measure, levels as a second choice. */
  measures?: MeasureGroup[];
}

const itemOf = (m: Manifest, layer: Layer): LayerItem => {
  if (!isChoropleth(layer)) return { layer, label: layer.featureType };
  const level = m.levels[layer.level];
  return { layer, label: level.title, official: level.officialTerm };
};

/**
 * Layers grouped by their `dataset`, in manifest order, headed by `datasets[id].title` (and `description` when
 * set). Items are labelled by their level's title, with the level's `officialTerm` as secondary text. Datasets with
 * `measures` also get them, in `measures` order, each with its layers.
 */
export function groupLayers(m: Manifest): LayerGroup[] {
  const groups = new Map<string, Layer[]>();
  for (const l of m.layers) groups.set(l.dataset, [...(groups.get(l.dataset) ?? []), l]);
  return [...groups].map(([dataset, layers]) => {
    const info = m.datasets[dataset];
    const title = info?.title ?? (Object.fromEntries(LANGS.map((l) => [l, dataset])) as I18n);
    const items = layers.map((layer) => itemOf(m, layer));
    const measures = info?.measures
      ?.map((x) => ({ id: x.id, title: x.title, items: items.filter((i) => i.layer.measure === x.id) }))
      .filter((x) => x.items.length);
    return { dataset, title, description: info?.description, items, ...(measures && { measures }) };
  });
}

/** The layer to show when picking `measure` while `current` is on: same level if the measure has it, else its first. */
export function layerForMeasure(group: MeasureGroup, current: Layer | undefined): Layer {
  const level = current && isChoropleth(current) ? current.level : undefined;
  return group.items.find((i) => isChoropleth(i.layer) && i.layer.level === level)?.layer ?? group.items[0].layer;
}

/** The dataset's note on one feature (`datasets[id].notes[level][code]`), e.g. a merged locality. */
export function featureNote(m: Manifest, layer: Layer, code: string): I18n | undefined {
  if (!isChoropleth(layer)) return undefined;
  return m.datasets[layer.dataset]?.notes?.[layer.level]?.[code];
}

/**
 * Words naming a layer: its dataset, its measure (multi-measure datasets) and its level. A points layer has no level;
 * without a measure it is named by its title.
 */
export function describeLayer(m: Manifest, layer: Layer): { dataset: I18n; shortDataset: I18n; measure?: I18n; level?: I18n } {
  const info = m.datasets[layer.dataset];
  const measure = layer.measure ? info?.measures?.find((x) => x.id === layer.measure)?.title : undefined;
  const dataset = info?.title ?? layer.title;
  const level = isChoropleth(layer) ? itemOf(m, layer).label : measure ? undefined : layer.title;
  return { dataset, shortDataset: info?.shortTitle ?? dataset, ...(measure && { measure }), ...(level && { level }) };
}

/** Points layers sharing one data file are one set of places (one search index, one geometry). */
export const sourceKeyOf = (l: Layer) => (isChoropleth(l) ? l.level : `points:${l.data}`);
