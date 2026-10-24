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
  items: { layer: Layer; label: I18n }[];
}

const SEP = ' – ';

/**
 * Layers grouped by dataset, in manifest order. The group title is what the layer titles share before " – "
 * ("Socio-economic index 2021"); each item is labelled by its level ("Statistical areas"), or by the rest of
 * its own title when it has no level or the titles share nothing.
 */
export function groupLayers(m: Manifest): LayerGroup[] {
  const groups = new Map<string, Layer[]>();
  for (const l of m.layers) groups.set(l.dataset, [...(groups.get(l.dataset) ?? []), l]);
  return [...groups].map(([dataset, layers]) => {
    const title = {} as I18n;
    const prefixes = {} as Record<keyof I18n, string | null>;
    for (const lang of LANGS) {
      const heads = layers.map((l) => (l.title[lang].includes(SEP) ? l.title[lang].split(SEP)[0] : null));
      prefixes[lang] = heads.every((h) => h != null && h === heads[0]) ? heads[0] : null;
      title[lang] = prefixes[lang] ?? (layers.length === 1 ? layers[0].title[lang] : dataset);
    }
    const items = layers.map((layer) => {
      const label = {} as I18n;
      for (const lang of LANGS) {
        const own = prefixes[lang] ? layer.title[lang].slice(prefixes[lang]!.length + SEP.length) : layer.title[lang];
        label[lang] = isChoropleth(layer) ? m.levels[layer.level].title[lang] : own;
      }
      return { layer, label };
    });
    return { dataset, title, items };
  });
}
