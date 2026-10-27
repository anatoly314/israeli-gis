# israeli-gis

An embeddable, multi-layer web map of Israel's open data, in two parts:
- **pipeline**: turns raw CBS spreadsheets and the CBS statistical-areas geodatabase into small TopoJSON boundaries,
  per-dataset value files, and a `layers.json` manifest (`dist/data/`).
- **viewer**: a static MapLibre page that reads `dist/data/layers.json` and shows every layer in it, in Hebrew, English
  and Russian (`viewer/`, built to `dist/site/`).

Datasets (one layer group each):

| Dataset | Levels | Classification |
|---|---|---|
| `ses-2021`: CBS socio-economic index 2021 | local authorities, localities in regional councils, statistical areas | clusters 1–10, RdYlBu |
| `peripherality-2020`: CBS peripherality index 2020 | local authorities, all localities (cities included) | clusters 1–10, YlGn |
| `population-2024`: CBS localities file 2024 | size and growth on local authorities and all localities; population group and locality type on localities | stepped BuPu / BrBG, nominal Okabe-Ito |
| `census-2022`: CBS Census 2022 | median age, aged 65+, academic degree, median wage, renting, household religiosity on all localities and on statistical areas (2022 division) | stepped YlOrBr, nominal Okabe-Ito |
| `schools-2026`: Ministry of Education schools | 6,641 points: education stream, school level | nominal Okabe-Ito |

Five geometry levels are shared by every dataset:

| Level | Features | Source |
|---|---|---|
| `local-authorities-2011` | 257 municipalities, local and regional councils | dissolved from the SA-2011 layer |
| `localities-2011` | 1,283 localities, cities included | dissolved from the SA-2011 layer |
| `rc-localities-2011` | 1,074 localities in regional councils | dissolved from the SA-2011 layer |
| `statistical-areas-2011` | 1,917 statistical areas in 117 cities (SES 2021) | CBS SA-2011 layer |
| `statistical-areas-2022` | 2,615 statistical areas in 145 cities (census 2022) | CBS SA-2022 layer |

The two SA levels have different boundaries and numbering. The same code can name different areas on the two levels,
so a code means something only together with its level.

- `docs/data-sources.md`: research notes covering where every file comes from, its schemas, join keys, and licensing.
- `docs/data-contract.md`: the spec for `dist/data/` that the viewer codes against.
- `docs/viewer.md`: the viewer's architecture, basemap config and URL params.

## Setup

Node.js 20.19+ or 22.12+ (Vite 8).

```sh
npm install
npx playwright install chromium   # only for the browser smoke test
```

