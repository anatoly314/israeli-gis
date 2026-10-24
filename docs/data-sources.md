# Data sources: CBS socio-economic index (spike report)

Research date: 2026-10-24. Every number below comes from files downloaded into `data/raw/` and inspected with scratch scripts that are not committed. Lines marked **(unverified)** are inferred or come from secondary sources.

## TL;DR

- **No newer edition.** The latest CBS socio-economic index is still **2021**. It was released 2024-07-29 (media release 230/2024), and the full publication (No. 1955) followed on 2025-01-08. CBS's own release-forecast list runs to Dec 2027 and contains no new index.
- **The plan's geometry is wrong.** The 2021 index is **not** built on the 2022 statistical areas. CBS says so explicitly: *"The present study is based on the Layer of Statistical Areas 2011"*. Joining it to SA-2022 would silently mis-assign roughly 450 areas (details in §6).
- **The "<2,000 residents are missing" assumption is wrong.** The cut-off is **120 residents**. Table B covers 996 of 1,014 regional-council localities, and 915 of those 996 have fewer than 2,000 residents. The 2,000 threshold applies only to the publication's *appendix* table, which adds the 14 variables.
- **One CBS geometry file covers all three levels:** `statisticalareas_2020_demography.gdb`, which is the SA-2011 layer. Join results: L3 1641/1641, L2 996/996, L1 255/255 (built by dissolving). There are no unmatched codes on the table side at any level.
- **Scripted download works.** cbs.gov.il serves files to plain `curl`, but its HTML pages are JS shells, so use the SharePoint REST API to discover files. data.gov.il *file* downloads return CloudFront 403 to curl's default User-Agent and work with a browser User-Agent.
- **mapshaper cannot read FileGDB.** A GDAL step (`ogr2ogr`) is needed. Reprojecting through the `.prj` alone is **off by about 78 m**, because the ESRI WKT carries no datum shift. Reproject with PROJ/GDAL, or give mapshaper an explicit `+towgs84`.
- **Russian names:** Wikidata P3466 covers all 255 authorities, all 81 SA parent cities, and only **50%** of the 996 regional-council localities.

---

## 0. Index editions

| Reference year | Media release | Full publication | SA vintage used |
|---|---|---|---|
| 2019 | 375/2022, 2022-11-23 | No. 1903, 2023-06-03 | SA 2011 **(unverified for 2019; inferred from the 2021 text "same layer, updated yearly")** |
| **2021** | **230/2024, 2024-07-29** | **No. 1955, 2025-01-08** | **SA 2011** (verified, intro_e.pdf §2.3) |
| 2023 | not published | not published | probably SA 2022 when it comes out **(unverified)** |

**How I checked that nothing newer exists** (all queries run 2026-10-24):
- SharePoint REST query on the CBS media-release list (`/he/mediarelease/_api/web/lists(guid'43331f14-92e1-416c-b993-9293d3f10bb2')/items`), filtering titles on `אפיון`, `חברתית-כלכלית` and `מדד חברתי`. The list is current: its newest item is dated 2026-10-20. The newest index release in it is 230/2024.
- The same kind of query on the publications list (`/he/publications/_api/web/lists/getbytitle('דפים')`). The newest index publication is No. 1955 (2025-01-08).
- The CBS release-forecast list "למס - תחזיות פרסום" (`/he/_api/web/lists(guid'42a5add2-c632-4ed9-84a5-36dc42c1be73')`). It holds entries up to 2027-12-22, and none of them is a socio-economic index edition. The last matching entry is the 2021 index (2024-07-28).
- Web searches in Hebrew and English for a "2023" index found nothing.

**Expected timing (not announced):** CBS publishes the index every two years. The lag has been about three years (2019 data → Nov 2022, 2021 data → Jul 2024), so 2023 data would be expected around 2026. It is late and does not appear in the forecast through 2027. The FAQ (`24_24_230nispach.pdf`, Q10) says CBS publishes every two years and that delays come from late administrative data. Plan for the 2021 edition. Keep the pipeline vintage-aware so a 2023 edition on SA-2022 can be added later. The SA-2022 layer and the 2011↔2022 conversion keys are already downloaded for that.

## 1. Download URLs

### 2021 index: media release 230/2024 (primary; identical values to the full publication)
Page: https://www.cbs.gov.il/he/mediarelease/pages/2024/אפיון-יחידות-גאוגרפיות-וסיווגן-לפי-הרמה-החברתית-כלכלית-של-האוכלוסייה-בשנת-2021.aspx
English page: https://www.cbs.gov.il/en/mediarelease/Pages/2024/Characterization-and-Classification-of-Geographical-Units-by-the-Socio-Economic-Level-of-the-Population-2021.aspx

