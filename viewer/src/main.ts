import { Popup, type MapGeoJSONFeature, type PointLike } from 'maplibre-gl';
import { classKeys, isOrdered } from './classify.ts';
import { MANIFEST_URL } from './config.ts';
import { colocated, joinLayer, loadLayerSource, loadLevel, type BBox, type LayerData, type LevelData, type Props } from './data.ts';
import type { ExtraField } from '../../pipeline/lib/contract.ts';
import { countText, formatNumber } from './format.ts';
import { detectLang, dirOf, featureName, inLangNote, searchPlaceholder, t, type Lang } from './i18n.ts';
import {
  describeLayer,
  featureNote,
  groupLayers,
  isChoropleth,
  loadManifest,
  sourceKeyOf,
  type Layer,
  type Level,
  type Manifest,
  type PointsLayer,
} from './manifest.ts';
import {
  addDataLayer,
  createMap,
  hideBasemapLabels,
  ids,
  setBasemapLanguage,
  setBasemapPlaceLabels,
  setControls,
  setDataLayerVisible,
  setFeatureFlag,
  setHighlight,
  setLabelLanguage,
  setMapLocale,
} from './map.ts';
import { featureTitle, featureType, pointsPopupHtml, popupHtml, tooltipHtml, valueHtml } from './popup.ts';
import { compactHl, expandHl, normalizeSelection } from './range.ts';
import { createSearchBox } from './search-box.ts';
import { createSlider } from './slider.ts';
import { buildEntries, search, type SearchEntry } from './search.ts';
import { $, renderAbout, renderLang, renderLayers, renderLegend } from './ui.ts';
import { parseUrl, serializeUrl } from './url.ts';

const initial = parseUrl(location.search);
const state = {
  lang: detectLang(initial.lang, navigator.languages),
  layerId: initial.layer ?? '',
  hl: initial.hl,
  /**
   * The highlight as of the last finished change. `hl` also follows a slider drag frame by frame; the URL is written
   * from this one, so nothing that syncs the URL mid-drag (a map move, a resize) can publish an in-between state.
   */
  committedHl: initial.hl,
  selected: null as null | { layerId: string; codes: string[] },
  embed: initial.embed,
  compact: false,
};

const hadHash = /^#[\d.]+\/[-\d.]+\/[-\d.]+/.test(location.hash);
const narrow = matchMedia('(max-width: 719px)');
const canHover = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const map = createMap($('map'), { cooperative: state.embed, lang: state.lang });
const popup = new Popup({ closeOnClick: false, maxWidth: '320px', focusAfterOpen: false, className: 'feature-popup' });
const searchBox = createSearchBox($('search'), {
  ensureIndex,
  find: (q) => searchEntries(q),
  hint: searchHint,
  placeholder: placeholderText,
  view: resultView,
  onSelect: selectEntry,
});
const slider = createSlider($('range'), (keys, done) => setClasses(keys, done));

let manifest: Manifest;
let resolveManifest: () => void;
let rejectManifest: (err: unknown) => void;
const manifestReady = new Promise<void>((resolve, reject) => {
  resolveManifest = resolve;
  rejectManifest = reject;
});
// Only search waits on it; a failed load is reported by boot().
manifestReady.catch(() => {});
let base: URL;
/** `spots`: on points layers, the codes sharing each co-located point's coordinates. */
const layerData = new Map<string, LayerData & { byCode: Map<string, Props>; level: LevelData; spots?: Map<string, string[]> }>();
/** Decoded geometry per search level key (level id, or `points:<file>` for points layers). */
const levelData = new Map<string, LevelData>();
let entries: SearchEntry[] = [];
let indexing: Promise<void> | null = null;
let switching = 0;
let hovered: { layerId: string; code: string } | null = null;
/** The feature the open popup was opened for. */
let popupAt: { layerId: string; code: string } | null = null;

const layerById = (id: string) => manifest.layers.find((l) => l.id === id);
const currentLayer = () => layerById(state.layerId)!;
const levelOf = (l: Layer): Level | undefined => (isChoropleth(l) ? manifest.levels[l.level] : undefined);
const levelKeyOf = sourceKeyOf;
const levelByKey = (key: string): Level | undefined => manifest.levels[key as keyof Manifest['levels']];
/** Our own labels, except on levels whose features are parts of a named place (they would repeat the place name). */
const ownLabels = (l: Layer) => isChoropleth(l) && !manifest.levels[l.level].parentCode;

