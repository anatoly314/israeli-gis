# Data contract (v1)

This is what the viewer can rely on in `dist/data/`. All of it comes from `npm run build`.

**Source of truth:** the zod schemas in `pipeline/lib/contract.ts`. The TypeScript types are inferred from them. The
build validates `layers.json` against them and writes the equivalent JSON Schema to `dist/data/layers.schema.json`.
The viewer can import `contract.ts` directly (its only dependency is zod) or validate against the JSON Schema.

## Files

All paths are relative to `layers.json`. Serve the folder as static files.

```
dist/data/
├── layers.json                                    manifest: levels, layers, attribution, sources
├── layers.schema.json                             JSON Schema of layers.json (generated)
├── geometry/                                      TopoJSON, one file per level
│   ├── local-authorities-2011.topo.json           objects "local-authorities-2011" (257) + "…-placeholders" (126 points)
│   ├── localities-2011.topo.json                  objects "localities-2011" (1283)       + "…-placeholders" (126)
│   ├── rc-localities-2011.topo.json               objects "rc-localities-2011" (1074)    + "…-placeholders" (114)
│   └── statistical-areas-2011.topo.json           objects "statistical-areas-2011" (1917) + "…-placeholders" (0)
└── datasets/ses-2021/
    ├── local-authorities-2011.json                code → values (255 rows)
    ├── rc-localities-2011.json                    code → values (996 rows)
    └── statistical-areas-2011.json                code → values (1641 rows)
```

Read these paths from `layers.json` (`levels[*].file`, `levels[*].object`, `levels[*].placeholderObject`,
`layers[*].data`) rather than hard-coding them.

| Level file | Raw | Gzip |
|---|---|---|
| local-authorities-2011 | 746 KB | 231 KB |
| localities-2011 | 978 KB | 288 KB |
| rc-localities-2011 | 414 KB | 113 KB |
| statistical-areas-2011 | 1330 KB | 331 KB |

Each dataset is ≤ 20 KB gzipped, and the manifest is 3 KB.

## Geometry levels

Level ids carry the boundary vintage. All four levels derive from the CBS **2011** statistical-areas layer (2020
edition). A future index built on the 2022 SA layer would add `statistical-areas-2022` and keep these.

| Level | `code` | Contents |
|---|---|---|
| `local-authorities-2011` | Municipalities and local councils: their CBS locality code (`"5000"` Tel Aviv-Yafo). Regional councils: `5500 + council number` (`"5501"` HaGalil HaElyon). | 79 municipalities, 124 local councils and 54 regional councils. Each RC is its open land (CBS `55xx`) dissolved with all member localities. No-jurisdiction areas (`99xx`) are not included. |
| `localities-2011` | CBS locality code | **Every** CBS locality, municipalities included (1283). Cities that are divided into SAs appear as one dissolved polygon. Use this level for any dataset keyed by locality code. |
| `rc-localities-2011` | CBS locality code | Only the 1074 localities that belong to a regional council. This is the unit of the SES "table B" index. |
| `statistical-areas-2011` | `locality_code × 10000 + sa` (`"50000437"`) | Every SA of the 117 cities that are divided into SAs |

Bare RC numbers (1–78) never appear as codes, because they collide with locality codes. These are statistical
boundaries, not legal municipal jurisdictions.

### TopoJSON specifics

- **CRS:** WGS84 lon/lat. The source is EPSG:2039, reprojected with the 7-parameter Israel 1993 → WGS84 shift. On
  control points that is within 0.21 m of PROJ's best EPSG operation, and the tests check it.
- **Simplification:** mapshaper Visvalingam with `keep-shapes`, per level. Borders are shared topologically within a
  level.
- **Quantization:** 2·10⁵ per axis over the level's bounding box. Like all TopoJSON quantization it is anisotropic:
  about 0.7 m east-west and 2 m north-south.
- **Arcs:** written with mapshaper's `fix-geometry`, so a few delta-encoded arcs contain **decimal** values (104 in
  the SA file). `topojson-client` handles this. A decoder that assumes integer deltas does not.
- **Validity:** every polygon passes GEOS `ST_IsValid`. The build fails otherwise.
- **Loading:**

  ```ts
  import { feature } from 'topojson-client';
  const topo = await (await fetch(level.file)).json();
  const polygons = feature(topo, topo.objects[level.object]);              // FeatureCollection<Polygon|MultiPolygon>
  const markers  = feature(topo, topo.objects[level.placeholderObject]);   // FeatureCollection<Point>
  map.addSource(id, { type: 'geojson', data: polygons, promoteId: 'code' });
  ```

### Polygon properties