| Level | File | URL |
|---|---|---|
| L1 local authorities, ascending by index | `24_24_230t1.xlsx` | https://www.cbs.gov.il/he/mediarelease/DocLib/2024/230/24_24_230t1.xlsx |
| L1 alphabetical, with the 14 variables | `24_24_230t2.xlsx` | https://www.cbs.gov.il/he/mediarelease/DocLib/2024/230/24_24_230t2.xlsx |
| L2 localities within regional councils | `24_24_230t3.xlsx` | https://www.cbs.gov.il/he/mediarelease/DocLib/2024/230/24_24_230t3.xlsx |
| L3 statistical areas | `24_24_230t4.xlsx` | https://www.cbs.gov.il/he/mediarelease/DocLib/2024/230/24_24_230t4.xlsx |
| Cluster distribution chart data | `24_24_230t5.xlsx` | …/DocLib/2024/230/24_24_230t5.xlsx |
| Release text / FAQ | `24_24_230b.pdf`, `24_24_230nispach.pdf` | …/DocLib/2024/230/ |
| SA-2011 streets and neighbourhoods key (linked from the release) | `streets_neighborhoods_sa2011.xlsx` | https://www.cbs.gov.il/he/publications/LochutTlushim/2021/רחובות%20עיקריים%20ושכונות%20לאס%202011.xlsx |

### 2021 index: full publication No. 1955 (methodology plus variables per SA)
Folder: `https://www.cbs.gov.il/he/publications/DocLib/2025/1955/`. Key files: `intro_e.pdf` (methodology), `t01.xlsx` (= t2), `t02.xlsx` (= t1), `t09.xlsx` (= t3), `t13.xlsx` (= t4), `t12.xlsx` (SAs **with the 14 variables**), `t10.xlsx` (18 RC localities without an index), and `appendix.xlsx` (81 RC localities ≥2,000 residents, with variables). I verified that t1↔t02, t3↔t09 and t4↔t13 are row-for-row identical.

### Geometry
| Purpose | File | URL |
|---|---|---|
| **SA 2011 layer (matches the 2021 index)**, demography 2020, cat. 50502י | `statisticalareas_2020_demography.gdb.zip` | https://www.cbs.gov.il/he/Documents/statisticalareas_2020_demography.gdb.zip (linked from https://www.cbs.gov.il/he/Pages/geo-layers.aspx) |
| SA 2022 layer (for a future index; **do not use for 2021**) | `ezorim_statistiim_2022.gdb.zip` | https://www.cbs.gov.il/he/mediarelease/DocLib/2022/026/ezorim_statistiim_2022.gdb.zip |
| SA 2011→2022 conversion key | `key_sa2011_to_sa2022.xlsx` | https://www.cbs.gov.il/he/mediarelease/DocLib/2022/026/מפתח%20מעבר%20אס%202011%20לאס%202022.xlsx |
| Locality → authority mapping, EN names | `bycode2021.xlsx` | https://www.cbs.gov.il/he/publications/DocLib/2019/ishuvim/bycode2021.xlsx |

CBS publishes **no separate local-authority boundary layer and no locality-points layer**. Both can be derived from the SA-2011 layer (§6). The geo-layers page the user pointed to lists only the SA-2011 + demography layers (2017–2020). The SA-2022 layer sits on the 2022 media-release page.

### Names
| Source | URL |
|---|---|
| Wikidata P3466 dump (SPARQL) | `SELECT ?item ?code ?he ?en ?ru WHERE { ?item wdt:P3466 ?code … }` at https://query.wikidata.org/sparql |
| data.gov.il "יישובים ומדינות (עברית, אנגלית, ערבית ורוסית)" | https://data.gov.il/dataset/7a6d0673-920c-470a-ad90-600d4ce3adcb/resource/e9701dcb-9f1c-43bb-bd44-eb380ade542f/download/_-23.csv |
| data.gov.il municipal authorities list | https://data.gov.il/dataset/009348a4-40d5-4bbe-92ab-ac19e4460fce/resource/c4916937-f5d3-4295-a22e-88a1af5cde6a/download/localauthorities.csv |

## 2. Scripted download

