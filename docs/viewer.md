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
| `classify.ts` | Class key per value (categorical value, `s<i>` stepped bin, `na`), colours, legend entries, scale order and run labels ("4–7", "< 5"), MapLibre expressions, highlight opacity |
| `format.ts` | The one number formatter: `Intl.NumberFormat` without its bidi marks, wrapped in a left-to-right isolate (U+2066…U+2069); stepped ranges are isolated as a whole so "< -1" never mirrors in Hebrew |
| `html.ts` | `esc` and the colour swatch |
| `map.ts` | MapLibre: map creation, MapLibre UI strings per language, basemap language and hidden labels, sources/layers per data layer, feature-state, controls |
| `extras.ts` | `levels[*].extraFields` in the popup and tooltip (generic: label, language note, values in their own language) |
| `popup.ts` | Popup and tooltip HTML, field formats (`integer`, `decimal`, `rank` "N of M"), feature title/type; stepped layers show the actual value with the bin as secondary text |
| `search.ts` | Normalisation, per-level index entries, ranking |
| `search-box.ts` | ARIA combobox (arrows, Enter, Escape), result count in a polite live region |
| `i18n.ts` | All UI strings (he/en/ru), MapLibre's own UI strings, language detection, name fallbacks |
| `url.ts` | Query-string state parse/serialise |
| `range.ts` | Highlight selection ↔ slider handles (contiguous / custom / empty), `hl` ranges ("4-7") ↔ class keys |
| `slider.ts` | The two-handle range slider (two native `<input type="range">` over the class scale) |
| `ui.ts` | Layer switcher, legend + compact legend strip, language switch, About dialog |

Types come from `pipeline/lib/contract.ts` with `import type`, so the viewer and the pipeline share one contract
without bundling zod.

## Rendering

Per data layer (`<id>` = layer id), added once on first use and then only shown/hidden:

- sources `<id>` (polygons) and `<id>-markers` (placeholder points), `promoteId: 'code'`; `<id>-labels` (label points)
- `fill` coloured by `['match', ['get', '_k'], …]`, where `_k` is the class key the viewer writes at join time. This
  makes categorical and stepped classifications style the same way. Opacity 0.85. While classes are highlighted,
  the others turn a flat grey (`#c4c4c4` at 0.45) rather than a faded class colour: with a diverging palette
  (RdYlBu) a faded red or blue would read as one of the pale middle classes. The grey is darker than a highlighted
  pale class and lighter than the dark ones.
- `hatch`: a dark-grey diagonal pattern over "not calculated" features (`_k = na`), so missing data never reads as a
  class, also not as the pale RdYlBu middle (cluster 6) or a dimmed feature
- `line`: dark translucent borders (`#3a3a3a`; 0.6 px at 0.45 opacity at zoom 6, up to 2 px at 0.55), so pale classes
  keep an edge on the light basemap, also at country zoom
- `casing` + `outline`: hover/selection is a near-black line over a white casing, ≥ 3:1 against every class
- placeholder markers have a dark translucent ring (`rgba(58,58,58,0.65)`, 1.2 px), so pale-class markers stay
  visible on the basemap
- All of these values live in `paint.ts` and are unit-tested for contrast. Caveat: 10-class RdYlBu is
  colourblind-safe, but ColorBrewer rates it "screen-friendly" only up to 8 classes; the borders compensate.
- Text on colour (strip numbers) is black or white by WCAG contrast (`textOn` in `classify.ts`), computed from the
  hex for any palette; RdYlBu reaches at least 4.6:1 on every class.
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

Searchable extra fields (`levels[*].extraFields` with `searchable: true`, e.g. neighborhood names) add one entry per
feature that has values, holding all its items: an area is listed once however many of its neighborhoods match.
Items match by whole words (tiers 0–3, no substrings) and rank after every direct name match. The row shows the
item that matched before the place, in the item's language: "שכ פלורנטין · Tel Aviv - Yafo – neighborhood 813".
For the statistical areas that is 1298 more entries; building the level's index takes about 20 ms.

## Extra fields

`levels[*].extraFields` are rendered generically (`extras.ts`); nothing in the viewer names a property.
- Popup, under the type line: one line per field the feature has, "Label (in Hebrew): a, b, c". Lists longer than
  eight items show the first eight and a "+N more" disclosure (`<details>`).
- Tooltip: the first field the feature has, its first three items, "…" if there are more.
- Values carry `lang={textLang}` and `dir="rtl"` for Hebrew (`auto` otherwise) and are joined inside that span, so
  the commas follow the values' own direction in any UI.
- The "(in Hebrew)" / "(на иврите)" note is viewer text keyed by the values' language and the UI language; none when
  they match.

## A new dataset

Add it to the pipeline (README, "Adding a dataset"). On the next `build:viewer` it appears:

- in the switcher, grouped by `layer.dataset`; each item is labelled with its level's `title`, and the level's
  `officialTerm` as small secondary text (also in the popup, after the feature type); the group is headed by
  `datasets[id].title`, with `datasets[id].description` under it when set
- with its classification (`categorical` or `stepped`), legend, `note`, range slider over its classes or bins, and
  `missing` style
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

Query: `lang`, `layer`, `hl` (class keys; runs as ranges, `4-7`, others listed, `1,5,9`; old list links still
read), `f` (selected feature code), `embed=1`. Hash: `#zoom/lat/lon` (MapLibre `hash: true`). See the README table.
The URL is rewritten with `history.replaceState` on every change (a slider drag writes it once, on release), so the
address bar is always a shareable link.

## Highlight: legend and range slider

Both set the same selection of class keys, applied as a paint-opacity expression (no data re-sent). Legend items
toggle single classes, "not calculated" included, so a selection can have gaps. Every class without "not calculated"
is the same as no selection (one "everything" state, also for `hl=1-10`).

The slider (under the legend title on desktop, under the colour strip in the compact sheet) covers the classes in
scale order; "not calculated" is not on it. Two native range inputs draw the thumbs and carry focus, ARIA
(`aria-label`, `aria-valuetext`) and keys; pointer input is handled on the track, identically in every engine:
- a press moves the nearer handle to the class under it, so a tap on the colour scale works; drag on from there;
- when both handles sit on one class, the first movement picks the handle (towards lower classes: the low one);
- the handles can meet but not cross.

While a handle moves the map updates once per animation frame, and the legend and strip only flip their pressed and
dimmed states; they re-render and the URL is written when the move ends. A selection with gaps or with "not
calculated" shows as "custom": the handles frame it and the label lists it ("1, 5, 9 · custom"); moving a handle
makes it contiguous again. The slider follows the page direction, so in Hebrew class 1 is on the right (like the
strip and legend). ← and → always step the way they point: the viewer handles them itself, because engines disagree
for right-to-left range inputs (WebKit reverses them). ↑/↓, Home/End are native. The e2e slider specs run in
Chromium, Firefox and WebKit.

## Layout

- Desktop: a column of cards at the inline start (left in en/ru, right in he; CSS logical properties throughout).
- Compact (`embed=1`, or narrower than 720 px): search and language on top; a bottom sheet with an always-visible
  legend strip (tap a class to highlight) and the range slider under it, expanding to the layer list, legend notes
  and About. The map ends above the
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
  - an injected stepped layer (negative breaks): legend, slider and popup checked in visual order in Hebrew
  - the range slider in en and he: keyboard, mouse drag, legend clicks → custom → drag back to a range, URL `hl`

  `SCREENS=<dir> npm run test:e2e` also saves screenshots.
