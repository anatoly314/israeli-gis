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
| local-authorities-2011 | 759 KB | 232 KB |
| localities-2011 | 1000 KB | 292 KB |
| rc-localities-2011 | 432 KB | 117 KB |
| statistical-areas-2011 | 1631 KB | 399 KB (incl. ~61 KB of neighborhood/street names) |

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
| `authority_type` | `"city"` \| `"local-council"` \| `"regional-council"` | local-authorities-2011 | Municipal status: CBS status 0 (municipality), 99 (local council), or a regional council (the `55xx` codes) |
| `population` | integer | all | Residents at the end of `levels[...].populationYear` (2020): the SA layer's `Pop_Total`, summed over every polygon the feature is made of (0 where CBS has none). For ordering places by size (label priority, search ties); it is **not** a dataset value and differs from the SES dataset's own `population` field ("index population"), which takes precedence when a viewer merges dataset records into feature properties. All localities sum to 9,217,568. |
| `neighborhoods_he` | string[] (Hebrew) | statistical-areas-2011 | CBS neighborhood names in the SA, in CBS order. **Absent** when CBS lists none (1298 of 1917 SAs have it). |
| `streets_he` | string[] (Hebrew) | statistical-areas-2011 | CBS main streets of the SA (up to five), in CBS order. **Absent** when none (1761 of 1917 have it). |

**Extra fields.** `levels[...].extraFields` lists descriptive feature properties for the popup, in display order:

```json
"extraFields": [
  { "property": "neighborhoods_he", "kind": "list", "textLang": "he", "searchable": true,
    "label": { "he": "שכונות באזור", "en": "Neighborhoods in this area", "ru": "Кварталы на участке" },
    "shortLabel": { "he": "שכונות", "en": "Neighborhoods", "ru": "Кварталы" } },
  { "property": "streets_he", "kind": "list", "textLang": "he", "searchable": false,
    "label": { "he": "רחובות עיקריים", "en": "Main streets", "ru": "Главные улицы" } }
]
```

- `kind: "list"`: the property is a non-empty `string[]` when present. When it is absent, show nothing for that field.
- `textLang`: the language the values are written in, regardless of the UI language. Here they are Hebrew in every
  UI.
- `searchable`: the viewer should index the values, so typing "קרית קמניץ" finds SA 30000112.
- `shortLabel` (optional): a compact form of `label` for passing mentions, such as the search hint "also
  searchable: Neighborhoods". Fall back to `label` when it is absent.
- Labels come from `pipeline/terminology.ts` (`extraFields` of the level kind), like all other level wording. A
  future `statistical-areas-2022` with its own companion file gets the same labels.
- **Source data.** The values come straight from CBS "רחובות עיקריים ושכונות לא"ס 2011" (28.7.2021), listed in
  `manifest.sources`:
  - split on commas, trimmed, deduped
  - otherwise unchanged, including CBS abbreviations: "שכ" (neighborhood), "ש", "שד" (boulevard), and streets
    written as "surname first-name"
  - every SA-2011 polygon matches a row (1917/1917), and so does every SA with index data (1641/1641)

**Feature type.** `levels[...].featureType[lang]` names what one feature of the level is ("Locality",
"Area"). When the type varies within a level, `levels[...].featureTypes` says which property holds it and
labels each value; prefer that label when the feature has the property:

```json
"featureType": { "en": "Municipality", "…": "…" },
"featureTypes": { "property": "authority_type", "labels": { "city": { "en": "City", "…": "…" }, "local-council": { "…": "…" }, "regional-council": { "…": "…" } } }
```

Counts on `local-authorities-2011`: 79 `city`, 124 `local-council`, 54 `regional-council`.

On `statistical-areas-2011`, `name_*` holds the **city** name. Build the label from `levels[...].featureLabel[lang]`,
replacing `{name}` with `name_<lang>` and `{sa}` with `sa` ("Tel Aviv - Yafo – area 437").

**Parts of a place.** `levels[...].parentCode`, when set, names the property that holds the code of the place each
feature is part of; the features' `name_*` are then that place's name. Only `statistical-areas-2011` sets it
(`"locality_code"`). The viewer uses it to search such a level by place (one entry per city) and to skip map labels
that would repeat the city name on every part.

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
| overrides | 1770 → en "Neot Hovav". 5540 → עמק לוד / Emek Lod / Эмек-Лод, its 2021 name; the localities file and SA layer still say Sedot Dan. Seven ru names that collided between two localities get the disambiguator their Hebrew names carry (see the changes list at the end). |
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
  datasets: Record<string, { title: I18n; description?: I18n }>;   // keyed by layer.dataset; every layer's dataset has an entry
  layers: Layer[];                      // suggested order: coarse → fine
  attribution: I18n;                    // geometry + names credit
  sources: Source[];                    // geometry + names sources
}

