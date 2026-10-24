import type { ChoroplethLayer, Layer, Level, LevelId, Manifest } from '../../pipeline/lib/contract.ts';
import type { I18n } from './i18n.ts';
import { LANGS } from './i18n.ts';

export type { ChoroplethLayer, Layer, Level, LevelId, Manifest };

export async function loadManifest(url: string): Promise<{ manifest: Manifest; base: URL }> {
  const base = new URL(url, document.baseURI);
  const res = await fetch(base);
  if (!res.ok) throw new Error(`${base}: HTTP ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  if (manifest.version !== 1) throw new Error(`Unsupported manifest version ${manifest.version}`);
  return { manifest, base };
}

export const isChoropleth = (l: Layer): l is ChoroplethLayer => l.kind === 'choropleth';

export interface LayerGroup {
  dataset: string;
  title: I18n;
  description?: I18n;
  items: { layer: Layer; label: I18n; official?: I18n }[];
}

/**
 * Layers grouped by their `dataset`, in manifest order, headed by `datasets[id].title` (and `description` when
 * set). Items are labelled by their level's title, with the level's `officialTerm` as secondary text; points
 * layers by their own title.
 */
export function groupLayers(m: Manifest): LayerGroup[] {
  const groups = new Map<string, Layer[]>();
  for (const l of m.layers) groups.set(l.dataset, [...(groups.get(l.dataset) ?? []), l]);
  return [...groups].map(([dataset, layers]) => {
    const info = m.datasets[dataset];
    const title = info?.title ?? (Object.fromEntries(LANGS.map((l) => [l, dataset])) as I18n);
    const items = layers.map((layer) => {
      if (!isChoropleth(layer)) return { layer, label: layer.title };
      const level = m.levels[layer.level];
      return { layer, label: level.title, official: level.officialTerm };
    });
    return { dataset, title, description: info?.description, items };
  });
}