function status(text: string | null) {
  const el = $('status');
  el.hidden = !text;
  el.textContent = text ?? '';
}

/** `hl` for the URL: runs of classes compacted to "4-7". */
function hlTokens() {
  const layer = manifest && layerById(state.layerId);
  return layer ? compactHl(state.committedHl, classKeys(layer.classification), isOrdered(layer.classification)) : state.committedHl;
}

function syncUrl() {
  const s = serializeUrl(
    {
      lang: state.lang,
      layer: state.layerId || null,
      hl: hlTokens(),
      // The feature whose popup is open (a campus selects several points, the link names the one picked).
      feature: popupAt?.code ?? (state.selected?.codes.length === 1 ? state.selected.codes[0] : null),
      embed: state.embed,
    },
    location.search,
  );
  history.replaceState(history.state, '', `${location.pathname}${s}${location.hash}`);
  const full = $<HTMLAnchorElement>('fullscreen');
  full.hidden = !state.embed;
  if (state.embed) {
    full.href = `${location.pathname}${serializeUrl({ ...parseUrl(s), embed: false }, s)}${location.hash}`;
  }
}

/** Camera padding: what the UI covers. In compact mode the map already ends above the sheet. */
function padding() {
  if (state.compact) return { top: $('top').offsetHeight + 16, bottom: 16, left: 12, right: 12 };
  const side = Math.min(360, innerWidth * 0.4);
  return dirOf(state.lang) === 'rtl' ? { top: 40, bottom: 40, left: 60, right: side } : { top: 40, bottom: 40, left: side, right: 60 };
}

function applyLayout() {
  state.compact = state.embed || narrow.matches;
  document.body.classList.toggle('compact', state.compact);
  document.body.classList.toggle('embed', state.embed);
  // The slider sits under the legend on desktop and right under the colour strip in the compact sheet. The legend
  // (a nominal layer's list, notes) opens the compact sheet's body, above the dataset list, instead of following it.
  if (state.compact) {
    $('strip').after($('range'));
    $('sheet-body').prepend($('legend'));
  } else {
    $('legend-title').after($('range'));
    $('range').after($('legend'));
  }
  if (manifest) refreshControls();
}

function refreshControls() {
  const layer = layerById(state.layerId);
  const credits = [manifest.attribution[state.lang], ...(layer ? [layer.attribution[state.lang]] : [])];
  setControls(map, { rtl: dirOf(state.lang) === 'rtl', compact: state.compact, zoomButtons: !state.compact || canHover.matches, credits });
}

function renderChrome() {
  const lang = state.lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirOf(lang);
  document.title = t('title', lang);
  $('title').textContent = t('title', lang);
  $('map').setAttribute('aria-label', t('map', lang));
  renderLang($('lang'), lang, setLang);
  searchBox.setLang(lang);
  $('about-open').textContent = t('about', lang);
  $('fullscreen').textContent = `${t('fullscreen', lang)} ↗`;
  if (!manifest) return;
  const groups = groupLayers(manifest);
  const layer = layerById(state.layerId);
  renderLayers($('layers'), groups, layer, lang, (id) => void switchLayer(id));
  if (layer) {
    // Two lines: the dataset (its short title) small, then "measure · level" (or the level) in bold. With several
    // datasets and measures on one level, the level alone doesn't say which map this is.
    const d = describeLayer(manifest, layer);
    const span = (className: string, textContent: string) => Object.assign(document.createElement('span'), { className, textContent });
    const main = span('sheet-main', '');
    // A points layer has no level: the measure alone.
    const parts = [...(d.measure ? [span('sheet-measure', d.measure[lang])] : []), ...(d.level ? [span('sheet-level', d.level[lang])] : [])];
    main.replaceChildren(...parts.flatMap((p, i) => (i ? [span('sheet-sep', ' · '), p] : [p])));
    $('sheet-title').replaceChildren(span('sheet-dataset', d.shortDataset[lang]), main);
    $('sheet-toggle').title = [d.dataset[lang], d.measure?.[lang], d.level?.[lang]].filter(Boolean).join(' · ');
  }
  renderSelection();
  renderAbout($<HTMLDialogElement>('about'), manifest, lang);
}

