import {
  AttributionControl,
  Map as MlMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
  type LayerSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { CLASS_PROP, MISSING, colorExpression, highlightOpacity } from './classify.ts';
import {
  BORDER,
  CASING,
  DIM,
  DIM_COLOR,
  FILL,
  MARKER_STROKE,
  MARKER_STROKE_WIDTH,
  OUTLINE,
  POINT_DIM,
  POINT_RADIUS,
  POINT_STROKE_WIDTH,
  active,
} from './paint.ts';
import { basemap, initialView } from './config.ts';
import type { LayerData } from './data.ts';
import { MAP_LOCALE, type Lang } from './i18n.ts';
import type { Layer } from './manifest.ts';

setWorkerUrl(workerUrl);

const HATCH = 'missing-hatch';

export function createMap(container: HTMLElement, opts: { cooperative: boolean; lang: Lang }): MlMap {
  return new MlMap({
    container,
    style: basemap.styleUrl,
    center: initialView.center,
    zoom: initialView.zoom,
    hash: true,
    attributionControl: false,
    cooperativeGestures: opts.cooperative,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxZoom: 16,
    locale: MAP_LOCALE[opts.lang],
  });
}

/**
 * Switches MapLibre's UI strings after load. The public `locale` option only applies at construction, so this
 * patches the internal `map._locale` (MapLibre 6.15, pinned) and rebuilds what reads it: the canvas label and the
 * cooperative-gestures hint (controls are re-added by setControls). If MapLibre's internals change, the strings stay
 * in the start-up language instead of breaking the page.
 */
export function setMapLocale(map: MlMap, lang: Lang) {
  try {
    map._locale = { ...map._locale, ...MAP_LOCALE[lang] };
    map.getCanvas().setAttribute('aria-label', MAP_LOCALE[lang]['Map.Title']);
    if (map.cooperativeGestures.isEnabled()) {
      map.cooperativeGestures.disable();
      map.cooperativeGestures.enable();
    }
  } catch (err) {
    console.warn('MapLibre UI strings not switched', err);
  }
}

const layoutLayers = (map: MlMap) => (map.getStyle().layers ?? []) as LayerSpecification[];

/** Basemap label layers the config says never to show. */
export function hideBasemapLabels(map: MlMap) {
  for (const l of layoutLayers(map)) if (basemap.isHiddenLabel(l)) map.setLayoutProperty(l.id, 'visibility', 'none');
}

/** Points every name label of the basemap at the fields configured for `lang`. */
export function setBasemapLanguage(map: MlMap, lang: Lang) {
  const field = ['coalesce', ...basemap.labelFields[lang].map((f) => ['get', f])] as ExpressionSpecification;
  for (const l of layoutLayers(map)) if (basemap.isNameLabel(l)) map.setLayoutProperty(l.id, 'text-field', field);
}

export function setBasemapPlaceLabels(map: MlMap, visible: boolean) {
  for (const l of layoutLayers(map)) if (basemap.isPlaceLabel(l)) map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
}

let attribution: AttributionControl | null = null;
let navigation: NavigationControl | null = null;

/** (Re)adds attribution and zoom buttons; in the compact layout the zoom buttons go to the bottom, clear of the search bar. */
export function setControls(map: MlMap, o: { rtl: boolean; compact: boolean; zoomButtons: boolean; credits: string[] }) {
  if (attribution) map.removeControl(attribution);
  if (navigation) map.removeControl(navigation);
  const side = o.rtl ? 'left' : 'right';
  navigation = o.zoomButtons ? new NavigationControl({ showCompass: false }) : null;
  if (navigation) map.addControl(navigation, `${o.compact ? 'bottom' : 'top'}-${side}`);
  attribution = new AttributionControl({ compact: o.compact, customAttribution: o.credits });
  map.addControl(attribution, `bottom-${side}`);
  // A compact control starts expanded; on a phone that covers a good part of the map, so start it folded.
  if (o.compact) map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
}

function addHatch(map: MlMap) {
  if (map.hasImage(HATCH)) return;
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size > 1) continue;
      const i = (y * size + x) * 4;
      data.set([90, 90, 90, 190], i);
    }
  }
  map.addImage(HATCH, { width: size, height: size, data }, { pixelRatio: 1 });
}

export const ids = (layerId: string) => ({
  polygons: layerId,
  markers: `${layerId}-markers`,
  labels: `${layerId}-labels`,
  fill: `${layerId}-fill`,
  hatch: `${layerId}-hatch`,
  line: `${layerId}-line`,
  casing: `${layerId}-casing`,
  outline: `${layerId}-outline`,
  markerLayer: `${layerId}-marker-circles`,
  labelLayer: `${layerId}-label-text`,
});

const firstSymbolId = (map: MlMap) => layoutLayers(map).find((l) => l.type === 'symbol')?.id;


