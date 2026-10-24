# Viewer

A static page (Vite + TypeScript + MapLibre GL JS 6, no UI framework) that shows whatever `dist/data/layers.json`
describes. It never names a dataset, level or field in code: layer list, colours, legend, popup fields, labels and
search all come from the manifest and the files it points to.

## Modules (`viewer/src/`)

| Module | Job |
|---|---|
| `main.ts` | App state (language, layer, highlighted classes, selection), wiring, hover/click, URL sync |
| `config.ts` | Basemap config (below), initial view, manifest URL. The only provider-specific file. |
| `manifest.ts` | Loads `layers.json`; `groupLayers()` groups layers by `dataset` for the switcher |
| `data.ts` | Fetches and caches TopoJSON levels and dataset files, decodes with `topojson-client`, joins values on `code`, computes per-feature bbox, size (`geometry `population``, else area) and a label point (pole of inaccessibility via `polylabel`) |
| `classify.ts` | Class key per value (categorical value, `s<i>` stepped bin, `na`), colours, legend entries and presets, MapLibre expressions, highlight opacity |
| `format.ts` | The one number formatter: `Intl.NumberFormat` without its bidi marks, wrapped in a left-to-right isolate (U+2066…U+2069); stepped ranges are isolated as a whole so "< -1" never mirrors in Hebrew |
| `html.ts` | `esc` and the colour swatch |
| `map.ts` | MapLibre: map creation, MapLibre UI strings per language, basemap language and hidden labels, sources/layers per data layer, feature-state, controls |
| `popup.ts` | Popup and tooltip HTML, field formats (`integer`, `decimal`, `rank` "N of M"), feature title/type; stepped layers show the actual value with the bin as secondary text |
| `search.ts` | Normalisation, per-level index entries, ranking |
| `search-box.ts` | ARIA combobox (arrows, Enter, Escape), result count in a polite live region |
| `i18n.ts` | All UI strings (he/en/ru), MapLibre's own UI strings, language detection, name fallbacks |
| `url.ts` | Query-string state parse/serialise |
| `ui.ts` | Layer switcher, legend + compact legend strip, language switch, About dialog |

Types come from `pipeline/lib/contract.ts` with `import type`, so the viewer and the pipeline share one contract
without bundling zod.

## Rendering

Per data layer (`<id>` = layer id), added once on first use and then only shown/hidden:

- sources `<id>` (polygons) and `<id>-markers` (placeholder points), `promoteId: 'code'`; `<id>-labels` (label points)
- `fill` coloured by `['match', ['get', '_k'], …]`, where `_k` is the class key the viewer writes at join time. This
  makes categorical and stepped classifications style the same way.
