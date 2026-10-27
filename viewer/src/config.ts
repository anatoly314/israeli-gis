import type { LayerSpecification } from 'maplibre-gl';
import type { Lang } from './i18n.ts';

/**
 * Everything specific to the basemap provider lives here. Swapping providers means editing this object only:
 * the style URL, its credit, which of its layers carry names, and the name fields to show per UI language
 * (first present field wins).
 */
export interface BasemapConfig {
  styleUrl: string;
  /** HTML credit for the About panel; the map control takes the style's own TileJSON attribution. */
  attribution: string;
  labelFields: Record<Lang, string[]>;
  /** Font stack the style's glyph server has, used for our own feature labels. */
  labelFont: string[];
  /** Symbol layers whose `text-field` shows a place/road/water name (rewritten on language change). */
  isNameLabel: (layer: LayerSpecification) => boolean;
  /** Settlement labels to hide while our layer draws its own names. */
  isPlaceLabel: (layer: LayerSpecification) => boolean;
  /** Label layers never shown (owner's choice: no country names). */
  isHiddenLabel: (layer: LayerSpecification) => boolean;
}

/**
 * Where an embed's "Open full map" link goes (the blog's full-page map, which forwards its query and hash to this
 * app). Fixed here, never read from the URL, so a link can't send readers elsewhere. Empty: this app's own page.
 */
export const fullMapBase = 'https://anatoly.dev/maps/israel/';

const sourceLayer = (l: LayerSpecification) => ('source-layer' in l ? l['source-layer'] : undefined);

export const basemap: BasemapConfig = {
  styleUrl: 'https://tiles.openfreemap.org/styles/positron',
  attribution:
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
    'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  labelFields: {
    he: ['name:he', 'name'],
    en: ['name:en', 'name_en', 'name:latin', 'name'],
    ru: ['name:ru', 'name:en', 'name_en', 'name'],
  },
  labelFont: ['Noto Sans Regular'],
  isNameLabel: (l) => l.type === 'symbol' && JSON.stringify(l.layout?.['text-field'] ?? '').includes('name'),
  isPlaceLabel: (l) => l.type === 'symbol' && sourceLayer(l) === 'place' && !/country|state/.test(l.id),
  isHiddenLabel: (l) => l.type === 'symbol' && sourceLayer(l) === 'place' && /country/.test(l.id),
};

/** Where the map starts before the first layer's bounds are known (no hash in the URL). */
export const initialView = { center: [35.0, 31.4] as [number, number], zoom: 6.3 };

/** Manifest location, relative to index.html. */
export const MANIFEST_URL = 'data/layers.json';