| Property | Type | Levels | Meaning |
|---|---|---|---|
| `code` | string of digits | all | Join key, unique within a level. **Always a string.** |
| `name_he` | string | all | Hebrew name (CBS) |
| `name_en` | string | all | English name. See [Names](#names) for fallbacks. |
| `name_ru` | string | all | Russian name. See [Names](#names) for fallbacks. |
| `placeholder` | boolean | all | `true` if CBS has no real boundary for this unit, only 50 m circles. See below. |
| `locality_code` | string of digits | statistical-areas-2011 | Code of the city the SA belongs to |
| `sa` | integer | statistical-areas-2011 | SA number within the city |

On `statistical-areas-2011`, `name_*` holds the **city** name. Build the label from `levels[...].featureLabel[lang]`,
replacing `{name}` with `name_<lang>` and `{sa}` with `sa`.

### Placeholder circles (West Bank)

For 126 West Bank localities, CBS stores an identical 50 m-radius circle (≈ 7,800 m²) instead of a boundary. There
is no attribute that marks them; the pipeline detects them by shape. After simplification they are tiny triangles,
invisible below about zoom 13.

- **Polygon flag:** `placeholder: true` on any feature made **only** of such circles:
  - 126 localities (12 of them local councils, e.g. Efrat and Qiryat Arba)
  - 114 RC localities
  - 12 local councils and the 6 West-Bank regional councils (5572–5578) in `local-authorities-2011`
- **Marker points:** `objects[level.placeholderObject]` holds one `Point` per circle, at the circle centre, with
  `properties.code` matching the polygon it belongs to. An RC made of 20 circles has 20 points sharing one code.
  Draw them as a minimum-size marker (e.g. a `circle` layer with a fixed pixel radius), coloured by the same joined
  value as the polygon. The statistical-areas level has an empty points object.
- **Counts:** `levels[...].placeholderCount` is the number of flagged polygons.

## Datasets (choropleth)

A dataset is a JSON object mapping `code` to a record. Every field of every record is a finite number, never `null`:

```json
{
  "50000437": { "cluster": 9, "index": 2.4021, "rank": 1632, "population": 2685 },
  "310001":   { "cluster": 3, "index": -0.6217, "rank": 384, "population": 5224 }
}
```

`ses-2021` record fields:

| Field | Type | Meaning |
|---|---|---|
| `cluster` | integer 1–10 | CBS socio-economic cluster. 1 is the lowest level, 10 the highest. This is the `valueField`. |
| `index` | number, 4 decimals | Standard deviations from the mean of that level's units |
| `rank` | integer 1…N | Ascending (1 = lowest). N is the popup `rank.total`: 255, 996 or 1641. |
| `population` | integer | CBS 2021 "index population". It excludes residents of nursing homes, prisons and similar institutions. |

Values compare only within a level.

### "Not calculated"

**A feature with no key in the dataset is "not calculated".** Draw it with `classification.missing.color`, and show
`missing.label` and `missing.description`. Never draw it as a low value. The build fails if any table row lacks
geometry, so a missing key always means CBS did not compute the index.

| Level | Without data | Why |
|---|---|---|
| `statistical-areas-2011` | 276 / 1917 | 164 SAs are in the 36 cities CBS did not compute at SA level (mostly Arab and Druze cities). 112 SAs inside computed cities have fewer than 120 residents or are non-residential. |
| `rc-localities-2011` | 78 / 1074 | Fewer than 120 residents, institutional, or non-residential |
| `local-authorities-2011` | 2 / 257 | Migdal Tefen (`"1722"`) and Neot Hovav (`"1770"`), which are industrial local councils |

## Names

| | Source, in order of preference |
|---|---|
| `name_he` | CBS localities file (`bycode2021`). Then, for regional councils, the CBS municipal-status name without its "מועצה אזורית" prefix. Then the SA layer. |
| `name_en` | 1. CBS localities file. 2. CBS SA layer (for RCs, the open-land polygon's English name). 3. The English label of the matched Wikidata item. 4. **The Hebrew name.** |
| overrides | 1770 → en "Neot Hovav". 5540 → עמק לוד / Emek Lod / Эмек-Лод, its 2021 name; the localities file and SA layer still say Sedot Dan. |
| `name_ru` | 1. The ru.wikipedia article title of the matched Wikidata item, with the disambiguator stripped. 2. That item's Cyrillic ru label. 3. **`name_en`.** Never transliterated. |

**Wikidata matching.** The item is matched on P3466 (CBS code):
- Several items with the same code: the one whose Hebrew label matches the CBS Hebrew name after normalisation wins.
  An English-label match also counts, as a tie-breaker (it settles 445 Ramot Menashe, where two items share the
  Hebrew label). If nothing matches, no item is used.
- A lone item is accepted as is, because its label often uses another name for the same place (3745 Mezadot Yehuda /
  Beit Yatir). The exceptions are a reviewed reject list in `pipeline/boundaries/index.ts` (897, 926, 2010, 848). The
  build prints every lone item whose labels don't match as a `review` line.
- Dissolved items (P576) are skipped. The exception is Modi'in Illit (3797), which Wikidata wrongly marks dissolved:
  a dissolved item is still used when no live item carries the code and its Hebrew label matches.

**The viewer must handle two fallbacks itself:**
- `name_ru === name_en` means there is no Russian name; the English one is shown. If you want, mark it or
  show it in Latin script.
- **Hebrew text in `name_en` and `name_ru`** occurs for 44 localities (43 of them RC localities). These are
  industrial zones, regional centres and colleges (CBS codes 17xx, e.g. `"1706"` מפעלי גליל עליון) for which no
  source has an English name. None of them has SES data, but they are drawn and can be clicked. Render
  `name_en` and `name_ru` with `dir="auto"` so these display correctly in LTR UIs.

| Level | real `name_ru` | Hebrew-only `name_en` |
|---|---|---|
| local-authorities-2011 | 257 / 257 | 0 |
| localities-2011 | 712 / 1283 | 44 |
| rc-localities-2011 | 506 / 1074 (496 of the 996 with an index) | 43 |
| statistical-areas-2011 (city names) | 117 / 117 cities | 0 |

## `layers.json`

The zod schemas in `pipeline/lib/contract.ts` are authoritative; the shapes below summarise them.

```ts
type I18n = { he: string; en: string; ru: string };   // all three, non-empty
type LevelId = 'local-authorities-2011' | 'localities-2011' | 'rc-localities-2011' | 'statistical-areas-2011';

interface Manifest {
  version: 1;
  levels: Record<LevelId, Level>;       // every level is present, even without a layer (localities-2011 has none yet)
  layers: Layer[];                      // suggested order: coarse → fine
  attribution: I18n;                    // geometry + names credit
  sources: Source[];                    // geometry + names sources
}

interface Level {
  title: I18n;
  file: string;
  object: string;                       // polygons
  placeholderObject: string;            // points, one per placeholder circle (may be empty)
  idProperty: 'code';
  featureCount: number;
  placeholderCount: number;
  featureLabel?: I18n;                  // template, {name} / {<property>}
}

type Layer = ChoroplethLayer | PointsLayer;
interface LayerBase {
  id: string; dataset: string; title: I18n;
  data: string;                         // dataset path
  valueField: string;
  classification: Categorical | Stepped;
  popup: PopupField[];
  attribution: I18n;
  source: Source;
}
interface ChoroplethLayer extends LayerBase { kind: 'choropleth'; level: LevelId }
interface PointsLayer extends LayerBase { kind: 'points' }      // data = GeoJSON FeatureCollection<Point>

interface Categorical {
  type: 'categorical';
  classes: { value: number; label: I18n; color: string }[];     // #rrggbb
  missing: { label: I18n; description: I18n; color: string };
  note?: I18n;
}
interface Stepped {                                              // not used yet; ready for crime/health rates
  type: 'stepped';
  breaks: number[];                                              // strictly ascending
  colors: string[];                                              // breaks.length + 1
  missing: { label: I18n; description: I18n; color: string };
  note?: I18n;
}
// Stepped colour: v < breaks[0] → colors[0]; breaks[i-1] ≤ v < breaks[i] → colors[i]; v ≥ last → last colour.
// In MapLibre: ['step', ['get', valueField], colors[0], breaks[0], colors[1], …].

interface PopupField {
  field: string; label: I18n;
  format: { type: 'integer' } | { type: 'decimal'; decimals: number } | { type: 'rank'; total: number };
}
interface Source { name: I18n; url: string; license: string; licenseUrl: string; citation: string }
```

Popup formats:
- `integer`: `Intl.NumberFormat(lang)`.
- `decimal`: the given number of fraction digits.
- `rank`: e.g. "1632 / 1641". The wording for "of" is a UI string.

### Shipped layers

| id | level | dataset |
|---|---|---|
| `ses-2021-local-authorities` | `local-authorities-2011` | `datasets/ses-2021/local-authorities-2011.json` |
| `ses-2021-localities` | `rc-localities-2011` | `datasets/ses-2021/rc-localities-2011.json` |
| `ses-2021-statistical-areas` | `statistical-areas-2011` | `datasets/ses-2021/statistical-areas-2011.json` |

All three use the same classification: categorical clusters 1–10, viridis from cluster 1 (dark) to 10 (light),
missing `#c8c8c8`. They also share the popup fields `cluster`, `index` (3 decimals), `rank` and `population`. The
full JSON is in `dist/data/layers.json`.

Excerpt:

```json
{
  "id": "ses-2021-statistical-areas",
  "dataset": "ses-2021",
  "kind": "choropleth",
  "level": "statistical-areas-2011",
  "title": { "he": "מדד חברתי-כלכלי 2021 – אזורים סטטיסטיים", "en": "Socio-economic index 2021 – statistical areas", "ru": "Социально-экономический индекс 2021 – статистические районы" },
  "data": "datasets/ses-2021/statistical-areas-2011.json",
  "valueField": "cluster",
  "classification": {
    "type": "categorical",
    "classes": [{ "value": 1, "color": "#440154", "label": { "he": "אשכול 1", "en": "Cluster 1", "ru": "Кластер 1" } }, "… 2–10 …"],
    "missing": { "color": "#c8c8c8", "label": { "he": "לא חושב", "en": "Not calculated", "ru": "Не рассчитан" }, "description": { "…": "…" } },
    "note": { "en": "1 = lowest socio-economic level, 10 = highest", "…": "…" }
  },
  "popup": [
    { "field": "cluster", "format": { "type": "integer" }, "label": { "en": "Cluster", "…": "…" } },
    { "field": "index", "format": { "type": "decimal", "decimals": 3 }, "label": { "en": "Index value", "…": "…" } },
    { "field": "rank", "format": { "type": "rank", "total": 1641 }, "label": { "en": "Rank", "…": "…" } },
    { "field": "population", "format": { "type": "integer" }, "label": { "en": "Index population", "…": "…" } }
  ],
  "attribution": { "en": "Socio-Economic Index 2021: CBS Israel", "…": "…" },
  "source": { "url": "https://www.cbs.gov.il/en/mediarelease/…", "license": "CBS open licence", "citation": "הלשכה המרכזית לסטטיסטיקה (הלמ\"ס), …", "…": "…" }
}
```

### Colouring with MapLibre

```ts
const values = await (await fetch(layer.data)).json();
for (const f of [...polygons.features, ...markers.features]) Object.assign(f.properties, values[f.properties.code] ?? {});
const c = layer.classification;
const fill = c.type === 'categorical'
  ? ['match', ['get', layer.valueField], ...c.classes.flatMap((k) => [k.value, k.color]), c.missing.color]
  : ['case', ['has', layer.valueField],
      ['step', ['get', layer.valueField], c.colors[0], ...c.breaks.flatMap((b, i) => [b, c.colors[i + 1]])],
      c.missing.color];
```

## i18n

- Languages: `he` (RTL), `en`, `ru`. Every `I18n` object in the manifest has all three, none of them empty.
- For feature names and their fallbacks, see [Names](#names).
- UI chrome strings (legend title, "of", the language switcher) belong to the viewer.

## Attribution

The attribution control should show these three things, joined with ` · `:

1. `manifest.attribution[lang]`
2. `layer.attribution[lang]` for each visible layer
3. the OpenFreeMap credit from its TileJSON, linking © OpenStreetMap contributors to
   https://www.openstreetmap.org/copyright

An About panel must show the full `citation` and `licenseUrl` of every `manifest.sources[]` entry and every
`layer.source`. The CBS licence requires the full citation, including the "copied and distributed as is" wording.
Don't imply CBS endorsement.

## Stability

- Within `version: 1`, codes, property names, level ids, object names and the manifest shape are stable. A breaking
  change bumps `version`.
- Builds are deterministic. The tests rebuild from `data/raw` and fail if the committed `dist/data` differs by a
  single byte.
- New datasets add layers and `datasets/<id>/` files. New boundary vintages add levels.

### Changes since the first slice-1 hand-off

- Level ids renamed:
  - `local-authorities` → `local-authorities-2011`
  - `localities` → `rc-localities-2011`
  - `statistical-areas` → `statistical-areas-2011`
  - new: `localities-2011` (all localities)
- File names follow the level ids: `geometry/<level>.topo.json` and `datasets/ses-2021/<level>.json`.
- New `placeholder` property, `placeholderObject` points object and `placeholderCount`.
- Classification is now `categorical | stepped`.
- Quantization went from 1e5 to 2e5 with `fix-geometry`, which brings decimal arc deltas.
- New `layers.schema.json`.
- Names were corrected (see [Names](#names)). `name_en`/`name_ru` may be Hebrew for 44 no-data localities.