/** Legend, colour strip and range slider: everything that shows the highlighted classes. */
function renderSelection() {
  const layer = manifest && layerById(state.layerId);
  if (!layer) return;
  $('legend-title').textContent = t('legend', state.lang);
  // Until the layer's data arrives, whether any feature is "not calculated" is unknown: keep that row.
  const missing = layerData.get(layer.id)?.missing ?? 1;
  renderLegend($('legend'), $('strip'), layer, state.hl, state.lang, { toggle: toggleClass, set: setClasses }, missing > 0);
  slider.update(layer, state.hl, state.lang);
}

/** While a handle moves: only the pressed/dimmed state of the legend and strip, no re-render. */
function markSelection() {
  const layer = layerById(state.layerId);
  if (!layer) return;
  const on = new Set(state.hl);
  for (const b of document.querySelectorAll<HTMLElement>('#legend [data-key], #strip [data-key]')) b.setAttribute('aria-pressed', String(on.has(b.dataset.key!)));
  for (const list of document.querySelectorAll('#legend .legend-list, #strip .strip-row')) list.classList.toggle('filtering', on.size > 0);
  const clear = document.querySelector<HTMLElement>('#strip .strip-clear');
  if (clear) clear.hidden = on.size === 0;
  slider.update(layer, state.hl, state.lang);
}

function setLang(lang: Lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  renderChrome();
  setMapLocale(map, lang);
  if (styleLoaded) setBasemapLanguage(map, lang);
  for (const id of layerData.keys()) setLabelLanguage(map, id, lang);
  refreshControls();
  if (popup.isOpen() && popupAt) showPopup(popupAt.layerId, popupAt.code, popup.getLngLat());
  syncUrl();
}

/** Highlights `keys` (paint only). While a slider handle moves (`final` false) the URL waits for the release. */
function setClasses(keys: string[], final = true) {
  const layer = layerById(state.layerId);
  state.hl = layer ? normalizeSelection(keys, classKeys(layer.classification)) : keys;
  if (layer) setHighlight(map, layer, state.hl);
  if (!final) return markSelection();
  state.committedHl = state.hl;
  renderSelection();
  syncUrl();
}

const toggleClass = (key: string) => setClasses(state.hl.includes(key) ? state.hl.filter((k) => k !== key) : [...state.hl, key]);

async function prepare(layer: Layer) {
  const cached = layerData.get(layer.id);
  if (cached) return cached;
  const { level, values } = await loadLayerSource(base, manifest, layer);
  const joined = joinLayer(level, values, layer);
  const byCode = new Map<string, Props>();
  for (const f of [...joined.polygons.features, ...joined.markers.features]) if (!byCode.has(f.properties.code)) byCode.set(f.properties.code, f.properties);
  const entry = { ...joined, byCode, level, ...(!isChoropleth(layer) && { spots: colocated(level) }) };
  layerData.set(layer.id, entry);
  levelData.set(levelKeyOf(layer), level);
  return entry;
}