interface Level {
  kind: 'local-authorities' | 'localities' | 'rc-localities' | 'statistical-areas';   // the id is `<kind>-<vintage>`
  title: I18n;                          // plain name for users ("Neighborhoods")
  officialTerm?: I18n;                  // the CBS term, for small secondary text ("CBS statistical areas"); set on every shipped level
  file: string;
  object: string;                       // polygons
  placeholderObject: string;            // points, one per placeholder circle (may be empty)
  idProperty: 'code';
  featureCount: number;
  placeholderCount: number;
  featureLabel?: I18n;                  // template, {name} / {<property>}
  featureType?: I18n;                   // what one feature is called ("Area"); set on every shipped level
  featureTypes?: { property: string; labels: Record<string, I18n> };   // per-feature type, when it varies
  extraFields?: { property: string; kind: 'list'; textLang: 'he' | 'en' | 'ru'; label: I18n; shortLabel?: I18n; searchable: boolean }[];
  parentCode?: string;                  // property with the code of the place a feature is part of (SA → locality_code)
  populationYear?: number;              // year of the features' `population` (2020 on every shipped level)
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
  "title": { "he": "מדד חברתי-כלכלי 2021 – שכונות", "en": "Socio-economic index 2021 – Neighborhoods", "ru": "Социально-экономический индекс 2021 – Кварталы" },
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

### Level wording (terminology)

All level wording comes from one file, `pipeline/terminology.ts`, keyed by level **kind**. That covers `title`,
`officialTerm`, `featureType`, `featureTypes` labels, `featureLabel`, and the level part of every layer title.

| kind | title (he / en / ru) | officialTerm (he / en / ru) |
|---|---|---|
| `local-authorities` | רשויות מקומיות / Municipalities / Муниципалитеты | רשויות מקומיות / Local authorities / органы местного самоуправления |
| `localities` | יישובים / Localities / Населённые пункты | יישובים (קובץ היישובים של הלמ"ס) / CBS localities / населённые пункты ЦСБ |
| `rc-localities` | קיבוצים, מושבים ויישובים / Kibbutzim, moshavim & villages / Кибуцы, мошавы и посёлки | יישובים במועצות אזוריות / Localities in regional councils / населённые пункты в региональных советах |
| `statistical-areas` | שכונות / Neighborhoods / Кварталы | אזורים סטטיסטיים של הלמ"ס / CBS statistical areas / статистические районы ЦСБ |

- **How the build applies it.** A level's kind is its id without the vintage (`statistical-areas-2011` →
  `statistical-areas`). The build writes the kind to `levels[*].kind` and copies that kind's wording into the level.
- **Layer titles.** Each layer title is the dataset title, then ` – `, then the level's `title`
  (`Socio-economic index 2021 – Neighborhoods`). Datasets only define their own title, in `DatasetModule.info`,
  which the build writes to `manifest.datasets`.
- **When the build fails.** It refuses a level id whose kind has no terminology entry, any terminology field missing
  he/en/ru or with an empty value, a feature type value with no label, and a level whose wording differs from the
  file.

**Changing wording:** edit `pipeline/terminology.ts` → `npm run build:data` → `npm run build:viewer`, then commit the
changed `dist/data`. The tests pin the approved strings, so update them in `tests/terminology.test.ts` as well.

**A new vintage** (e.g. `statistical-areas-2022`) gets the same wording automatically. **A new level kind** needs
three things:
1. add it to `LevelKind` in `pipeline/lib/contract.ts`
2. add a complete entry to `TERMINOLOGY` (the TypeScript type requires one per kind, and the build re-checks)
3. add the level in `pipeline/boundaries/index.ts` with `level('<kind>-<vintage>')`

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

### Changes in slice 2 (additive, still `version: 1`)

- `levels[*].featureType` and `levels[*].featureTypes` (see [Feature type](#polygon-properties)).
- `authority_type` property on `local-authorities-2011` polygons.
- `levels[*].parentCode` (set on `statistical-areas-2011`).
- `population` property on every level, its year in `levels[*].populationYear` (2020).
- Russian names now tell apart localities that shared one: 173/2018 Гиват-Хайим (Меухад)/(Ихуд), 1084/2013
  Бен-Шемен (молодёжная деревня)/(мошав), 66/97 Мерхавия (кибуц)/(мошав), 547 Тамра (Изреэль) vs 8900 Тамра. No
  two localities share a real `name_ru` (tested). The counts in the [Names](#names) table are unchanged.

### Changes for plain level names (additive, still `version: 1`)

- New `levels[*].kind` (required) and `levels[*].officialTerm` (optional in the schema, set on every shipped level).
- New wording for level `title`, `featureType` and `featureLabel`, and for layer titles. See
  [Level wording](#level-wording-terminology). Ids, files and properties are unchanged.
- `featureLabel` keeps the v1 placeholders `{name}` and `{sa}`. The approved "{parent} – квартал {n}" is written
  `{name} – квартал {sa}`.

**The viewer must know:**
1. Show `levels[*].officialTerm[lang]` as small secondary text under the level name, e.g. in the layer switcher and
   the popup header.
2. Strings pinned to the old wording now fail and need updating:
   - `viewer/tests/manifest.test.ts`: the layer labels are now "Municipalities", "Kibbutzim, moshavim & villages"
     and "Neighborhoods"
   - `viewer/tests/search.test.ts` and `viewer/tests/i18n.test.ts`: the label is now "Tel Aviv - Yafo – neighborhood
     437", and the type is "שכונה"
   - `viewer/e2e/smoke.spec.ts`: the radios "Статистические районы" and "Local authorities" are now "Кварталы" and
     "Municipalities"
3. The layer-title grouping (split on ` – `) keeps working, because titles are still `<dataset> – <level title>`.

### Changes for neighborhood and street names (additive, still `version: 1`)

- New `neighborhoods_he` and `streets_he` (`string[]`, absent when empty) on `statistical-areas-2011`.
- New `levels[*].extraFields` (see [Extra fields](#polygon-properties)).
- New source in `manifest.sources`: CBS main streets and neighborhoods by statistical area.
- The SA file grew by about 61 KiB gzipped (345 → 408 KB, about 399 KiB) and by about 48 KiB with brotli.

**The viewer must know:**
1. Render `levels[*].extraFields` generically, without hard-coding property names:
   - In the popup: each field present on the feature as `label[lang]` followed by the items joined with ", ".
   - In the tooltip: the first field only, perhaps truncated to the first two or three items.
2. Mark values with `lang={textLang}` and `dir="auto"` (or `dir="rtl"` for `he`), so they render in Hebrew in every
   UI.
3. When `textLang !== lang`, add a short note after the label. The note is viewer UI text keyed by `textLang`:
   - he UI: nothing
   - en UI: "(in Hebrew)"
   - ru UI: "(на иврите)"

   It belongs in the viewer and not in the manifest, because it depends only on the pair of UI language and
   `textLang`, like the viewer's other chrome strings. Putting it in the manifest would repeat the same phrase on
   every field.
4. Fields with `searchable: true` (here `neighborhoods_he`) go into the search index. A hit should open the SA it
   came from, and the result row should show which item matched.

### Changes for dataset titles (additive, still `version: 1`)

- New top-level `datasets`, keyed by dataset id:
  `{ "ses-2021": { "title": { "he": "מדד חברתי-כלכלי 2021", "en": "Socio-economic index 2021", "ru": "Социально-экономический индекс 2021" } } }`.
  `description` is optional and not set yet.
- It is the single source of truth: every choropleth layer title is `datasets[layer.dataset].title[lang] + " – " +
  levels[layer.level].title[lang]`. The build fails otherwise, and the schema requires an entry for every
  `layer.dataset`.

**The viewer must know:** take the group heading from `manifest.datasets[layer.dataset].title[lang]`, and show
`description` when present. Stop deriving the heading from the common prefix of layer titles. The item label stays
`levels[layer.level].title`.

### Changes for statistical-area wording (additive, still `version: 1`)

- `statistical-areas` kind: the level title stays שכונות / Neighborhoods / Кварталы. One feature is now an area:
  - `featureType`: אזור / Area / Участок
  - `featureLabel`: "{name} – אזור {sa}" / "{name} – area {sa}" / "{name} – участок {sa}"
- `neighborhoods_he` label: שכונות באזור / Neighborhoods in this area / Кварталы на участке.
- New optional `extraFields[*].shortLabel`, here שכונות / Neighborhoods / Кварталы.
- The Russian CBS term is "статистические районы" everywhere: the official term is "статистические районы ЦСБ", and
  the sources and attribution match. The build fails if the manifest mixes it with "статистические участки".

**The viewer must know:**
1. Use `shortLabel ?? label` in the "also searchable" hint.
2. Tests pinned to "neighborhood 437" / "שכונה" now read "area 437" / "אזור".