GDAL runs as WebAssembly through [`gdal3.js`](https://github.com/bugra9/gdal3.js), using the OpenFileGDB driver plus
GEOS for validity checks. No system packages are needed. If gdal3.js fails to load, the pipeline falls back to
`ogr2ogr` on `PATH` (`brew install gdal`). If neither works, it stops with a message saying so.

npm 12 blocks install scripts by default, and you can leave them blocked. The blocked ones belong to optional native
add-ons pulled in by mapshaper's GeoPackage and msgpack support (`better-sqlite3`, `msgpackr-extract`), which this
pipeline never uses. Spreadsheets are read with `read-excel-file`, CSV with `csv-parse`.

## Usage

```sh
npm run download       # fetch missing raw files into data/raw/ and verify every file's sha256
npm run build:data     # pipeline: data/raw → dist/data (offline; ~20 s)
npm run build:viewer   # viewer: viewer/ + dist/data → dist/site (~2 s)
npm run build          # both, in that order
npm run dev            # viewer dev server on http://localhost:5173, serving dist/data at /data/
npm run preview        # serve the built dist/site
npm test               # type-check pipeline + viewer, viewer unit tests, rebuild into a temp dir and test that build
npm run test:e2e       # build the viewer, then Playwright e2e (Chromium; slider specs also Firefox/WebKit) under /israeli-gis/
```

The e2e preview server listens on port 4179; set `E2E_PORT` to run several e2e suites at once
(`E2E_PORT=4281 npm run test:e2e`).

`build:data` writes to a staging directory and checks everything there. If all checks pass, it swaps the staging
directory in for `dist/data`. If any check fails, `dist/data` is left untouched. The checks are:
- every raw file matches its pinned sha256
- the datum shift is within 1 m on control points
- every table code has geometry
- every polygon is GEOS-valid
- `layers.json` and the datasets match the contract

Output:

```
  ✓ statistical areas            1641/1641  — 276 statistical-areas-2011 features without data → "not calculated"
  ✓ regional-council localities  996/996    — 78 rc-localities-2011 features without data → "not calculated"
  ✓ local authorities            255/255    (municipalities + local councils 201/201, regional councils 54/54) — 2 …
```

The tests never read a stale `dist/data`. `tests/global-setup.ts` builds a fresh copy into a temp dir, and every test
reads that copy. `tests/dist-fresh.test.ts` then fails if the committed `dist/data` differs from it by one byte, so
re-run `npm run build:data` after changing pipeline code or raw data.

## Layout

```
pipeline/
  build.ts                    CLI: build into staging, swap into dist/data, print the report
  run.ts                      buildAll(outDir): raw → outDir with every check
  download.ts                 fetches and verifies every RawFile declared by boundaries and datasets
  boundaries/                 SA-2011 layer → four geometry levels, SA-2022 layer → one; placeholder detection, names
  datasets/
    index.ts                  dataset registry
    cluster-index.ts          shared layer shape of CBS cluster indices (classification, popup, title)
    ses-2021/                 socio-economic index 2021: parse tables → values + layer definitions
    peripherality-2020/       peripherality index 2020: authorities + all localities
    population-2024/          population 2024: four measures (size, growth, group, type)
    census-2022/              census 2022: six measures on localities and on SA-2022
    schools-2026/             MoE schools: the first points layer (stream, school level)
    measures.ts               shared builders for multi-measure datasets (stepped, nominal, popup, layer)
  lib/                        contract (zod), GDAL, mapshaper, spreadsheets, keys, names, download
  terminology.ts              user-facing wording (he/en/ru): levels by kind, datasets by id
tests/                        vitest (global setup runs the pipeline)
viewer/                       the map page (Vite + TypeScript + MapLibre); see docs/viewer.md
  src/                        modules; config.ts holds the basemap config
  tests/                      vitest unit tests (no browser)
  e2e/                        Playwright smoke test
data/raw/<source>/            raw downloads (partly committed, see below)
dist/data/                    pipeline output (committed)
dist/site/                    viewer build: the deployable folder (not committed)
```

## Viewer

```sh
npm run dev            # edit viewer/src, reloads live
npm run build:viewer   # → dist/site/
```

**Deployable folder: `dist/site/`.** It is self-contained: `index.html`, `assets/` (hashed JS/CSS and the MapLibre
worker) and `data/` (a copy of `dist/data` without the JSON Schema). Every URL in it is relative (`base: './'`), so
the same folder works at any path and inside an iframe.

### Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main` (and by hand from the Actions tab). It runs `npm ci && npm
run build` on Node 24 and publishes `dist/site` with `actions/upload-pages-artifact` + `actions/deploy-pages`. The repo
is a project site, so it is served at **https://anatoly.dev/israeli-gis/** under the custom domain of the user site;
this repo has no `CNAME` of its own.

One-time setup: Settings → Pages → Build and deployment → Source = **GitHub Actions**.

`npm run build` includes `build:data`, so CI rebuilds `dist/data` from the committed `data/raw` (offline, every file
sha256-checked) and deploys that build rather than the committed copy. Raw files the pipeline reads must be committed,
or the deploy fails.

The viewer build never writes into `dist/data`: Vite's output directory is `dist/site`, `publicDir` is off, and a small
plugin copies `dist/data` into `dist/site/data` after bundling (and serves it at `/data/` in dev).

`dist/site` is **not committed**. It is rebuilt from committed inputs in about two seconds with no GDAL step (`npm ci &&
npm run build:viewer`), while committing it would add a new set of hashed bundle files on every change. `dist/data`
stays committed because it is the expensive, reviewed part.

### Embedding

```html
<iframe
  src="https://anatoly.dev/israeli-gis/?embed=1&lang=he&layer=ses-2021-localities&hl=1,2,3#8/32.1/34.9"
  title="מדד חברתי-כלכלי 2021"
  width="100%" height="640" style="border:0" loading="lazy"
  allow="fullscreen"></iframe>
```

Keep the trailing slash in `/israeli-gis/`: the page loads `data/` and `assets/` relative to its own URL, so
`/israeli-gis?embed=1` would look for them at the site root.

| Param | Values | Default |
|---|---|---|
| `lang` | `he`, `en`, `ru` | browser language if it is one of these, else `he` |
| `layer` | a layer `id` from `layers.json` | the first layer |
| `hl` | highlighted classes: a range `4-7`, a list `1,5,9`, or both `1-3,9,na`. Keys are cluster values, `s0…sN` for stepped bins, `na` for "not calculated". The page writes runs as ranges. | none |
| `f` | a feature code to select and open | none |
| `embed` | `1`: compact layout for a 600–700 px iframe, map gestures need two fingers / Ctrl+scroll, "Open full map" link (to `fullMapBase` in `viewer/src/config.ts`, the blog's full-page map) | off |
| `#zoom/lat/lon` | map position (hash) | fit the layer |

The page keeps the URL in sync as you use it, so any view can be shared by copying the address bar.

## Adding a dataset

A dataset is joined to one of the existing geometry levels by code (a choropleth), or ships its own points.

1. Put the raw files under `data/raw/<source>/`.
2. Create `pipeline/datasets/<id>/index.ts` that default-exports a `DatasetModule` (`pipeline/lib/dataset.ts`):
   - `rawFiles`: `{ path, url, sha256, headers? }` for each input, so `npm run download` can fetch and verify it.
     Get the hash with `shasum -a 256`.
   - `build({ geometryCodes })` returns three things:
     - `files`: `{ "datasets/<id>/<level>.json": { [code]: { field: number } } }`
     - `layers`: a `ChoroplethLayer` per level, or a `PointsLayer`. Use a `categorical` or `stepped` classification.
       Build each title with `layerTitle(DATASET_TITLE, level)` from `pipeline/terminology.ts`; don't write level
       names yourself. A CBS cluster index can use `clusterLayer()` from `pipeline/datasets/cluster-index.ts`.
   - Put its wording in `DATASET_TERMS` in `pipeline/terminology.ts`: title, attribution, legend note, "not
     calculated" texts per level kind, and popup labels. Pick a palette from `pipeline/lib/palettes.ts`.
     - `joins`: one `join()` per level, so the build reports and enforces matches
3. Register it in `pipeline/datasets/index.ts`.
4. Add tests that pin the join counts and a few values copied by hand from the raw rows. Then run
   `npm run build:data && npm test` and commit the code, the raw files and `dist/data` together.

The viewer needs no change: it lists, colours, labels and searches whatever `layers.json` contains.

Pick the level by key:

| Data keyed by | Level |
|---|---|
| locality code | `localities-2011` (every locality) or `rc-localities-2011` |
| authority code (own code, or `5500 + n` for RCs) | `local-authorities-2011` |
| statistical area, 2011 division (`locality*10000 + sa`) | `statistical-areas-2011` |
| statistical area, 2022 division (`locality*10000 + sa`, same composition, different areas) | `statistical-areas-2022` |

Never use a bare RC number as a key. All keys are strings. If a dataset needs something the contract can't express,
extend the schemas in `pipeline/lib/contract.ts` and `docs/data-contract.md` together.

## Changing wording

Level names, official CBS terms, feature types and feature labels all live in `pipeline/terminology.ts`, keyed by level
kind (`local-authorities`, `localities`, `rc-localities`, `statistical-areas`).

1. Edit `pipeline/terminology.ts`.
2. Run `npm run build:data`, then `npm run build:viewer`.
3. Commit `dist/data`, after updating the pinned strings in `tests/terminology.test.ts`.

A new vintage (`statistical-areas-2022`) picks up its kind's wording automatically; `{vintage}` in an official term
becomes the level's year ("CBS statistical areas, 2022 division"). A new level kind needs an entry in
`LevelKind` (`pipeline/lib/contract.ts`) and in `TERMINOLOGY`. The build fails if any level's kind has no complete
he/en/ru entry. See "Level wording" in `docs/data-contract.md`.

## Raw data

`.gitignore` keeps only what the pipeline reads, about 22 MB. Every file is pinned by sha256 in its `RawFile` entry.

| Committed | Why |
|---|---|
| `cbs-statistical-areas-2011-demography-2020/*.gdb.zip` | The four `-2011` levels. Only the zip is committed; gdal3.js reads it via `/vsizip/`. |
| `cbs-statistical-areas-2022/ezorim_statistiim_2022.gdb.zip` | `statistical-areas-2022` (8.7 MB, already compressed). The 2011↔2022 key and the readme stay local. |
| `cbs-socioeconomic-2021/24_24_230t{1,3,4}.xlsx` | Index tables A1, B and C |
| `cbs-socioeconomic-2021/streets_neighborhoods_sa2011.xlsx` | Neighborhood and main-street names per statistical area (Hebrew) → `neighborhoods_he`, `streets_he` |
| `cbs-peripherality-2020/24_22_420t{1,2}.xlsx` | Peripherality index 2020: table 1 (255 authorities), table 2 (1,213 localities) |
| `cbs-localities-file/bycode2024.xlsx`, `bycode2022.xlsx` | Population 2024, and the 2022 base for growth |
| `cbs-census-2022/mifkad-2022.xlsx` | Census 2022, selected data by locality and statistical area (60 columns); also the SA-2022 population |
| `cbs-census-2022/sa_not_published_census2022.xlsx` | CBS's list of SA-2022 areas without published census data; the build checks every SA without data against it. The rest of that folder stays ignored. |
| `datagov-moe-mosdot-edu/mosdot_edu.csv.gz` | Ministry of Education institutions, gzipped (0.95 MB; 10.9 MB as downloaded, the plain CSV stays local; data.gov.il terms of use, source must be named); the pipeline reads the 6,641 schools |
| `cbs-localities-file/bycode2021.xlsx` | Locality → municipal status, he/en locality names, he regional-council names |
| `wikidata-p3466/p3466_items.csv`, `regional_councils_Q1022469.csv` | Russian names and English gap-fillers (SPARQL snapshots, 2026-10-24) |
| `datagov-municipal-authorities/localauthorities.csv` | Tests cross-check the `5500+n` authority codes against it |

Wikidata changes over time, so a re-download of the SPARQL snapshots will usually not match the pinned hash.
`download` then saves the new copy as `*.unverified` next to the old one, for review. Adopt it by replacing the file
and updating its `sha256`.

Ignored:
- unzipped `.gdb/` directories and all PDFs
- the SA 2011→2022 key and the SA-2022 readme
- the publication-1955 folder
- the OSM dump (ODbL)
- `24_24_230t2.xlsx`, `24_24_230t5.xlsx`, `index2021.xlsx`
- the data.gov.il multilingual list
- the superseded `p3466_labels.csv`
- spike-2 downloads not used yet (`docs/data-sources-2.md` §9): peripherality t3/t4 and publication 1917, newer
  localities files, census 2022, SA-2022 population, MoE school lists; later steps un-ignore what they read

## Why `dist/data` is committed

It is the reviewed form of the data: building the viewer (`npm run dev`, `build:viewer`) needs no 20-second
GDAL/WebAssembly build, and the Pages deploy rebuilds it from raw only as a check-and-publish step. The output is small (about 8.3 MB raw, 1.8 MB gzipped; the five geometry levels are 1.5 MB of that gzipped) and
deterministic. So a diff in `dist/data` means the data actually changed, and code review can see it. The tests enforce
that the committed copy matches a fresh build.

## Licences and attribution

- **CBS** (index tables, SA layer, localities file): the CBS open licence
  (https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx) allows copying, redistribution and derivative works with
  attribution. The required citation and "as is" notice are in `dist/data/layers.json` (`sources[].citation`,
  `layers[].source.citation`). It reads: *הלשכה המרכזית לסטטיסטיקה (הלמ"ס), [product], (נשלף 24.10.2026), זמין ב: [link],
  הועתק והופץ כמות שהוא בהתאם לרישיון השימוש של הלמ"ס*. This applies to the raw CBS files in `data/raw/` as well.
- **Wikidata**: CC0.
- **data.gov.il**: "Other (Open)". This is reference only and not shipped in `dist/`.
- **Basemap** (viewer): OpenFreeMap © OpenMapTiles © OpenStreetMap contributors.