| Host | Plain `curl` (no UA) | Notes |
|---|---|---|
| `www.cbs.gov.il` **files** (`/DocLib/…`, `/Documents/…`) | **200**, correct MIME | Works without any special headers. No challenge seen. |
| `www.cbs.gov.il` **HTML pages** | 200, but the content is empty | SharePoint + AngularJS shell. File links are rendered client-side, so scraping HTML finds nothing. The page loads an F5 bot-defence script (`/TSbd/…`) and sets a `TS01…` cookie, but neither blocked anything. A browser UA changes nothing. |
| `www.cbs.gov.il/…/_api/…` (SharePoint REST) | **200 JSON** with `Accept: application/json;odata=nometadata` | **This is the workaround for discovery.** `GetFolderByServerRelativeUrl('/he/mediarelease/DocLib/2024/230')/Files` lists every attachment with size and title. List-item queries find releases by title. `/_api/search/query` returns a 404 HTML page (not exposed). |
| `data.gov.il` CKAN API (`/api/3/action/…`) | 200 | Works. |
| `data.gov.il/dataset/…/download/…` | **403 CloudFront "Request blocked"** | **200 with a browser `User-Agent`** (e.g. `Mozilla/5.0 … Chrome/130`). No other headers needed. One `e.data.gov.il` resource (PIA localities) redirected to a Google sign-in page. It is not needed. |
| `query.wikidata.org`, `overpass-api.de`, `taginfo.openstreetmap.org` | 200 | Send a descriptive UA, per Wikimedia policy. |

No bot protection had to be bypassed beyond setting a normal UA on data.gov.il.

## 3. File inventory (`data/raw/`)

| Path | Bytes | Notes |
|---|---|---|
| `cbs-socioeconomic-2021/24_24_230t1.xlsx` | 100,116 | L1 |
| `cbs-socioeconomic-2021/24_24_230t2.xlsx` | 236,977 | L1 + variables |
| `cbs-socioeconomic-2021/24_24_230t3.xlsx` | 211,418 | L2 |
| `cbs-socioeconomic-2021/24_24_230t4.xlsx` | 227,167 | L3 |
| `cbs-socioeconomic-2021/24_24_230t5.xlsx` | 67,419 | chart data |
| `cbs-socioeconomic-2021/24_24_230b.pdf`, `…nispach.pdf` | 296,768 / 134,416 | release text, FAQ |
| `cbs-socioeconomic-2021/streets_neighborhoods_sa2011.xlsx` | 225,840 | SA-2011 → main streets/neighbourhoods (Hebrew only), 1,917 rows. **Used** (committed): becomes `neighborhoods_he` / `streets_he` on `statistical-areas-2011`; 1917/1917 SA polygons match. |
| `cbs-socioeconomic-2021-publication-1955/t01…t14.xlsx, appendix.xlsx` | 25 KB–998 KB | full publication tables |
| `cbs-socioeconomic-2021-publication-1955/intro_e.pdf`, `intro_h.pdf`, `symbol_*.pdf`, `preface_e.pdf` | | methodology |
| `cbs-socioeconomic-2021-publication-1955/1.zip, 2.zip, 3.zip` | 3.6 / 1.9 / 5.5 MB | PDF charts and city maps only. **Not needed; suggest not committing.** |
| `cbs-statistical-areas-2011-demography-2020/statisticalareas_2020_demography.gdb.zip` (+ unzipped `.gdb`, 15 MB) | 8,730,587 | **main geometry** |
| `cbs-statistical-areas-2022/ezorim_statistiim_2022.gdb.zip` (+ `.gdb`), `key_sa2011_to_sa2022.xlsx`, `readme_sa2022.pdf` | 8,745,560 / 230,119 / 133,054 | for future editions |
| `cbs-localities-file/bycode2021.xlsx`, `index2021.xlsx`, `var3.pdf` | 299,881 / 67,737 / 69,822 | locality → municipal status |
| `datagov-localities-multilingual/localities_he_en_ar_ru.csv` | 120,890 | UTF-8 with BOM |
| `datagov-municipal-authorities/localauthorities.csv` | 26,308 | UTF-8 with BOM |
| `wikidata-p3466/p3466_labels.csv`, `regional_councils_Q1022469.csv` | 183,306 / 9,994 | SPARQL exports, 2026-10-24 |
| `osm-places-overpass/il_place_nodes_2026-10-24.json` | 622,287 | **ODbL.** Used only for the coverage estimate; don't ship it. |

The total is about 64 MB including the unzipped `.gdb` folders. Commit either the zips or the unzipped folders, not both.

## 4. Excel schemas

Shared conventions for all CBS tables:
- One sheet per file, with a Hebrew title block (rows 1–5).
- Bilingual headers on two rows: Hebrew first, then English.
- Footnotes at the bottom, using merged cells.
- `..` (string) means "index not calculated". It appears only in the 2019 cluster column.
- Codes are **numeric cells**, which openpyxl reads as `float` for code columns and `int` for some others. Cast with `int()`. There are no leading zeros in the cells.
- Index values are full-precision floats. Round them for display only.
- Robust parsing rule: keep a row iff the code column is numeric. Ignore header and footnote rows.