async function switchLayer(id: string, opts: { fit?: boolean } = {}) {
  const layer = layerById(id) ?? manifest.layers[0];
  const token = ++switching;
  const previous = state.layerId;
  state.layerId = layer.id;
  // Class keys mean something else in another dataset (SES cluster 1 ≠ peripherality cluster 1): drop the
  // highlight when the dataset changes, keep it across levels of the same dataset.
  const before = layerById(previous);
  if (before && (before.dataset !== layer.dataset || before.measure !== layer.measure)) state.hl = [];
  // Accepts URL tokens ("4-7", "1,5,9", "na") as well as keys already expanded for another layer.
  state.hl = expandHl(state.hl, classKeys(layer.classification), isOrdered(layer.classification));
  state.committedHl = state.hl;
  if (previous !== layer.id) clearSelection();
  renderChrome();
  syncUrl();

  if (!layerData.has(layer.id)) status(t('loading', state.lang));
  let data;
  try {
    data = await prepare(layer);
  } catch (err) {
    console.error(err);
    status(t('loadError', state.lang));
    return;
  }
  if (token !== switching) return;
  await styleReady;
  addDataLayer(map, layer, data, { labels: ownLabels(layer), lang: state.lang });
  for (const l of manifest.layers) if (l.id !== layer.id) setDataLayerVisible(map, l.id, false);
  setDataLayerVisible(map, layer.id, true);
  setBasemapPlaceLabels(map, !ownLabels(layer));
  setHighlight(map, layer, state.hl);
  // Now known: whether the legend needs its "not calculated" row.
  if (data.missing === 0) renderSelection();
  refreshControls();
  status(null);
  document.body.dataset.layer = layer.id;
  if (opts.fit) map.fitBounds(data.level.bbox, { padding: padding(), animate: false });
}

function clearSelection() {
  if (state.selected) for (const c of state.selected.codes) setFeatureFlag(map, state.selected.layerId, c, 'selected', false);
  state.selected = null;
  popupAt = null;
  if (popup.isOpen()) popup.remove();
}

function select(layerId: string, codes: string[]) {
  clearSelection();
  state.selected = { layerId, codes };
  for (const c of codes) setFeatureFlag(map, layerId, c, 'selected', true);
  syncUrl();
}

/** The feature and, on a points layer, every other point at exactly its location. */
const spotCodes = (layerId: string, code: string) => layerData.get(layerId)?.spots?.get(code) ?? [code];

function showPopup(layerId: string, code: string, at: { lng: number; lat: number } | [number, number]) {
  const layer = layerById(layerId);
  const data = layerData.get(layerId);
  const props = data?.byCode.get(code);
  if (!layer || !data || !props) return;
  let html: string;
  if (isChoropleth(layer)) html = popupHtml(layer, levelOf(layer), props, state.lang, featureNote(manifest, layer, code));
  else {
    // The picked point first, then the others at its location by name.
    const name = (c: string) => String(data.byCode.get(c)?.name_he ?? '');
    const others = spotCodes(layerId, code).filter((c) => c !== code).sort((a, b) => name(a).localeCompare(name(b), 'he'));
    html = pointsPopupHtml(layer, [code, ...others].map((c) => data.byCode.get(c)!), state.lang, parentName(layer, props));
  }
  popupAt = { layerId, code };
  popup.setLngLat(at).setHTML(html);
  if (!popup.isOpen()) popup.addTo(map);
  syncUrl();
  keepPopupInView();
}

/**
 * The place a point lies in (its `parent` feature's name), once that level's geometry is loaded. The first popup
 * that needs it starts the load and is redrawn when it arrives: viewing points alone doesn't fetch the polygons.
 */
function parentName(layer: PointsLayer, p: Props): string | undefined {
  if (!layer.parent) return undefined;
  const key = layer.parent.level;
  const parents = levelData.get(key);
  if (!parents) {
    const level = manifest.levels[key];
    void loadLevel(base, level)
      .then((data) => {
        levelData.set(key, data);
        if (popup.isOpen() && popupAt?.layerId === layer.id) showPopup(popupAt.layerId, popupAt.code, popup.getLngLat());
      })
      .catch((err) => console.error(err));
    return undefined;
  }
  const f = parents.features.get(String(p[layer.parent.property]));
  return f ? featureName(f.props, state.lang).text : undefined;
}

/**
 * Pans the map so the whole popup, close button included, is inside the visible map (below the compact search bar),
 * once any running camera move has ended.
 */
function keepPopupInView() {
  if (map.isMoving()) {
    map.once('moveend', keepPopupInView);
    return;
  }
  requestAnimationFrame(() => {
    const el = popup.isOpen() ? popup.getElement() : undefined;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const c = map.getContainer().getBoundingClientRect();
    const margin = 8;
    const top = c.top + (state.compact ? $('top').getBoundingClientRect().bottom - c.top : 0) + margin;
    const dx = r.left < c.left + margin ? r.left - (c.left + margin) : r.right > c.right - margin ? r.right - (c.right - margin) : 0;
    const dy = r.top < top ? r.top - top : r.bottom > c.bottom - margin ? Math.min(r.bottom - (c.bottom - margin), r.top - top) : 0;
    if (dx || dy) map.panBy([dx, dy], { duration: reducedMotion.matches ? 0 : 250 });
  });
}

