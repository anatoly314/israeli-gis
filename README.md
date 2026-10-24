# israeli-gis

The data pipeline for an embeddable, multi-layer web map of Israel. It turns raw CBS spreadsheets and the CBS
statistical-areas geodatabase into small TopoJSON boundaries, per-dataset value files, and a `layers.json` manifest
that the viewer reads.

Layer 1 is the CBS socio-economic index 2021, coloured by cluster (1–10) at three levels: local authorities,
localities in regional councils, and statistical areas. A fourth geometry level, all localities, is there for future
datasets keyed by locality code.

- `docs/data-sources.md`: research notes covering where every file comes from, its schemas, join keys, and licensing.
- `docs/data-contract.md`: the spec for `dist/data/` that the viewer codes against.

## Setup

Node.js ≥ 20.

```sh
npm install
```

GDAL runs as WebAssembly through [`gdal3.js`](https://github.com/bugra9/gdal3.js), using the OpenFileGDB driver plus
GEOS for validity checks. No system packages are needed. If gdal3.js fails to load, the pipeline falls back to
`ogr2ogr` on `PATH` (`brew install gdal`). If neither works, it stops with a message saying so.

npm 12 blocks install scripts by default, and you can leave them blocked. The blocked ones belong to optional native
add-ons pulled in by mapshaper's GeoPackage and msgpack support (`better-sqlite3`, `msgpackr-extract`), which this
pipeline never uses. Spreadsheets are read with `read-excel-file`, CSV with `csv-parse`.

## Usage

```sh
npm run download   # fetch missing raw files into data/raw/ and verify every file's sha256
npm run build      # data/raw → dist/data (offline; ~20 s)
npm test           # type-check, then rebuild into a temp dir and test that build (~40 s)
```

`build` writes to a staging directory and checks everything there. If all checks pass, it swaps the staging
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
re-run `npm run build` after changing code or raw data.

## Layout

```
pipeline/
  build.ts                    CLI: build into staging, swap into dist/data, print the report
  run.ts                      buildAll(outDir): raw → outDir with every check
  download.ts                 fetches and verifies every RawFile declared by boundaries and datasets
  boundaries/                 SA-2011 layer → four geometry levels, placeholder detection, names
  datasets/
    index.ts                  dataset registry
    ses-2021/                 socio-economic index 2021: parse tables → values + layer definitions
  lib/                        contract (zod), GDAL, mapshaper, spreadsheets, keys, names, download
tests/                        vitest (global setup runs the pipeline)
data/raw/<source>/            raw downloads (partly committed, see below)
dist/data/                    build output (committed)
```

## Adding a dataset

A dataset is joined to one of the existing geometry levels by code (a choropleth), or ships its own points.

1. Put the raw files under `data/raw/<source>/`.
2. Create `pipeline/datasets/<id>/index.ts` that default-exports a `DatasetModule` (`pipeline/lib/dataset.ts`):
   - `rawFiles`: `{ path, url, sha256, headers? }` for each input, so `npm run download` can fetch and verify it.
     Get the hash with `shasum -a 256`.
   - `build({ geometryCodes })` returns three things:
     - `files`: `{ "datasets/<id>/<level>.json": { [code]: { field: number } } }`
     - `layers`: a `ChoroplethLayer` per level, or a `PointsLayer`. Use a `categorical` or `stepped` classification.
     - `joins`: one `join()` per level, so the build reports and enforces matches
3. Register it in `pipeline/datasets/index.ts`.
4. Add tests that pin the join counts and a few values copied by hand from the raw rows. Then run
   `npm run build && npm test` and commit the code, the raw files and `dist/data` together.

Pick the level by key:

| Data keyed by | Level |
|---|---|
| locality code | `localities-2011` (every locality) or `rc-localities-2011` |
| authority code (own code, or `5500 + n` for RCs) | `local-authorities-2011` |
| statistical area (`locality*10000 + sa`) | `statistical-areas-2011` |

Never use a bare RC number as a key. All keys are strings. If a dataset needs something the contract can't express,
extend the schemas in `pipeline/lib/contract.ts` and `docs/data-contract.md` together.

## Raw data

`.gitignore` keeps only what the pipeline reads, about 9.8 MB. Every file is pinned by sha256 in its `RawFile` entry.

| Committed | Why |
|---|---|
| `cbs-statistical-areas-2011-demography-2020/*.gdb.zip` | All geometry. Only the zip is committed; gdal3.js reads it via `/vsizip/`. |
| `cbs-socioeconomic-2021/24_24_230t{1,3,4}.xlsx` | Index tables A1, B and C |
| `cbs-localities-file/bycode2021.xlsx` | Locality → municipal status, he/en locality names, he regional-council names |
| `wikidata-p3466/p3466_items.csv`, `regional_councils_Q1022469.csv` | Russian names and English gap-fillers (SPARQL snapshots, 2026-10-24) |
| `datagov-municipal-authorities/localauthorities.csv` | Tests cross-check the `5500+n` authority codes against it |

Wikidata changes over time, so a re-download of the SPARQL snapshots will usually not match the pinned hash.
`download` then saves the new copy as `*.unverified` next to the old one, for review. Adopt it by replacing the file
and updating its `sha256`.

Ignored:
- unzipped `.gdb/` directories and all PDFs
- the SA-2022 layer, which is for a future index edition
- the publication-1955 folder
- the OSM dump (ODbL)
- `24_24_230t2.xlsx`, `24_24_230t5.xlsx`, `streets_neighborhoods_sa2011.xlsx`, `index2021.xlsx`
- the data.gov.il multilingual list
- the superseded `p3466_labels.csv`

## Why `dist/data` is committed

The Hugo site (anatoly.dev) embeds the viewer, and updating it shouldn't require installing this toolchain or running a
20-second GDAL/WebAssembly build. The output is small (about 3.7 MB raw, 1 MB gzipped across four levels) and
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