### L1: `24_24_230t1.xlsx`, sheet `לוח א1 table A1`
- Header rows 5–6. Data rows 7–261 (**255 rows**). Footnotes rows 263–266.
- Columns: `מעמד מוניציפלי / MUNICIPAL STATUS`, `סמל יישוב / CODE OF LOCALITY`, `שם רשות מקומית` (Hebrew name), `מחוז / DISTRICT` (code 1–7), `אוכלוסיית המדד 2021 / INDEX POPULATION 2021`, `ערך מדד 2021 / INDEX VALUE 2021`, `דירוג 2021 / RANK 2021` (1–255), `אשכול 2021 / CLUSTER 2021` (1–10), `דירוג 2019`, `אשכול 2019`, `הפרש / DIFFERENCE`, `NAME OF LOCAL AUTHORITY` (English, UPPERCASE).
- **Municipal status:** `0` = municipality (79), `99` = local council (122), and anything else = **regional council number** (54 RCs, codes 1–78).
- **`CODE OF LOCALITY` is empty for all 54 regional councils.** Their only identifier is the status number.
- `t2` has the same identity columns plus 14 variables × (value, standardized value, rank). Header rows 4–8, two summary rows ("average", "nationwide value") at rows 9–10, data rows 11–265.

### L2: `24_24_230t3.xlsx`, sheet `לוח ב table B`
- Header rows 9–10. Data rows 11–1006 (**996 rows**). Footnotes from row 1008.
- Columns: `מעמד מוניציפלי` (RC number), `שם מועצה אזורית`, `NAME OF REGIONAL COUNCIL`, RC `אשכול 2021`, RC `אשכול 2019`, `סמל יישוב / CODE OF LOCALITY`, `שם יישוב`, `NAME OF LOCALITY` (Title Case), `צורת יישוב / TYPE OF LOCALITY` (code), `אוכלוסיית המדד 2021`, `ערך מדד 2021`, `דירוג 2021` (1–996), `אשכול 2021`, `אשכול 2019`.
- No duplicate locality codes. Index population ranges from 128 up. **915 of the 996 rows have <2,000 index population.**
- 3 rows have `..` in cluster 2019 (new localities).

### L3: `24_24_230t4.xlsx`, sheet `לוח ג table C`
- Header rows 9–10. Data rows 11–1651 (**1,641 rows**). Footnotes rows 1653–1657.
- Columns: `מעמד מוניציפלי` (0 or 99), `סמל יישוב`, `שם יישוב`, `NAME OF LOCALITY`, locality `אשכול 2021`, locality `אשכול 2019`, `סמל אזור סטטיסטי / CODE OF STATISTICAL AREA`, `אוכלוסיית המדד 2021`, `ערך מדד 2021`, `דירוג 2021` (1–1641), `אשכול 2021`, `אשכול 2019`.
- **The SA code is the within-locality number only** (1–2911, e.g. Tel Aviv 437). The globally unique key is **`locality_code * 10000 + sa_code`** (Tel Aviv SA 437 → `50000437`). This composition is verified against the geometry (§6) and against the CBS streets file column `סמל א"ס מלא`.
- 81 localities. 8 rows have `..` in cluster 2019.
- `t12.xlsx` (publication) has the same keys plus 14 variables. Its header is at rows 6–7, followed by a nationwide row.

### Supporting: `bycode2021.xlsx`, sheet `קובץ יישובים 2021`
- Header row 1. 1,483 data rows.
- Relevant columns: `סמל יישוב` (int), `שם יישוב`, `תעתיק` (UPPERCASE English), `שם יישוב באנגלית` (Title Case English), `סמל מעמד מונציפאלי` (0 / 99 / RC number / empty), `שם מעמד מונציפאלי`.
- Population cells are `''` (empty string) for non-residential places.

## 5. Geometry schemas

### SA 2011 layer: `statisticalareas_2020_demography.gdb` (Esri File Geodatabase)
- Layer `statisticalareas_2020_demography`, MultiPolygon, **3,187 features**.
- **EPSG:2039** (Israel 1993 / Israeli TM Grid). Bounds 130170, 378140 – 284068, 804530.
- **Text encoding: UTF-8.** GDAL reports this; FileGDB has no `.dbf`/`.cpg`. Hebrew round-trips correctly through GDAL → shapefile (`.cpg` = `UTF-8`) → mapshaper.
- Fields:
  - `SEMEL_YISHUV` int16: locality code.
  - `STAT11` int32: SA number within the locality. It is **null** for 104 non-locality polygons.
  - `YISHUV_STAT11` int32: the unique key, equal to `SEMEL_YISHUV*10000+STAT11` when STAT11 is set, and equal to `SEMEL_YISHUV` otherwise.
  - `SHEM_YISHUV` (Hebrew), `SHEM_YISHUV_ENGLISH` (UPPERCASE; `no name` for 52 non-residential places).
  - `Stat11_Unite`, `Stat11_Ref`, `Main_Function_Code`/`Main_Function_Txt` (residential / industry / institutional / open / public).
  - `Religion_yishuv_*`.
  - `Pop_Total` plus age bands for 2020.
  - `Shape_Length`, `Shape_Area`.