popup.on('close', () => {
  popupAt = null;
  if (state.selected) {
    for (const c of state.selected.codes) setFeatureFlag(map, state.selected.layerId, c, 'selected', false);
    state.selected = null;
    syncUrl();
  }
});

/** Topmost feature of the current layer under a pixel: markers first (with some slop for fingers), then polygons. */
function pick(point: { x: number; y: number }, slop: number): MapGeoJSONFeature | undefined {
  const id = ids(state.layerId);
  if (!map.getLayer(id.fill)) return undefined;
  const box: [PointLike, PointLike] = [
    [point.x - slop, point.y - slop],
    [point.x + slop, point.y + slop],
  ];
  return map.queryRenderedFeatures(box, { layers: [id.markerLayer] })[0] ?? map.queryRenderedFeatures([point.x, point.y], { layers: [id.fill] })[0];
}

function setHover(next: { layerId: string; code: string } | null) {
  if (hovered && (hovered.code !== next?.code || hovered.layerId !== next?.layerId)) setFeatureFlag(map, hovered.layerId, hovered.code, 'hover', false);
  if (next) setFeatureFlag(map, next.layerId, next.code, 'hover', true);
  hovered = next;
}

let hoverFrame = 0;
map.on('mousemove', (e) => {
  if (!canHover.matches || !manifest) return;
  cancelAnimationFrame(hoverFrame);
  hoverFrame = requestAnimationFrame(() => {
    const f = pick(e.point, 5);
    const tip = $('tooltip');
    if (!f) {
      setHover(null);
      tip.hidden = true;
      map.getCanvas().style.cursor = '';
      return;
    }
    const code = String(f.properties.code);
    setHover({ layerId: state.layerId, code });
    map.getCanvas().style.cursor = 'pointer';
    const layer = currentLayer();
    const props = layerData.get(layer.id)?.byCode.get(code);
    if (!props) return;
    const more = spotCodes(layer.id, code).length - 1;
    tip.innerHTML = tooltipHtml(layer, levelOf(layer), props, state.lang) + (more ? `<small>${t('more', state.lang, { n: formatNumber(more, state.lang) })}</small>` : '');
    tip.hidden = false;
    const r = $('map').getBoundingClientRect();
    const x = Math.min(e.point.x + r.left + 14, innerWidth - tip.offsetWidth - 8);
    const y = Math.min(e.point.y + r.top + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.transform = `translate(${x}px, ${y}px)`;
  });
});

map.getCanvasContainer().addEventListener('mouseleave', () => {
  setHover(null);
  $('tooltip').hidden = true;
});

map.on('click', (e) => {
  if (!manifest) return;
  const f = pick(e.point, canHover.matches ? 5 : 12);
  $('tooltip').hidden = true;
  if (!f) {
    clearSelection();
    syncUrl();
    return;
  }
  const code = String(f.properties.code);
  select(state.layerId, spotCodes(state.layerId, code));
  const at = f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : e.lngLat;
  showPopup(state.layerId, code, at);
});

/**
 * Search indexes places per level (names, bbox, size): geometry only, no dataset values. Points files (6.6k schools,
 * ~170 KB) don't hold up the first answer: unless the map already loaded them, they are indexed after the places, in
 * the background, and an open result list is refreshed then.
 */
function ensureIndex(): Promise<void> {
  // Focus or typing before the manifest arrived: build the index once it does, so that query is answered too.
  if (!manifest) return manifestReady.then(ensureIndex);
  indexing ??= (async () => {
    const keys = [...new Set(manifest.layers.map(levelKeyOf))];
    const index = async (key: string) => {
      let data = levelData.get(key);
      if (!data) {
        const level = levelByKey(key);
        data = level ? await loadLevel(base, level) : (await loadLayerSource(base, manifest, manifest.layers.find((l) => levelKeyOf(l) === key)!)).level;
        levelData.set(key, data);
      }
      return buildEntries(key, levelByKey(key), data);
    };
    const now = keys.filter((k) => levelByKey(k) || levelData.has(k));
    entries = (await Promise.all(now.map(index))).flat();
    for (const key of keys.filter((k) => !now.includes(k))) {
      index(key)
        .then((more) => {
          entries = [...entries, ...more];
          searchBox.refresh();
        })
        .catch((err) => console.error(err));
    }
  })();
  indexing.catch(() => (indexing = null));
  return indexing;
}

/** The current layer's level first, then levels in manifest order. */
function searchEntries(q: string) {
  if (!manifest || !state.layerId) return [];
  const current = levelKeyOf(currentLayer());
  const order = [...new Set(manifest.layers.map(levelKeyOf))];
  return search(entries, q, { levelRank: (k) => (k === current ? 0 : 1 + order.indexOf(k)) });
}

/**
 * "Also searchable: Neighborhoods (in Hebrew)": the searchable extra fields whose values are in another language than
 * the UI, from the levels of the layers. Empty when there are none (always in the Hebrew UI today).
 */
/** Searchable extra fields of the layers' levels, once per property. */
function searchableFields(): ExtraField[] {
  if (!manifest) return [];
  const fields = new Map<string, ExtraField>();
  for (const l of manifest.layers) for (const f of levelOf(l)?.extraFields ?? []) if (f.searchable) fields.set(f.property, f);
  return [...fields.values()];
}

function searchHint(lang: Lang): string {
  const parts = searchableFields()
    .filter((f) => inLangNote(f.textLang, lang))
    .map((f) => `${(f.shortLabel ?? f.label)[lang]} ${inLangNote(f.textLang, lang)}`);
  return parts.length ? t('alsoSearchable', lang, { fields: parts.join(', ') }) : '';
}

/** "Search a place or neighborhood": the searchable fields' `searchTerm`s (contract), else just "Search a place". */
function placeholderText(lang: Lang): string {
  return searchPlaceholder(
    lang,
    searchableFields().flatMap((f) => (f.searchTerm ? [f.searchTerm] : [])),
  );
}

function resultView(e: SearchEntry, lang: Lang) {
  const level = levelByKey(e.level);
  const pointsLayer = level ? undefined : (manifest.layers.find((l) => levelKeyOf(l) === e.level) as PointsLayer | undefined);
  if (pointsLayer && e.code != null) {
    // "School · Jerusalem"; a school's name is Hebrew only, in every language.
    const props = levelData.get(e.level)?.features.get(e.code)?.props;
    const place = props && parentName(pointsLayer, props);
    return { name: e.names.he, meta: [pointsLayer.featureType[lang], place].filter(Boolean).join(' · ') };
  }
  const levelTitle = level?.title[lang] ?? pointsLayer?.featureType[lang] ?? '';
  if (e.code == null) {
    const name = featureName({ name_he: e.names.he, name_en: e.names.en, name_ru: e.names.ru }, lang).text;
    const count = level?.countForms ? countText(level.countForms, e.codes.length, lang) : formatNumber(e.codes.length, lang);
    return { name, meta: `${levelTitle} · ${count}` };
  }
  const props = levelData.get(e.level)?.features.get(e.code)?.props;
  if (!props) return { name: e.names[lang], meta: levelTitle };
  const cur = currentLayer();
  const onCurrent = e.level === levelKeyOf(cur);
  const type = featureType(props, level, lang);
  // The value is shown only for the current layer, whose data is already loaded.
  const joined = onCurrent ? layerData.get(cur.id)?.byCode.get(e.code) : undefined;
  return {
    name: featureTitle(props, level, lang).text,
    // The type only says more than the level title where it varies within the level ("City · Municipalities").
    meta: level?.featureTypes ? (onCurrent ? type : [type, levelTitle].filter(Boolean).join(' · ')) : levelTitle,
    value: joined ? valueHtml(cur, joined, lang) : undefined,
    via: e.matched && e.via ? { text: e.matched, lang: e.via.lang } : undefined,
  };
}

/** The layer to show a result on: the current one if it is on that level, else one of the same dataset, else any. */
function layerFor(levelKey: string): Layer | undefined {
  const cur = currentLayer();
  if (levelKeyOf(cur) === levelKey) return cur;
  const onLevel = manifest.layers.filter((l) => levelKeyOf(l) === levelKey);
  return onLevel.find((l) => l.dataset === cur.dataset && l.measure === cur.measure) ?? onLevel.find((l) => l.dataset === cur.dataset) ?? onLevel[0];
}

async function selectEntry(e: SearchEntry) {
  const layer = layerFor(e.level);
  if (!layer) return;
  if (state.layerId !== layer.id) await switchLayer(layer.id);
  const data = layerData.get(layer.id);
  if (!data) return;
  const single = e.code != null;
  // A school needs street zoom to tell it from its neighbours.
  const maxZoom = !isChoropleth(layer) ? 15 : single ? 13 : 12;
  map.fitBounds(e.bbox as BBox, { padding: padding(), maxZoom, duration: reducedMotion.matches ? 0 : 900 });
  select(layer.id, single ? spotCodes(layer.id, e.code!) : e.codes);
  if (single) {
    const info = data.level.features.get(e.code!);
    if (info) showPopup(layer.id, e.code!, info.anchor);
    if (state.compact) setSheetOpen(false);
    popup.getElement()?.querySelector<HTMLElement>('.maplibregl-popup-close-button')?.focus();
  }
}

/**
 * Opens or folds the compact bottom sheet. While it is open the map's bottom controls (attribution "i", zoom) are
 * hidden, as they would float over it; the About panel lists every source meanwhile.
 */
function setSheetOpen(open: boolean) {
  $('sheet').dataset.open = String(open);
  $('sheet-toggle').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sheet-open', open);
}

function setupSheet() {
  const sheet = $('sheet');
  const toggle = $('sheet-toggle');
  toggle.addEventListener('click', () => setSheetOpen(sheet.dataset.open !== 'true'));
  document.addEventListener('keydown', (ev) => {
    const target = ev.target as HTMLElement;
    if (ev.key !== 'Escape' || target.closest('#q, dialog') || !state.selected) return;
    const inPopup = Boolean(target.closest('.maplibregl-popup'));
    clearSelection();
    syncUrl();
    if (inPopup) $('q').focus();
  });
  const dialog = $<HTMLDialogElement>('about');
  $('about-open').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });
}