/** Adds the sources and style layers of one data layer, hidden. Safe to call once per layer. */
export function addDataLayer(map: MlMap, layer: Layer, data: LayerData, opts: { labels: boolean; lang: Lang }) {
  const id = ids(layer.id);
  if (map.getSource(id.polygons)) return;
  addHatch(map);
  const color = colorExpression(layer.classification);
  map.addSource(id.polygons, { type: 'geojson', data: data.polygons, promoteId: 'code' });
  map.addSource(id.markers, { type: 'geojson', data: data.markers, promoteId: 'code' });
  const before = firstSymbolId(map);
  const hidden = { visibility: 'none' } as const;
  const missingFilter: FilterSpecification = ['==', ['get', CLASS_PROP], MISSING];

  map.addLayer({ id: id.fill, type: 'fill', source: id.polygons, layout: hidden, paint: { 'fill-color': color, 'fill-opacity': FILL } }, before);
  map.addLayer(
    { id: id.hatch, type: 'fill', source: id.polygons, filter: missingFilter, layout: hidden, paint: { 'fill-pattern': HATCH, 'fill-opacity': 1 } },
    before,
  );
  map.addLayer(
    {
      id: id.line,
      type: 'line',
      source: id.polygons,
      layout: { ...hidden, 'line-join': 'round' },
      paint: { ...BORDER },
    },
    before,
  );
  map.addLayer({
    id: id.casing,
    type: 'line',
    source: id.polygons,
    layout: { ...hidden, 'line-join': 'round' },
    paint: { 'line-color': CASING.color, 'line-width': CASING.width, 'line-opacity': ['case', active, 0.9, 0] },
  });
  map.addLayer({
    id: id.outline,
    type: 'line',
    source: id.polygons,
    layout: { ...hidden, 'line-join': 'round' },
    paint: { 'line-color': OUTLINE.color, 'line-width': OUTLINE.width, 'line-opacity': ['case', active, 1, 0] },
  });
  const points = layer.kind === 'points';
  map.addLayer({
    id: id.markerLayer,
    type: 'circle',
    source: id.markers,
    layout: hidden,
    paint: {
      'circle-color': color,
      'circle-radius': points ? POINT_RADIUS : ['interpolate', ['linear'], ['zoom'], 5, 2, 7, 3.5, 10, 5, 14, 7],
      'circle-stroke-color': MARKER_STROKE,
      'circle-stroke-width': points ? POINT_STROKE_WIDTH : MARKER_STROKE_WIDTH,
      'circle-opacity': 0.95,
    },
  });
  if (opts.labels) {
    map.addSource(id.labels, { type: 'geojson', data: data.labels });
    map.addLayer({
      id: id.labelLayer,
      type: 'symbol',
      source: id.labels,
      minzoom: 7,
      layout: {
        ...hidden,
        'text-field': labelField(opts.lang),
        'text-font': basemap.labelFont,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10.5, 10, 12.5, 14, 15],
        'text-max-width': 7,
        // A placeholder's label sits on its marker point: move it below, so the marker stays visible.
        'text-offset': ['case', ['==', ['get', 'placeholder'], true], ['literal', [0, 0.9]], ['literal', [0, 0]]],
        'text-padding': 3,
        'symbol-sort-key': ['-', 0, ['to-number', ['get', '_w'], 0]],
      },
      paint: { 'text-color': '#1d1d1f', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.6, 'text-halo-blur': 0.3 },
    });
  }
}

const labelField = (lang: Lang): ExpressionSpecification => ['get', `name_${lang}`];

export function setLabelLanguage(map: MlMap, layerId: string, lang: Lang) {
  const id = ids(layerId).labelLayer;
  if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', labelField(lang));
}

export function setDataLayerVisible(map: MlMap, layerId: string, visible: boolean) {
  const id = ids(layerId);
  for (const l of [id.fill, id.hatch, id.line, id.casing, id.outline, id.markerLayer, id.labelLayer]) {
    if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Dims every class outside `selected` to a flat grey (paint only: the data is not touched). */
export function setHighlight(map: MlMap, layer: Layer, selected: readonly string[]) {
  const id = ids(layer.id);
  if (!map.getLayer(id.fill)) return;
  const color = colorExpression(layer.classification);
  const dimmed = selected.length ? (['case', ['in', ['get', CLASS_PROP], ['literal', [...selected]]], color, DIM_COLOR] as ExpressionSpecification) : color;
  map.setPaintProperty(id.fill, 'fill-color', dimmed);
  map.setPaintProperty(id.fill, 'fill-opacity', highlightOpacity(selected, FILL, DIM));
  map.setPaintProperty(id.hatch, 'fill-opacity', highlightOpacity(selected, 1, 0.15));
  const points = layer.kind === 'points';
  map.setPaintProperty(id.markerLayer, 'circle-color', dimmed);
  map.setPaintProperty(id.markerLayer, 'circle-opacity', highlightOpacity(selected, 0.95, points ? POINT_DIM : 0.5));
  map.setPaintProperty(id.markerLayer, 'circle-stroke-opacity', highlightOpacity(selected, 1, points ? 0 : 0.3));
  // Highlighted points draw over the dimmed ones.
  if (points) map.setLayoutProperty(id.markerLayer, 'circle-sort-key', selected.length ? highlightOpacity(selected, 1, 0) : 0);
  if (map.getLayer(id.labelLayer)) map.setPaintProperty(id.labelLayer, 'text-opacity', highlightOpacity(selected, 1, 0.45));
}

export function setFeatureFlag(map: MlMap, layerId: string, code: string, key: 'hover' | 'selected', on: boolean) {
  const id = ids(layerId);
  for (const source of [id.polygons, id.markers]) if (map.getSource(source)) map.setFeatureState({ source, id: code }, { [key]: on });
}