- **Polygon taxonomy** (verified by area and code):

| Code range | Meaning | Features | km² |
|---|---|---|---|
| locality with SAs (117 localities) | `STAT11` = SA number | 1,917 | — |
| locality without SAs | single polygon, `STAT11 = 1` | 1,166 | — |
| municipalities (status 0) | | 1,766 | 2,085 |
| local councils (status 99) | | 237 | 1,081 |
| RC localities | | 1,074 | 1,035 |
| **`55xx`** | **open land of a regional council; `55xx − 5500 = RC number`** (e.g. 5501 = HaGalil HaElyon) | 48 | 16,947 |
| `99xx` | "שטח ללא שיפוט" (no jurisdiction) | 56 | 980 |
| no municipal status | e.g. Ben-Gurion Airport, Mikve Israel | 6 | 17 |

  The six West-Bank RCs (72 Shomron, 73 Matte Binyamin, 74 Megillot, 75 Arvot HaYarden, 76 Gush Ezyon, 78 Har Hevron) have **no 55xx open-land polygon**. Only their settlement polygons exist.
- Raw size: 8.7 MB zipped, 15 MB unzipped.
- Simplification trial: projected to WGS84, `-simplify 5% keep-shapes`, written as TopoJSON (q=1e5). Results: SA layer 1.43 MB (**380 KB gzipped**); localities dissolved 0.82 MB (**251 KB gzipped**). That is the whole country with all 3,187 polygons.

### SA 2022 layer: `ezorim_statistiim_2022.gdb`
- Layer `statistical_areas_2022`, MultiPolygon, 3,857 features, EPSG:2039, UTF-8.
- Fields: `SEMEL_YISHUV`, `SHEM_YISHUV`, `SHEM_YISHUV_ENGLISH`, `STAT_2022`, `YISHUV_STAT_2022`, `ROVA`, `TAT_ROVA`, `COD_TIFKUD`, `Shape_*`.

## 6. Join sanity checks

| Level | Table rows | Matched to geometry | Unmatched (table) | Geometry without index |
|---|---|---|---|---|
| **L3** SA (`t4` key `loc*10000+sa` ↔ `YISHUV_STAT11`, SA-2011) | 1,641 | **1,641 (100%)** | 0 | 112 of the 1,753 SA polygons in those 81 cities. 110 have <120 residents or are non-residential (58 industry, 28 open, 21 public, 4 institutional). The other two are Rishon LeZion SA 111 (308 residents, public compound) and Ramat Gan SA 415 (284, institutional). Both fit "<120 after deducting institution residents". |
| **L2** RC locality (`t3` locality code ↔ `SEMEL_YISHUV`) | 996 | **996 (100%)** | 0 | All 996 are single polygons. 78 RC localities in the layer have no index: t10 lists 18 "not calculated", and the rest are non-residential places or have <120 residents. |
| **L1** muni/LC (`t1` locality code ↔ `SEMEL_YISHUV`) | 201 | **201 (100%)** | 0 | — |
| **L1** RC (`t1` status ↔ `55xx − 5500` and bycode2021 status of member localities) | 54 | **54 (100%)**: 48 with open land + 6 West-Bank RCs as settlement-only unions | 0 | 99xx no-jurisdiction areas belong to no authority |