let styleLoaded = false;
let resolveStyle: () => void;
const styleReady = new Promise<void>((r) => (resolveStyle = r));
map.on('load', () => {
  styleLoaded = true;
  hideBasemapLabels(map);
  setBasemapLanguage(map, state.lang);
  resolveStyle();
});

/** In the compact layout the map ends above the collapsed sheet, so nothing important hides under it. */
function trackSheet() {
  const sheet = $('sheet');
  new ResizeObserver(() => {
    if (sheet.dataset.open === 'true') return;
    const h = state.compact ? sheet.offsetHeight : 0;
    document.body.style.setProperty('--sheet-h', `${h}px`);
    map.resize();
  }).observe(sheet);
}

async function boot() {
  applyLayout();
  narrow.addEventListener('change', applyLayout);
  setupSheet();
  trackSheet();
  renderChrome();
  status(t('loading', state.lang));
  try {
    ({ manifest, base } = await loadManifest(MANIFEST_URL));
    resolveManifest();
  } catch (err) {
    console.error(err);
    status(t('loadError', state.lang));
    rejectManifest(err);
    return;
  }
  applyLayout();
  await switchLayer(layerById(state.layerId) ? state.layerId : manifest.layers[0].id, { fit: !hadHash });
  if (initial.feature && layerData.get(state.layerId)?.byCode.has(initial.feature)) {
    const info = layerData.get(state.layerId)!.level.features.get(initial.feature)!;
    select(state.layerId, spotCodes(state.layerId, initial.feature));
    showPopup(state.layerId, initial.feature, info.anchor);
    if (!hadHash) map.fitBounds(info.bbox, { padding: padding(), maxZoom: isChoropleth(currentLayer()) ? 13 : 15, animate: false });
  }
  map.on('moveend', syncUrl);
}

void boot();