- `hatch`: a grey diagonal pattern over "not calculated" features (`_k = na`), so missing data never reads as a low class
- `line`: white borders, wider and more opaque with zoom
- `outline`: black, visible only for `feature-state` `hover` or `selected`
- `circle` markers for placeholder points (West Bank 50 m circles), fixed pixel radius, class colour
- `symbol` labels from our own names, bigger places (by `geometry `population``) winning collisions; not on levels with a
  `parentCode` (statistical areas would repeat the city name, so the basemap's place labels stay instead). While
  they show, the basemap's settlement labels are hidden.

Hover and selection use `setFeatureState`; class highlighting changes paint opacity only. Neither re-sends data to
the worker.

Geometry is loaded per layer, when it is first shown, and cached. The first paint loads the manifest, the first
layer's level and dataset.

## Search

Search is per place, not per layer. The first focus loads the geometry of every level some layer uses (no dataset
values) and indexes each `(level, code)` once, so two datasets on one level don't duplicate results. Levels with a
`parentCode` get one entry per parent place (all of a city's statistical areas) plus one per part, the parts only
matched when the query has a digit ("tel aviv 437").

Ranking: match tier (exact, prefix, word prefix, all words, substring), then the current layer's level first, then
plain before spelling-variant matches (a variant counts at the tier it mirrors), then bigger places. Results on
another level name that level. Picking one switches to the layer for that level in the current dataset if there is
one, else the first layer on it. The coloured value shows only for results on the current layer.

Normalisation: case, niqqud, maqaf, geresh/gershayim and quotes, hyphens vs spaces, ё/йо → е, q → k, kefar → kfar.
Variants: Latin and Cyrillic without vowels, b/v/w, kh/ch/h, tz/ts/z; Hebrew without ו/י ("קרית" finds "קריית").
A variant counts only when the query's skeleton has 3+ letters and matches as a whole, a prefix or a word prefix.

## A new dataset

Add it to the pipeline (README, "Adding a dataset"). On the next `build:viewer` it appears:

- in the switcher, grouped by `layer.dataset`; the group title is the part of the layer titles before " – ", the item
  label is the level title
- with its classification (`categorical` or `stepped`), legend, `note`, presets (first/last three classes when there
  are at least six) and `missing` style
- with its `popup` fields and formats, and `levels[...].featureType`/`featureTypes` for the type line
- in search, by `name_he/en/ru` of its level (see above)

`points` layers (a GeoJSON FeatureCollection at `layer.data`) are drawn as markers with the same classification.

## Basemap config

`viewer/src/config.ts`:

```ts
export const basemap = {
  styleUrl: 'https://tiles.openfreemap.org/styles/positron',
  attribution: '…OpenFreeMap © OpenMapTiles © OpenStreetMap contributors…',   // About panel
  labelFields: { he: ['name:he', 'name'], en: ['name:en', 'name_en', 'name:latin', 'name'], ru: ['name:ru', 'name:en', 'name_en', 'name'] },
  labelFont: ['Noto Sans Regular'],                                             // for our labels; must exist on the style's glyph server
  isNameLabel: (layer) => …,     // symbol layers whose text-field shows a name
  isPlaceLabel: (layer) => …,    // settlement labels to hide while ours show
  isHiddenLabel: (layer) => …,   // never shown: country names (owner's decision)
};
```

On language change the viewer sets every `isNameLabel` layer's `text-field` to
`['coalesce', ['get', f1], ['get', f2], …]` from `labelFields[lang]`. To switch providers, change this object only.
The map's attribution control takes the provider credit from the style's TileJSON.

MapLibre's own strings (zoom buttons, attribution toggle, the "use two fingers / Ctrl+scroll" hint) come from
`MAP_LOCALE` in `i18n.ts`. MapLibre has no public setter, so a language switch patches `map._locale` and rebuilds the
controls and the gesture hint.

**Hebrew/RTL.** MapLibre 6 shapes and reorders right-to-left text natively; `setRTLTextPlugin` is deprecated
("nothing has to be loaded for right-to-left languages to be drawn correctly"), so the viewer loads no plugin. The
OpenFreeMap Noto Sans glyph ranges cover Hebrew (U+0590–05FF) and Cyrillic; the e2e screenshots show both.

## URL

Query: `lang`, `layer`, `hl` (class keys, comma-separated), `f` (selected feature code), `embed=1`. Hash:
`#zoom/lat/lon` (MapLibre `hash: true`). See the README table. The URL is rewritten with `history.replaceState`
on every change, so the address bar is always a shareable link.

## Layout

- Desktop: a column of cards at the inline start (left in en/ru, right in he; CSS logical properties throughout).
- Compact (`embed=1`, or narrower than 720 px): search and language on top; a bottom sheet with an always-visible
  legend strip (tap a class to highlight) that expands to the layer list, presets and About. The map ends above the
  collapsed sheet. In embed mode the map needs two fingers / Ctrl+scroll so the blog page still scrolls, and an
  "Open full map" link opens the same view without `embed`. Zoom buttons show on desktop, and in a desktop embed
  (pointer that can hover); on touch devices pinch is enough. Touch targets are 40–44 px.
- Keyboard: the panel comes before the map in tab order. Picking a search result moves focus to the popup's close
  button; Escape closes the popup (from anywhere but the search box and dialogs) and returns to the search box.

## Tests

- `viewer/tests/*.test.ts` (vitest, project `viewer`): bidi-safe formatting, search normalisation and ranking
  against the shipped data, classification and colours (categorical and stepped), i18n and name fallbacks, popup
  formats (stepped values), URL state, layer grouping, join and label points.
- `viewer/e2e/smoke.spec.ts` (Playwright, Chromium), against `dist/site` served under `/maps/israel/`, each test
  failing on any console error:
  - layer switching, search for תל אביב / Tel Aviv / Тель-Авив opening a popup, RTL/LTR, MapLibre UI language
  - keyboard: search → pick → Escape
  - embed: compact layout, full-map link, a 650 px iframe in a blog page framing Israel while the wheel scrolls the page
  - phone 390×844: no horizontal scroll, sheet, tap a result, popup inside the screen
  - an injected stepped layer (negative breaks): legend, presets and popup checked in visual order in Hebrew

  `SCREENS=<dir> npm run test:e2e` also saves screenshots.