Other findings from the joins:
- **SA-2022 would be wrong for this index.** 1,110 of the 1,641 index keys also exist as codes in SA-2022, so a join "works" for 67.6% of rows. But per CBS's 2011→2022 key, only **653** of the index SAs are type 1 "identical". The other 988 were renumbered (415), split (447), merged (8) or extended (75). About 450 of the colliding codes would therefore attach values to the wrong polygon. The user's caution was pointed at the wrong layer. SA-2022 is the one that mismatches. data.gov.il `statistical-area-2008` is actually the *base* of SA-2011 and differs from it only in East Jerusalem, per intro_e.pdf. Even so, it is not the file to use: the CBS SA-2011 gdb is the exact match. I did not download the 2008 layer.
- **The `<2,000` assumption is false** (see TL;DR). The real exclusions are: <120 residents (net of institutions), some institutional localities, places outside localities, and units with missing variables. The table holds 996/1,014 RC localities and 1,641 SAs. Only 81 of the 117 SA-divided cities appear, because CBS anchors population to SAs only in Jewish/mixed cities plus Nazareth and Rahat. Arab and Druze cities lack address data. **At L3, 36 cities (Umm al-Fahm, Shefa-'Amr, Tayibe, etc.) will have no SA data. The map must show them as "no data", not "low".**
- **RC code collision.** RC status numbers (1–78) collide with real locality codes. For example, 8 is HaGilboa RC and also locality 8. **Never mix RC numbers and locality codes in one key space.** Use the CBS/MoI convention `5500 + status` for RCs. The data.gov.il authorities list uses the same convention: `LocalAuthorityCode` 5565 = Al-Batof. It matches 201/201 municipality/LC locality codes.
- The SA layer is "SA 2011 boundaries, updated yearly for new construction; 2020 edition". The 2021 index used the 2021-year update, which is not published. All 1,641 codes match, so only small boundary edits are possible **(unverified)**.
- RC 40 is named `עמק לוד` in the index and `שדות דן` in the layer. The code is the same, so the join is unaffected. Some names differ only in hyphen spacing (`אל - בטוף` vs `אל-בטוף`). **Always join on codes, never on names.**

## 7. Names (he / en / ru)

**Hebrew and English (CBS):**

| Level | Hebrew | English |
|---|---|---|
| L1 | `t1` col C | `t1` col L (UPPERCASE) |
| L2 | `t3` cols G | `t3` col H (Title Case) |
| L2 RC name | `t3` col B | `t3` col C |
| L3 parent locality | `t4` col C | `t4` col D (Title Case) |

Better-cased English for every locality is in `bycode2021.xlsx` column `שם יישוב באנגלית`. SAs have **no names**. Label them "‹city› – SA ‹n›". Optionally add the main neighbourhoods from `streets_neighborhoods_sa2011.xlsx`, which has 1,917 rows and is Hebrew only. (Done: the pipeline ships them as `neighborhoods_he` and `streets_he`; see `docs/data-contract.md`.)

**Russian:**
- **Wikidata P3466 "Israeli CBS municipal ID"** is the only Russian source joinable by CBS code at scale. 1,340 items carry it.
- Codes are **strings**: 691 are zero-padded (`"0046"`), so normalize with `int(code)`. Regional councils use `"מא" + 2-digit status` (e.g. `מא07`). 10 codes map to 2+ items (e.g. 6000, 8900), so take the first item that has a label.

Coverage of our sets (ru label present):

| Set | Wikidata P3466 | data.gov.il multilingual (`name_in_russian`) | OSM `name:ru` (via the node's `wikidata` tag) | Wikidata ∪ data.gov |
|---|---|---|---|---|
| L1 municipalities+LCs (201) | 201 (100%) | 126 (63%) | 175 (87%) | 201 (100%) |
| L1 regional councils (54), via `מא##` | 54 (100%) | 0 (RCs absent) | — | 54 (100%) |
| L2 RC localities (996) | **497 (50%)** | 155 (16%) | 319 (32%) | **534 (54%)** |
| L3 parent cities (81) | 81 (100%) | 74 (91%) | 74 (91%) | 81 (100%) |

Quality notes:
- Wikidata labels sometimes carry a disambiguator, e.g. `Рейхан (мошав)`, `Далия (кибуц)`. Strip any trailing `(…)`.
- At least one Wikidata ru label is in Latin script: `Givat Brenner`. Validate with a Cyrillic regex.
- data.gov.il ru values are sometimes UPPERCASE (`ЯД МОРДЕХАЙ`) or have stray NBSP or stress marks.
- 41 of the 244 localities that have both sources disagree, mostly on hyphenation.
- **OSM is not joinable by code.** Only 81 objects carry `ref:IL:cbs`. It would need OSM → wikidata → P3466. Its `name:ru` is ODbL, and copying it into our dataset makes that dataset an ODbL derivative database.

Recommendation:
1. Use Wikidata (CC0) first, cleaned as described above.
2. Fall back to data.gov.il `name_in_russian`.
3. For the remaining ~460 RC localities, fall back to English, or to a rule-based Hebrew→Russian transliteration flagged as `ru_source: "translit"`.
4. Snapshot the SPARQL result into `data/raw/` (done) rather than querying at build time.

## 8. Licensing and attribution

**CBS.** Source: the open licence page "רישיון שימוש", https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx (read 2026-10-24).
- What it grants: a worldwide, royalty-free, perpetual, non-exclusive licence to **copy, distribute, make available, and create derivative works, commercial or not**.
- What it forbids:
  - knowingly distorting the data;
  - implying CBS endorsement;
  - re-identification or privacy harm.
- Logos are excluded.
- Required attribution, in this form: *"הלשכה המרכזית לסטטיסטיקה (הלמ"ס), [file/product name], [(retrieval date)], available at: [link], copied and distributed as is according to the CBS usage licence at [licence link]."*
- **Committing the raw CBS xlsx/gdb files to a public GitHub repo is permitted** under the "copy, distribute, make available" grant, provided attribution and the "as is" notice are given. Put them in `data/raw/README` or `NOTICE`.
- Facts and data themselves carry no copyright. The licence covers only selection and arrangement.

**data.gov.il.** The datasets used are marked "Other (Open)".
- The current terms page could not be fetched: `/terms` returns 404.
- An older FAQ quoted on the OSM talk-il list in 2012 requires naming the site, the dataset and its update date. It requires no special permission. **(unverified: the current text was not read.)**
- The multilingual dataset's own note says the sources "are not official" and are not the National Digital Agency's responsibility.

**Wikidata.** CC0. No attribution is required; a courtesy credit is fine.

**OSM (ODbL 1.0).** The rendered basemap is a "Produced Work". Show "© OpenStreetMap contributors" with a link to https://www.openstreetmap.org/copyright. If we extracted OSM tag values such as `name:ru` into our published dataset, that dataset would have to be ODbL (share-alike). This is another reason to prefer Wikidata.

**OpenFreeMap.** Source: https://openfreemap.org/ and /tos (read 2026-10-24).
- Free, with no API key and no request limits. Commercial use is allowed.
- Attribution is required. MapLibre shows it automatically from the TileJSON: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`. The OpenFreeMap part is optional, but the OpenMapTiles and OSM parts are required.
- No SLA; the service may be discontinued without notice. Requests go via Cloudflare. Integrators must be 18 or older.
- Embedding on third-party sites is fine; the age clause doesn't apply to viewers.

**Map attribution line (suggested):** `Data: CBS Israel (Socio-Economic Index 2021, SA 2011 layer) · Names: Wikidata (CC0) · Basemap: OpenFreeMap © OpenMapTiles © OpenStreetMap contributors`. Put the full CBS sentence on an "About / sources" page.

## 9. Tooling checks (mapshaper, OpenFreeMap)

**mapshaper.** Checked against Context7 `/mbloch/mapshaper` docs and mapshaper 0.7.98 installed in a scratch directory.
- **Input formats:** Shapefile, GeoJSON, TopoJSON, GeoPackage, FlatGeobuf, GeoParquet, KML, CSV, DBF. **There is no Esri FileGDB support**, so a GDAL step is required: `ogr2ogr -f GPKG out.gpkg in.gdb`. pyogrio/GDAL 3.12 reads the gdb fine.
- **`encoding=`:** "`-i encoding=` overrides any `.cpg` sidecar and auto-detection; if omitted, auto-detects, falling back to `.cpg`." Hebrew survived GDAL → shapefile (`.cpg`=UTF-8) → mapshaper → TopoJSON unchanged. Windows-1255 is a non-issue here because the source is FileGDB (UTF-8). Still pass `encoding=utf8` explicitly.
- **`-proj` accuracy.** Measured on SA centroids in Tel Aviv and Jerusalem, against PROJ's best EPSG op "Israel 1993 to WGS 84 (2)", accuracy 0.5 m. Results by source CRS definition:
  - From the `.prj` written by GDAL (ESRI WKT without TOWGS84), `-proj wgs84`: **77.8 m off**. The datum shift is dropped.
  - `-proj init=EPSG:2039 -proj wgs84`: **9.7 m off**.
  - `-proj init='+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=23.772,17.49,17.859,-0.3132,-1.85274,1.67299,5.4262 +units=m' -proj wgs84`: **0.2 m off**.
  - Simplest correct route: let GDAL reproject during conversion (`ogr2ogr -t_srs EPSG:4326`), which uses the same PROJ operation. **(The PROJ path was verified through pyproj, not by running the `ogr2ogr` CLI, which is not installed here.)**

**OpenFreeMap tiles and styles.**
- The TileJSON at `https://tiles.openfreemap.org/planet` (build `20261018_080001_pt`) uses the unmodified OpenMapTiles schema, maxzoom 14.
- The `place` and `transportation_name` layers carry `name`, `name:he`, `name:en`, `name:ru`, `name_en`, `name:latin`, `name:nonlatin` and others (84 name fields).
- The stock `liberty` style labels with `name:latin` + `name:nonlatin` (or `name_en`/`name`). For a language switch, override each symbol layer's `text-field` at runtime: `["coalesce", ["get", "name:ru"], ["get", "name"]]`, and the same with `name:he` / `name:en`.
- Russian coverage in OSM for Israel is partial (§7: about 43% of place nodes have `name:ru`). The fallback to `name` will show Hebrew for many villages.

## 10. Risks and open questions

1. **The SA vintage contradicts the plan.** Use SA-2011 for the 2021 index. A future 2023 index will almost certainly be on SA-2022, so the pipeline must key geometry by vintage (`sa2011`, `sa2022`), not just by level.
2. **L1 boundaries are statistical, not legal.** The local-authority polygons are dissolved from CBS SA/locality polygons plus 55xx RC open land. They are not the Ministry of Interior jurisdiction layer (גבולות שיפוט). The MoI layer was not found on data.gov.il, and an open download was not located **(open question)**. West-Bank RCs come out as scattered settlement polygons with no RC territory. Decide whether that is acceptable or whether to show them as points.
3. **Missing SA data in 36 Arab and Druze cities** at L3 is structural. Design the legend for "no data / not calculated" separately from cluster colours.
4. **Locality → RC membership** is taken from `bycode2021` (end-2021 municipal map), while geometry is the 2020 SA edition. All codes matched, but polygons could be slightly stale for localities founded in 2021 **(unverified)**.
5. **The L2 Russian gap** (about 46% without a Cyrillic name) needs a product decision: transliteration fallback or English fallback.
6. **data.gov.il terms:** the current licence text was not read. Confirm it before shipping those CSVs.
7. **mapshaper ↔ datum:** never rely on the `.prj` alone (78 m error). Add a build-time assertion that checks a known point (e.g. Tel Aviv SA 437 centroid ≈ 34.7973703, 32.0855063: the area-weighted centroid in EPSG:2039, transformed with pyproj's "Israel 1993 to WGS 84 (2)". The 34.79777, 32.08690 given here earlier was about 160 m off).
8. Zips `1.zip`–`3.zip` (PDF maps) and the duplicate unzipped `.gdb` folders bloat the repo. Pick one form.

## 11. Pipeline recommendation

**Inputs**
- L1: `cbs-socioeconomic-2021/24_24_230t1.xlsx` (add t2 later for the variables).
- L2: `…/24_24_230t3.xlsx`.
- L3: `…/24_24_230t4.xlsx` (or publication `t12.xlsx` for the variables).
- Geometry: `cbs-statistical-areas-2011-demography-2020/…gdb`.
- Mapping: `cbs-localities-file/bycode2021.xlsx`.
- Names: `wikidata-p3466/*.csv`, then `datagov-localities-multilingual/*.csv`.

**Parsing (SheetJS)**
- Read sheet 0 with `header:1`.
- Keep a row only if the code column (`B` for t1/t4, `F` for t3) is a finite number.
- Map columns by fixed index (t1: 0–11; t3: 0–13; t4: 0–11). Assert that the header text of row 6 / row 10 contains `CODE OF LOCALITY`, so the parser fails loudly if the layout shifts.
- Treat `'..'` as `null`.
- Cast codes with `Math.trunc(Number(x))`.

**Keys**
- `sa_id = loc * 10000 + sa` (int). As a string, zero-pad to 8 digits.
- `locality_id = loc` (int).
- `authority_id = status ∈ {0,99} ? loc : 5500 + status`.
- Store keys as integers in JSON. Never key RCs by bare status number.

**Geometry**
1. `ogr2ogr -f GPKG -t_srs EPSG:4326 sa2011.gpkg statisticalareas_2020_demography.gdb`. This needs GDAL; alternatively keep EPSG:2039 and use the explicit `+towgs84` init above.
2. mapshaper outputs:
   - **L3**: filter `STAT11 != null`, keep `YISHUV_STAT11` as `id`. Optionally limit to the 81 index cities and render the other SA-divided cities greyed.
   - **L2**: `-dissolve SEMEL_YISHUV` over locality polygons (`SEMEL_YISHUV < 5500` or between 5600 and 9899), keep `id=SEMEL_YISHUV`.
   - **L1**: join `bycode2021` status onto locality polygons. Compute `authority_id`: muni/LC → own code; RC member locality → `5500+status`; 55xx polygon → own code. Drop 99xx and no-status polygons. Then `-dissolve authority_id`.
   - Then `-simplify 5% keep-shapes` (tune visually) and `-o format=topojson quantization=1e5`. Expect about 0.25–0.4 MB gzipped per level.

**Datasets.** One JSON per level and vintage, `{id → {idx, cluster, rank, pop, cluster_2019}}`. Names go in a separate `{id → {he, en, ru, ru_source}}` keyed by the same ids.

**Normalization**
- Trim and collapse whitespace in names.
- Strip trailing `*` from CBS Hebrew names (it marks localities with changes) and trailing `(…)` from Wikidata ru labels.
- Reject non-Cyrillic ru values.
- Title-case UPPERCASE English from t1 by preferring `bycode2021` `שם יישוב באנגלית`. For RCs, use the Wikidata `en` label.
