# Data sources 2: new map layers (spike report)

Research date: 2026-10-25. Every number below comes from files downloaded into `data/raw/` and inspected with scratch
scripts that are not committed (Python run with `-I`, scripts outside the repo). Lines marked **(unverified)** are
inferred or come from secondary sources. Section 4 (schools) was researched by a parallel agent; I re-checked its row
counts, columns, precision counts, the CKAN licence fields and the data.gov.il terms page myself.

## TL;DR

- **Peripherality index: latest is 2020** (media release 420/2022, 2022-12-26; publication No. 1917, 2023-11-12). It
  has two levels: **255 local authorities** and **1,213 localities**, the latter including cities and local councils.
  There is **no SA level**. Joins on our 2011 levels are 100%: authorities 255/255, localities 1213/1213, RC localities
  1012/1012. Classification is official **clusters 1–10** plus a continuous index. CBS updates it every 5 years, and
  the CBS release forecast lists nothing newer. Effort **S**. This would be the first layer on `localities-2011`.
- **Population composition: the newest localities file is `bycode2024.xlsx`** (end-2024 estimates, file dated Dec
  2025). It has population, Jews & others, Arabs, foreigners, locality type and religion of locality, and since 2024
  an authority code in our `5500+n` convention.
  - It has **no growth column**. Growth across years is broken by two definition changes: the Census-2022 rebasing of
    the 2022 estimates, and foreigners being counted from 2023.
  - **2024 drops the Jews-only column**, so "other" can't be separated from Jews.
  - Join to `localities-2011`: 1,216 of 1,221 populated localities. The 5 misses are localities founded after 2021.
  - Effort **S–M**.
- **Census 2022 IS published at statistical-area level, openly.**
  - Coverage: 2,193 SA rows in 142 localities, **Arab and Druze cities included** (the SES index has only 81 cities).
  - Variables: 340 in the CBS summary file, 60 in the data.gov.il CSV.
  - Join to the CBS SA-2022 layer: **2193/2193**.
  - Gaps: 240 SA polygons are covered only through "combined" SAs, and 171 are suppressed, all of them non-residential.
  - **No SA-2022 neighbourhood/streets file exists.** It can be approximated through the 2011→2022 key.
  - **The SA-2022 layer's locality outlines are identical to our 2011-vintage ones**, except 3 West-Bank settlements
    that gained real polygons. So `statistical-areas-2022` needs no new locality or authority levels.
  - Effort **L**.
- **Schools: an open MoE list with ITM coordinates and CBS locality codes exists** (`mosdot_edu`, data.gov.il, created
  2026-10-05).
  - It has 34,898 institutions, 6,641 of them schools. Join to `localities-2011`: 6,609 of 6,641 schools (99.5%).
  - No geocoding is needed.
  - Missing: English names, current student counts, and Bagrut results. **Bagrut per school is not openly
    downloadable**; it exists only behind the undocumented API of the transparency site.
  - Effort **M**, because this is the first points layer.
- **Contradictions with the plan:**
  1. Peripherality has no SA level, and its locality table covers every locality, so it belongs on `localities-2011`,
     not `rc-localities-2011`.
  2. "Growth" isn't in the localities file. Across years it is not comparable without care (§2.5).
  3. 2024 has no Jewish-only share.
  4. Schools have no current student counts and no open Bagrut data.
  5. A new SA-2022 level doesn't need new parent geometry (§3.6).
- **Downloads:** CBS files and the SharePoint REST API work with plain `curl`, as in report 1. **data.gov.il resource
  URLs on `aws-e.data.gov.il` / `e.data.gov.il` redirect to a Google sign-in.** Rewriting the host to `data.gov.il`
  plus a browser UA gives 200. No bot protection was bypassed.

---

## 1. CBS peripherality index (מדד פריפריאליות)

> **Used (step 1, 2026-10-25):** dataset `peripherality-2020` (`pipeline/datasets/peripherality-2020/`). It reads
> t1 → `local-authorities-2011` (255/255) and t2 → `localities-2011` (1213/1213), with ColorBrewer YlGn. Only t1 and
> t2 are committed; t3, t4 and the publication tables stay gitignored.

### 1.1 Editions (verified via SharePoint REST, 2026-10-25)

| Reference year | Media release | Publication | Notes |
|---|---|---|---|
| 2004 | (2008) | — | "new development" |
| 2015 | 2017-12-19 | 2019-04-11 | |
| **2020** | **420/2022, 2022-12-26** | **No. 1917, 2023-11-12** | latest |

- **Nothing newer is in the pipeline.** The CBS release-forecast list (`lists(guid'42a5add2-…')`) has only the 2020
  entry. The publication summary says the index "will be published every 5 years", so a 2025 edition would be
  expected around 2027–28 **(unverified)**.
- **Method:** a weighted sum of standardized potential accessibility (2/3) and proximity to the Tel Aviv District
  boundary (1/3).
- **Coverage:** 1,213 localities with municipal status at end-2020 (201 municipalities and local councils plus 1,012
  RC localities) and 255 authorities. An RC's value is the population-weighted mean of its localities.
- **Not covered:** Bedouin tribes, "places", employment centres, and localities without municipal status (intro_e
  §2).

### 1.2 Downloads

Release folder: `https://www.cbs.gov.il/he/mediarelease/DocLib/2022/420/`

| File | Content |
|---|---|
| `24_22_420t1.xlsx` | Table 1: 255 authorities |
| `24_22_420t2.xlsx` | Table 2: 1,213 localities |
| `24_22_420t3.xlsx` | Table 3: RC localities by RC |
| `24_22_420t4.xls` | municipal-status codes |
| `24_22_420b.pdf` | release text |

Publication folder: `https://www.cbs.gov.il/he/publications/DocLib/2023/1917/`. It has `table_01–03.xlsx` (identical
to t1–t3, see below), `intro_e.pdf` (methodology) and `nispah_e.pdf` (2022 municipal changes). Media-release page:
`/he/mediarelease/Pages/2022/מדד-הפריפריאליות-של-יישובים-ושל-רשויות-מקומיות,-2020.aspx`.

**Release tables vs. publication tables:** t1↔table_01 and t3↔table_03 are row-identical. t2↔table_02 differ only in
an asterisk on "סביון*" and one comma in the title.

### 1.3 Schema

All three tables are one sheet each, with a bilingual title block, two-row he/en headers and merged footnotes. Codes
are numeric cells.

**t1** (`לוח 1`): header rows 6–9, data rows 10–264 (**255 rows**), footnotes rows 266–269.

| Index | Column |
|---|---|
| 0 | `מעמד מוניציפלי` (0 / 99 / RC number) |
| 1 | `סמל יישוב`: **empty for the 54 RCs**, as in SES t1 |
| 2 | Hebrew name |
| 3 | English name (UPPERCASE) |
| 4 | population 2020 |
| 5 | proximity to TA district: value |
| 6 | proximity to TA district: rank |
| 7 | potential accessibility: value |
| 8 | potential accessibility: rank |
| 9 | **index value 2020** |
| 10 | rank (1–255; ties are .5) |
| 11 | **cluster 2020 (1–10)** |
| 12 | cluster 2015 |

**t2** (`לוח 2`): header rows 4–7, data rows 8–1220 (**1,213 rows**, no duplicate codes).

| Index | Column |
|---|---|
| 0 | status |
| 1 | RC name (he) |
| 2 | RC name (en) |
| 3 | **locality code** |
| 4 | Hebrew name |
| 5 | English name |
| 6 | sub-district |
| 7 | population 2020 |
| 8 | distance from TA district boundary (km) |
| 9 | proximity: value |
| 10 | proximity: rank |
| 11 | accessibility: value |
| 12 | accessibility: rank |
| 13 | **index value** |
| 14 | rank (1–1213) |
| 15 | **cluster** |
| 16 | cluster 2015 |

**t3**: header rows 6–9, data rows 10–1021 (**1,012 rows**). Its index values equal t2's for all 1,012 rows.

**Clusters** come from hierarchical clustering of the 255 authorities, so they are unequal in size: 18, 20, 47, 39, 41,
45, 15, 16, 9 and 5 authorities for clusters 1–10. Localities are slotted into the authority cluster ranges.

| Cluster | Index range (localities) |
|---|---|
| 1 | −2.548 … −1.031 |
| 2 | −1.030 … −0.695 |
| 3 | −0.694 … −0.302 |
| 4 | −0.299 … 0.037 |
| 5 | 0.038 … 0.419 |
| 6 | 0.421 … 1.180 |
| 7 | 1.206 … 1.676 |
| 8 | 1.682 … 2.584 |
| 9 | 2.633 … 3.491 |
| 10 | 3.900 … 4.973 |

1 = most peripheral (Eilat, Hevel Elot), 10 = most central (Tel Aviv, Giv'atayim, Ramat Gan).

**Municipal changes after 2020** (`nispah_e.pdf`): Sha'are Tiqwa (3720) and Ez Efrayim (3778) left RC Shomron and
became the new LC Sha'ar Shomron (3826) in 2022. CBS gives recomputed values: 3826 = 0.723, cluster 6; Shomron RC =
0.143, cluster 5. Our 2011 geometry still has the pre-change layout, so **use the published 2020 tables as they are**.

### 1.4 Join test

| Table → level | Rows | Matched | Unmatched | Geometry without value |
|---|---|---|---|---|
| t1 → `local-authorities-2011` (code, or `5500+status` for RCs) | 255 | **255** | 0 | 2: Migdal Tefen 1722, Neot Hovav 1770 (industrial LCs; same two as SES) |
| t2 → `localities-2011` | 1,213 | **1,213** | 0 | 70: 66 have 0 residents in the 2020 SA layer (industrial zones, regional centres, "17xx"); Shani 1287 (546 residents) has no municipal status, so it is excluded by method; 3 more have <500 residents |
| t3 → `rc-localities-2011` | 1,012 | **1,012** | 0 | 62 |

**Recommendation:** ship t1 on `local-authorities-2011` and t2 on **`localities-2011`**. t2 is a superset of t3, so a
separate RC-localities layer would be redundant. This becomes the first dataset on `localities-2011`.

### 1.5 Classification

- **Default:** categorical clusters 1–10, as official as the SES ones.
- **Palette:** use a **sequential** one (`palette10('viridis')` or a YlGnBu ramp), not SES's diverging RdYlBu.
  Peripherality is ordinal remoteness with no meaningful midpoint, and a different palette also keeps the two indices
  from being confused side by side.
- **Note text:** "1 = most peripheral, 10 = most central".
- **Popup:** `cluster`, `index` (3 decimals), `rank` (of 255 / 1213), `distance_km` (localities only, 1 decimal),
  `population` (2020). Optionally the two components.
- **No stepped variant.** The clusters are already data-driven breaks, and adding quantiles would only confuse.

### 1.6 Licence and size

- **Licence:** the CBS open licence (same as report 1 §8; not re-read today).
- **Citation:** *הלשכה המרכזית לסטטיסטיקה (הלמ"ס), מדד הפריפריאליות של יישובים ושל רשויות מקומיות 2020 (הודעה
  לתקשורת 420/2022), (נשלף 25.10.2026), זמין ב: <release URL>, הועתק והופץ כמות שהוא בהתאם לרישיון השימוש של
  הלמ"ס.*
- **Size** (measured on a mock dataset with 6 fields): localities 121 KB raw / **21 KB gzipped**; authorities about
  **5 KB gzipped**. No new geometry.

## 2. Population composition per locality and authority (CBS localities file)

> **Used (steps 2–3, 2026-10-25):** dataset `population-2024` (`pipeline/datasets/population-2024/`) reads
> `bycode2024.xlsx` and `bycode2022.xlsx`. The measures are size, growth 2022→24 (Israelis, ≥500 base), population
> group and locality type. Joins: localities 1216/1221 (the 5 above have no polygon; Tel Zion is merged into 3779) and
> authorities 255/257 (Tzur Hadassa and Sha'ar Shomron by 2011 membership).

### 2.1 What `bycode2021.xlsx` actually has

Sheet `קובץ יישובים 2021`, header row 1, 1,483 rows, 26 columns:

| Group | Columns |
|---|---|
| Identity | שם יישוב, סמל יישוב, תעתיק, שם יישוב באנגלית, שנה |
| Geography | סמל מחוז, שם מחוז, סמל נפה, שם נפה, אזור טבעי, שיוך מטרופוליני, ועדת תכנון, תחנת משטרה |
| Municipal | סמל מעמד מונציפאלי, שם מעמד מונציפאלי, אשכול רשויות מקומיות |
| **Population 2021** | **סך הכל אוכלוסייה 2021, יהודים ואחרים, מזה: יהודים, ערבים** |
| Type | **דת יישוב** (1 Jewish, 2 non-Jewish, 3 Bedouin tribe, 4 mixed), **צורת יישוב שוטפת** (23 codes, e.g. 330 kibbutz), השתייכות ארגונית, שנת ייסוד |
| Location | **קואורדינטות** (10 digits = ITM E/N in 10 m units), גובה ממוצע |

**There is no growth column.** Population cells are `''` for non-residential places, so 1,219 rows are populated.

### 2.2 Newer files (verified: SharePoint folder `/he/publications/DocLib/2019/ishuvim`, 80 files)

| File | Rows | Date in folder | Notes |
|---|---|---|---|
| `bycode2022.xlsx` | 1,484 | 2026-01-04 | same 26 columns as 2021 |
| `bycode2023araii.xlsx` / **`bycode2023Sofi.xlsx`** | 1,484 | 2026-01-04 | preliminary / **final**; new columns `סך הכל ישראלים`, `זרים`; **`מזה: יהודים` dropped** |
| **`bycode2024.xlsx`** | **1,490** | 2026-01-04 (intro dated Dec 2025) | **latest**, 30 columns |
| `index2024.xlsx` | | | code legends: district, status, religion, **locality type**, authority-type and more (12 sheets) |
| `changes-1948-2024.xlsx`, `change2024-2023Araii-2023Sofi.xlsx` | | | code and status changes |
| `intro.pdf` | | Dec 2025 | definitions |

URL pattern: `https://www.cbs.gov.il/he/publications/DocLib/2019/ishuvim/<file>`.

**`bycode2024.xlsx`** has sheet `קובץ יישובים 2024`, header row 1. Compared with 2021:
- **New:**
  - `סך הכל ישראלים 2024`
  - `זרים` (foreigners)
  - `שם אשכול רשויות מקומיות` (cluster name instead of code)
  - **`סמל רשות מקומית`**, which CBS defines as the own code for municipalities and LCs, and `55xx` for every
    locality of an RC: exactly our authority key
  - `שם רשות מקומית`
  - `סמל סוג רשות מקומית` (1 city, 2 LC, 3 RC, 4 none)
- **Dropped:** `מזה: יהודים`.
- **Changed:** `קואורדינטות` is now a 12-digit **string** (ITM metres E6+N6). Spot-checked with pyproj: Tel Aviv
  34.7893, 32.0764; Haifa 35.0093, 32.8037.

Totals for 2024: population 9,980,204 = Israelis 9,719,951 + foreigners 260,253. Jews & others 7,687,471; Arabs
2,032,480.

### 2.3 Definition breaks (from `intro.pdf` §16–17, verified text)

1. **From 2023 the estimates include foreigners** who stayed legally during the year: foreign workers, students and
   so on, plus tourists who overstayed after 2008. **Through 2022 they were excluded.**
2. **From 2022 the estimates are based on the 2022 Census** (reference date 2022-04-02). The national total jumps
   from 9,377,889 (end 2021, file) to 9,583,826 (end 2022).
3. From 2023 the Lebanese (former SLA families) are classified by religion, mostly into "Arabs". Before that they
   were unclassified.
4. 2024 has no Jews-only split. "Other" (non-Arab Christians and people with no religion, mostly olim family members)
   is inside "Jews and others" and **cannot be separated in 2023–2024**. A Jewish/other split exists in
   `bycode2022.xlsx`, and the Census 2022 has `j_isr`/`j_abr` shares.

### 2.4 Join to our 2011-vintage geometry

| File | Codes | In `localities-2011` | Populated localities not in geometry | Geometry codes missing from file |
|---|---|---|---|---|
| 2021 | 1,483 | 1,283 / 1,283 polygons | 0 | 0 |
| 2022 | 1,484 | 1,281 | 2: Sha'ar Shomron 3826 (8,820), Ramat Trump 4029 (87) | 3720, 3778 (merged into 3826) |
| 2023 | 1,484 | 1,280 | 4 | 3720, 3778, 1751 |
| **2024** | 1,490 | 1,280 | **5, totalling 16,686 residents**: 3826 Sha'ar Shomron 8,836; **3815 Tel Zion 6,935**; 1362 Giv'ot Eden 562; 3864 Bet Hogla 242; 4029 Ramat Trump 111 | 3720 Sha'are Tiqwa, 3778 Ez Efrayim, 1751 (research centre, gone) |

- The remaining ~205 codes not in the geometry are Bedouin tribes (460), "places" (510), employment centres (520) and
  collective codes (530), none of which have population in the file.
- **Tel Zion 3815 was split from Kokhav Ya'akov 3779 in 2023.** In 2021, 3779 had 9,524 residents; in 2024, 3779 has
  4,093 and 3815 has 6,935. Our 3779 polygon covers both **(unverified, inferred from the split)**. Showing 2024
  values on it would silently halve the place.
- **Authorities (2024 `סמל רשות מקומית`):** 259 authorities, 257 of them in `local-authorities-2011`. The 2 that
  aren't:
  - **Tzur Hadassa 1113**, which became an LC in 2024 (from Mateh Yehuda; 10,458 residents)
  - **Sha'ar Shomron 3826**

  Status changes that keep the code: Ganei Tikva 229, Harish 1247 and Kafr Qara 654 went from LC to municipality.
- No newer *boundary* file exists. CBS publishes geometry only as SA layers (report 1), and the SA-2022 layer is built
  on the 2021 locality list (§3.6).

**Recommendation.** Use **bycode2024** on the 2011-vintage geometry, with documented reassignments:
- Locality level: drop the 5 new localities (listed as "no polygon" in the build report). Either merge 3815 into 3779
  for display, labelled "Kokhav Ya'akov incl. Tel Zion", or leave 3779 as "not calculated". Prefer the merge, with a
  popup note.
- Authority level: aggregate localities by their **2011-geometry membership** (Tzur Hadassa → Mateh Yehuda 5526,
  Sha'ar Shomron → Shomron 5572) and say so in the layer description. Recomputing the dissolve with 2024 membership
  is cheap, because the pipeline already dissolves by membership, but it is a new level (§5).

### 2.5 Variables, growth and classification

Suggested dataset `population-2024`, one record per locality:

| Field | Source / formula |
|---|---|
| `population` | total 2024, foreigners included |
| `israelis` | `סך הכל ישראלים 2024` |
| `growth_pct` | 2022→2024 (see below) |
| `jews_others_pct`, `arabs_pct`, `foreign_pct` | each group ÷ total |
| `locality_religion` | 1–4 |
| `locality_type` | grouped (below) |

**Growth.** The only consistent span is **end-2022 → end-2024, Israelis only**: 2024 `סך הכל ישראלים` vs 2022 total.
Both are census-based and both exclude foreigners. 1,217 localities qualify.

| Subset | Percentiles of 2-year growth |
|---|---|
| All localities | p10 −13.0, p25 −5.0, median +2.0, p75 +9.5, p90 +18.3 |
| ≥2,000 residents (n=280) | p10 −6.5, median +1.6, p90 +11.2 |

Extremes run from −77% to +138%. These are small localities, and probably also the 2023–24 war displacement
**(unverified)**. Hide growth below 500 residents, or mark it "unreliable".

**Proposed classifications.**

| Layer | Type | Breaks / classes | Why |
|---|---|---|---|
| Population size | stepped | 500, 2,000, 5,000, 10,000, 20,000, 50,000, 100,000, 200,000 | CBS's own size bands in `צורת יישוב` (2k/5k/10k/20k/50k/100k/200k), plus 500 to split the 1,000 small rural localities. Quantiles (p50 = 929) would spend 5 of 8 classes on villages. |
| Growth 2022–24 | stepped, diverging | −5, 0, 2, 5, 10 | Round numbers near p25, p40, p50, p65 and p80. Zero must be a break. |
| Population group | **categorical** `דת יישוב`: Jewish / non-Jewish / mixed (4 is "יישוב מעורב") | — | Arab share is bimodal: 1,054 localities <5%, 127 ≥95%, only 40 in between. A stepped % map would be two colours plus noise. Keep `arabs_pct` in the popup, or offer stepped 5/20/50/80/95 as a secondary layer for mixed cities. |
| Locality type | categorical, grouped from 23 codes | urban Jewish (120–193), urban non-Jewish (250–290), moshav (310, 320), kibbutz (330), community settlement (370), other rural (340, 350, 440, 450) | 6 classes stay readable. |

**Size:** 1,221 records with 7 fields: 149 KB raw, **14 KB gzipped**. Authorities: about 4 KB gzipped.

**Licence:** CBS open licence. Citation: "…, קובץ היישובים 2024, …".

## 3. Census 2022 by statistical area (2022 vintage)

> **Used at locality level (step 4, 2026-10-25):** dataset `census-2022` (`pipeline/datasets/census-2022/`) reads
> the locality rows of `mifkad-2022.xlsx` (1184/1185 on `localities-2011`; 1997 is the Bedouin dispersion group). The
> measures are median age, 65+, academic degree, median employee wage, renting and main household religiosity.
>
> **Used at SA level (step 6, 2026-10-26):** new level `statistical-areas-2022` from `ezorim_statistiim_2022.gdb.zip`
> (2,615 SAs in 145 cities, now committed), with the same six measures from the 2,193 SA rows of `mifkad-2022.xlsx`.
> - **Combined SAs:** the record is copied onto every SA in the `StatAreaCmb` group (+240 SAs). Each of the 433
>   grouped SAs gets a per-feature note: "published jointly for n areas, population is their total", n = 2–6. That
>   replaces the `combined_count` field proposed in §3.6.
> - **No data:** 182 SAs. 179 are on `sa_not_published_census2022.xlsx` (now committed); 3 are in Deir Hanna, Kabul
>   and Majdal Shams, which have locality rows only. 2 entries on that list are single-SA localities (1111, 392), so
>   they are not on the level.
> - **Geometry fixes:** the one invalid source polygon among the divided cities (Shoham 1304/6) is repaired by
>   mapshaper `-clean`. Four sub-metre necks that the 2·10⁵ grid pinched (Jerusalem 2221 and 2913, Tel Aviv 916, Ness
>   Ziona 12) are fixed with `-clean snap-interval=0.00001`, on this level only. The other 4 of the 5 invalid
>   polygons are `55xx` open land, which the level doesn't use.
> - **Size:** 1,668 KB raw / 397 KB gzipped geometry, and 38 KB gzipped data.
> - **Population:** census `pop_approx` (`populationYear` 2022), not the 2023 file, which lacks 34 cities.
> - **Not done:** no neighbourhood names (option 3 in §3.6, inherited through the key, was left out). The key and the
>   readme stay gitignored.
> - **Numbers that differ from the earlier estimates below:** "171 no data" was the 142 census cities only; with the 3
>   locality-only cities it is 182. "Not published but has a data row" is 0 when SAs are matched through
>   `StatAreaCmb`.

### 3.1 What is published (verified)

- **Media release 218/2024 (2024-07-15)** launched the Census-2022 dashboard (`https://census.cbs.gov.il/`, Looker).
  It says the data is "available on the CBS dashboard, **data.gov.il** and **GovMap**", for these units: national,
  district, locality, quarter (רובע), sub-quarter (תת-רובע) and **statistical area**.
- **Topics:** population and age; religion and religiosity; marriage and fertility; origin and aliya; household size;
  education; work and wages; housing (tenure, rooms, density); vehicles and parking; functional difficulty; commuting;
  migration in the last 5 years.
- The socio-economic variables come from a **sample**: about 7% enumerated, covering about 20% of the population with
  their households (`definitions_census2022.pdf`).
  - Percentages are rounded to 0.1, and population to the nearest 10.
  - The southern Bedouin dispersion, Tarabin a-Sana and Sawa are **not represented**, because their estimates were
    unreliable.
  - Institutional localities are not shown.

### 3.2 Files and URLs

All CBS files below are in `https://www.cbs.gov.il/he/publications/LochutTlushim/<year>/<name>`, URL-encoded. They are
the files the definitions PDF lists as "for the user's convenience".

| Local copy (`data/raw/…`) | CBS name | Content |
|---|---|---|
| `cbs-census-2022/summary_geo_units_census2022_en.xlsx` (7.9 MB) / `_he.xlsx` | 2024/`Summarized file of broad geographical units - census 2022.xlsx` / `קובץ מסוכם ליחידות גאוגרפיות מפקד 2022.xlsx` | **Main source.** 10 sheets: "Big Localities" (with quarter/sub-quarter, 473 cols), **"Statistical area" (2,334 rows × 340 cols)**, "Little Localities" (156 cols), district, metropolitan, locality type, municipal status, authority cluster, comparison 1972–2022 |
| `cbs-census-2022/mifkad-2022.xlsx` (1.1 MB) | 2024/`מפקד-2022.xlsx` | "Selected data by localities and SAs": 60 cols, 3,379 data rows (he + en codes) |
| `cbs-census-2022/selected_data_localities_sa_census2022_en.xlsx` | 2025/`Selected data, by localities and statistical areas - the 2022 Census.xlsx` | English version of the same |
| `datagov-census-2022/selected-data-by-localities-and-statistical-areas-2022-census.csv` | data.gov.il dataset `2022` ("מפקד האוכלוסין והדיור 2022", org `lamas`), resource `9a9e085f-3bc8-41df-b15f-be0daaf99e30` | the same 60 cols, UTF-8 with BOM, 3,379 rows. **The header names of `hh_MidatDatiyut` and `hh_MidatDatiyut_Name` are swapped relative to their values.** |
| `datagov-census-2022/population-by-age.csv`, `population-and-households-by-locality.csv` | same dataset | locality level only |
| `cbs-census-2022/combined_statistical_areas.xlsx` | 2024/`אזורים סטטיסטיים מאוחדים.xlsx` | 266 rows: cancelled SA → merged into SA |
| `cbs-census-2022/sa_not_published_census2022.xlsx` | 2024/`רשימת אזורים סטטיסטיים שעבורם לא מפורסמים נתוני מפקד 2022 .xlsx` | 181 SAs with no data (open land, industry and so on). SA numbers are floats like `2.000000000066393`, so round them. |
| `cbs-census-2022/combined_quarters_subquarters.xlsx`, `changes_census2008_to_2022.xlsx`, `definitions_census2022.pdf` | 2024/… | supporting |
| `cbs-census-2022/population_by_sa_group_sex_age_end2022.xlsx` | 2023/`7-אוכלוסייה ביישובים … לפי אזור סטטיסטי …סוף 2022.xlsx` | end-2022 estimates by SA (not inspected in detail) |
| `cbs-population-sa2022-2023/population_by_locality_sa_age_end2023.xlsx` | 2026/`אוכלוסייה לפי יישוב, אזור סטטיסטי וגיל בודד - סוף 2023.xlsx` | sheet `Sheet1`: **2,093 SA rows in 111 localities, 2093/2093 match SA-2022**. Usable as `populationYear` 2023 for the SA-2022 level. |
| `cbs-statistical-areas-2022/…` (already there, gitignored) | `ezorim_statistiim_2022.gdb.zip`, `key_sa2011_to_sa2022.xlsx`, `readme_sa2022.pdf` | geometry and key (report 1 §1) |

The CBS `LochutTlushim` server is slow: the 7.9 MB files took about 60 s each. Scripted download works. data.gov.il
needs the `data.gov.il` host and a browser UA (see TL;DR).

### 3.3 Schema (SA rows)

- **Keys:** `LocalityCode` (int), `StatArea` (int, within-locality number), `StatAreaCmb` (string, `"3+1"` when SAs
  are merged). The **global key is `LocalityCode*10000 + StatArea`**, the same composition as SA-2011 and verified
  against `YISHUV_STAT_2022`.
- **Row types in the data.gov.il CSV / `mifkad-2022.xlsx`:**
  - 1 national row
  - 1,185 locality rows (`StatArea` empty)
  - **2,193 SA rows in 142 localities**, with no duplicate keys
- **The summary file's "Statistical area" sheet** has the same 2,193 SA rows plus 141 locality rows. Header: labels in
  row 2, codes in row 3. Its 340 columns, grouped by code stem:
  - **Geography:** district, sub-district, natural area, metropolitan area, type, municipal status, authority cluster,
    area
  - **Population:** `pop_approx`, `DependencyRatio`, median age (all, m, f), 10-year age bands by sex, main religion
    + %
  - **Origin:** `j_isr`, `j_abr`, aliya periods, continent of birth, top-3 countries
  - **Marriage:** marriage age, `ChldBorn_avg`
  - **Mobility:** `FiveYrsDifLoc`
  - **Disability:** dress, hear, remember, see, walk
  - **Education:** `educ8 / 9_12 / 13_15 / 16` and certificates (Matric, PostSecondary, Acadm1, Acadm2), each total,
    m and f; `yeshiva`
  - **Work:** `WrkY`, `WrkN`, `Empl`, `SelfEmpl`, `HrsWrkWk`, `Wrk_15_17`, `WrkOutLoc`
  - **Industry and occupation:** industry A–X and occupation 1–9, each total, m and f
  - **Commuting:** commute mode (car, bus, train, bicycle, on foot and so on)
  - **Earners per household:** `Godel*Emp` (household size × number of earners)
  - **Wages:** `employeesAnnual_medWage`, `employeesWage_decile1–10`, self-employed equivalents
  - **Households:** `hh_total_approx`, size distribution, children, **household religiosity** (`hh_Haredi/Dati/
    Masorati/Hiloni/Meorav/Acher_pcnt` + main category)
  - **Housing:** `HousingDens_avg`, own/rent/other, rooms 1–8+
  - **Vehicles and devices:** `Vehicle1up`, `Vehicle2up`, `Parking`, `cellphone_ratio`, `Computer_avg`
- **Not at SA level:** `change_pcnt` (growth since 2008), `pop_density`, `inst_pcnt` and `Foreign_pcnt` are empty on
  every SA row and exist only per locality.
- **Missingness on SA rows (60-col file):**

  | Columns | Empty |
  |---|---|
  | origin columns (`j_isr`, `aliya*`, continents) | 14.5% (non-Jewish areas) |
  | `SelfEmployedWage_decile9Up` | 9.3% |
  | `Wrk_15_17` | 7.6% |
  | `koshi65` | 2.1% |
  | everything else | <0.5% |

### 3.4 Join to the SA-2022 geometry

The SA-2022 layer has 3,857 polygons:
- 3,753 with `STAT_2022`
- **145 SA-divided localities with 2,615 SAs**
- 1,138 single-SA localities
- 104 `55xx`/`99xx` polygons

| Check | Result |
|---|---|
| Census SA rows → `YISHUV_STAT_2022` | **2193 / 2193 (100%)** |
| SA polygons in the 142 census localities | 2,604 |
| … with their own row | 2,193 |
| … covered through a combined row (`StatAreaCmb`) | **240** (by function: 94 industry, 50 open, 42 residential, 41 public, 13 institutional) |
| … no data | **171**, all on CBS's "not published" list (132 open land, 21 public, 15 industry, 2 institutional, 1 residential) |
| SA-divided localities with **no** SA rows | 3: Deir Hanna 492, Kabul 504, Majdal Shams 4201. They have locality rows only. |
| Census locality rows → `localities-2011` | **1184 / 1185**. The miss is 1997 "גרים מחוץ ליישובים במחוז דרום", a population group with no polygon. |
| Cross-check of CBS's own lists | 18 SAs on the "combined" list still have their own data row, and 8 are on both the combined and not-published lists. Treat CBS's data rows as authoritative. |

**Compared with SES 2021:** the census covers **142 cities, including the Arab and Druze cities** (Umm al-Fahm,
Shefa-'Amr, Tayibe…) that SES leaves blank at SA level.

### 3.5 How SA-2022 relates to SA-2011

From the CBS key `key_sa2011_to_sa2022.xlsx`, 2,943 rows: 1,945 SA-2011 → 2,615 SA-2022 in 145 localities.

| Change type | SA-2011 | SA-2022 |
|---|---|---|
| 1 identical | 839 | 839 |
| 2 identical, renumbered | 444 | 444 |
| 3 full split | 211 | 484 |
| 4 partial split | 268 | 658 |
| 5 first division (locality had one SA in 2011) | 28 | 149 |
| 6 split-and-merge | 57 | 106 |
| 7 full merge | 8 | 4 |
| 9 whole SA plus added area | 90 | 90 |

Only 1,283 SA-2022 (types 1/2/9) map 1:1 to an SA-2011. **Census values can't be shown on SA-2011 polygons** without
areal interpolation, which I advise against: it fabricates precision on sample-based data. The census needs its own
`statistical-areas-2022` level.

### 3.6 What a `statistical-areas-2022` level needs

1. **Geometry.** Same pipeline as SA-2011: gdal3.js `/vsizip/` → 7-parameter datum shift → mapshaper. Filter to the
   145 divided localities (2,615 polygons).
   - The layer has **5 invalid polygons** (shapely), so the existing GEOS check will catch them. They need `-clean` or
     `make_valid`.
   - **123 West-Bank placeholder circles** remain, down from 126: Oranit 3760, Efrat 3650 and Qarne Shomron 3640 now
     have real polygons. The existing placeholder detection applies.
2. **Parents.**
   - **No new locality or authority levels are needed.** Locality outlines in SA-2022 are identical to the
     2011-vintage layer (1,387 codes each, total area 22,147 vs 22,163 km²). Only those 3 localities changed area by
     more than 0.1%.
   - The readme says SA-2022 follows "the 2021 locality list and the MoI continuity layer 2021", which our 2020-edition
     SA-2011 layer evidently already did.
   - `parentCode: "locality_code"` works as on SA-2011, and the locality codes are those of `localities-2011`.
3. **Names.**
   - City names: reuse the existing names pipeline, keyed by locality code.
   - **CBS has no SA-2022 streets/neighbourhoods file.** I searched `LochutTlushim/2018–2026`, `/he/Documents/` and
     the publication and media-release lists. The only "streets and neighbourhoods" files are the SA-2011 one (report
     1) and `/he/Documents/רחובות ושכונות בתתי רובע.xlsx`, which is **sub-quarters, 1995 definitions**. It is
     downloaded but not usable as SA names.
   - **Approximation via the key:**
     - Of the 1,283 1:1 SA-2022, 800 inherit SA-2011 neighbourhood names exactly.
     - Of the 1,332 split, merged or new SA-2022, 998 have at least one named SA-2011 parent. Their names would be
       "neighbourhoods in the 2011 area this came from", which is a superset.
     - The 149 first-division SAs get nothing.
   - **Recommendation:** ship `neighborhoods_he` only for the 1:1 SAs in v1, or flag the inherited ones.
4. **Combined SAs.** Keep the polygons uncombined: the geometry is per level, and a future SES-2023 on SA-2022 will
   need them. Copy the combined record onto each member code and add a numeric `combined_count` (2–4), so the popup can
   say "data for N areas together". The extra cost is about 2 KB gzipped.
5. **Population.** `populationYear` 2023 from `population_by_locality_sa_age_end2023.xlsx` (2,093 SAs in 111 localities; the
   other 522 SA polygons in 34 localities have none, presumably the Arab and Druze cities **(unverified)**), or the census `pop_approx` (2022). Census `pop_approx` is better for label priority, because
   it covers all 2,193 SAs.
6. **Raw files.** `data/raw/cbs-statistical-areas-2022/` is gitignored in its entirety today. Un-ignore the
   `.gdb.zip` and the key.

### 3.7 Classification (from the 2,193 SA rows)

Use stepped breaks at **round numbers near the deciles**. Exact quantiles would be unreadable in a legend ("23.6%")
and would shift between editions. Use sequential palettes, 6–7 classes.

| Layer (field) | Deciles p10 / p25 / p50 / p75 / p90 | Proposed breaks |
|---|---|---|
| Median age (`age_median`) | 20 / 27 / 34 / 38 / 43 | 20, 25, 30, 35, 40, 45 |
| % aged 65+ (`age65_pcnt`) | 4.0 / 7.5 / 14.1 / 19.6 / 24.0 | 5, 10, 15, 20, 25 |
| % with an academic degree (`AcadmCert_pcnt`) | 8.5 / 14.3 / 23.6 / 36.0 / 47.1 | 10, 20, 30, 40, 50 |
| Median annual wage of employees, ₪ (`employeesAnnual_medWage`) | 67.8k / 81.6k / 102.5k / 130.9k / 166.0k | 70k, 85k, 100k, 120k, 150k |
| % renting (`rent_pcnt`) | 9.7 / 21.8 / 31.2 / 41.0 / 52.4 | 10, 20, 30, 40, 50 |
| Avg. household size (`size_avg`) | 2.2 / 2.5 / 2.9 / 3.5 / 4.2 | 2.5, 3, 3.5, 4, 5 |
| % households without a car (`Vehicle0_pcnt`) | 7.8 / 14.1 / 24.9 / 39.8 / 55.4 | 10, 20, 30, 40, 50 |
| Household religiosity (main category) | secular 1,306 · traditional 477 · Haredi 246 · religious 164 SAs | **categorical**, 4 classes |
| Main religion | Jews 1,875 · Muslims 266 · Druze 25 · Christians 17 · other 10 | **categorical**, 5 classes |

- The employment rate (`Empl_pcnt`, p10 81 → p90 93) is too compressed to be worth a layer.
- Keep a short "sample-based estimate" note on every census layer.

**Size:**
- Geometry: a trial with the pipeline's settings (`-simplify 20% keep-shapes -clean`, `quantization=200000`,
  `fix-geometry`) on the 2,615 SA polygons gave **1.92 MB raw / 520 KB gzipped** without properties. SA-2011 today is
  1.67 MB / 410 KB with names. Expect about **0.55–0.6 MB gzipped** with properties.
- Dataset: 13 fields: 557 KB raw / **65 KB gzipped**; 67 KB gzipped with the combined members.
- Locality-level census layers on `localities-2011`: about 30 KB gzipped.

**Licence:** CBS open licence. Citation: "…, מפקד האוכלוסין והדיור 2022 – קובץ מסוכם ליחידות גאוגרפיות, …". The
data.gov.il copy additionally falls under the data.gov.il licence (§4.6). Use the CBS files.

## 4. Schools as a points layer

> **Used (step 5, 2026-10-26):** dataset `schools-2026` (`pipeline/datasets/schools-2026/`) reads
> `mosdot_edu.csv.gz`, which is committed. It is a deterministic gzip of the download: level 9, mtime 0, OS byte 3,
> 0.95 MB instead of 10.9 MB. Two sha256 values are pinned: the original CSV (checked on download and again after
> gunzip at build time) and the `.gz` (checked before every build). `npm run download` fetches the CSV with a browser
> UA from the `data.gov.il` host and writes the gzip. The original CSV is gitignored and kept local only. It keeps the 6,641
> schools: no duplicate codes, none dropped for coordinates. Locality join is 6,609 / 6,641; the 32 unmatched schools
> sit in 11 localities (6 Bedouin tribes, the Tel Nof base, Tel Zion, Sha'ar Shomron, Harsha, Neria).
>
> **Licence (recorded):** no licence on the resource, so the data.gov.il terms of use apply (read 2026-10-25, page
> updated 30/08/2025; §4.6). They allow copying, redistribution and derivative works and require naming the source.
> The manifest's `source.citation` credits "משרד החינוך, מוסדות חינוך, data.gov.il". Bagrut was **not** scraped.

### 4.1 Sources

data.gov.il CKAN; checked 2026-10-25.

| Dataset | Resource (working URL form) | Verdict |
|---|---|---|
| **מוסדות חינוך** `mosdot_edu`, id `55ef9f65-c6af-47c8-8f0f-7ce6990420ad` | `https://data.gov.il/dataset/55ef9f65-c6af-47c8-8f0f-7ce6990420ad/resource/2055063b-93e8-4d6a-b2c5-c253d18c0cf6/download/mosdot_edu.csv` | **Use.** Created and modified 2026-10-05, no `frequency`, licence `notspecified` ("לא צוין רישיון") |
| מאפייני מוסדות חינוך `mosdot` | `…/5a9278c8-fa76-46e1-bf2d-0368078c9cc7/resource/5548fd63-…/download/mosdot.xlsx` | Data covers **2011–2015 only**. It is the only open source of student counts. Stale. |
| קואורדינטות מוסדות החינוך `coordinates` | `…/845e1d30-…/resource/5c5d6bb0-…/download/moe_mosdot_coordinates.csv` | 2022-04, 28,312 rows. Superseded. |
| שקיפות בחינוך (shkifut.education.gov.il) | Angular SPA over an undocumented JSON API (`/api/data/lists`, `/api/data/mosad/?semelMosad=&year=`) | **Not an open download.** No licence or terms were found for the API. |

### 4.2 `mosdot_edu.csv` schema (verified)

- UTF-8 with BOM, 34,898 rows, `SEMEL_MOSAD` unique, 20 columns:
  - IDs and names: `SEMEL_MOSAD`, `SHEM_MOSAD` (**Hebrew only**), `ISV_SHEM_ISHUV`, **`SEMEL_ISHUV_PNIM`** (CBS
    locality code), `SHEM_RASHUT`
  - Classification: `TEUR_TAT_SUG_MISGERET` (type), `TEUR_MIGZAR` (sector), `TEUR_STATUS`, `TEUR_PIKOH1`
    (supervision: ממלכתי / ממלכתי דתי / חרדי), `TEUR_MAMAD` (legal status), `TEUR_SUG_CHINUCH` (regular/special),
    `SHEM_MAHUZ`, `TEUR_HERKEV_UCHLOSIYA` (boys/girls/mixed), `SHLAV_CHINUH` + `TEUR_SHLAV_HINUH` (stage)
  - Geocoding: `TEUR_STATUS_GEOCODE`, `TEUR_SIBAT_STATUS`, `RAMAT_DIYUK_MIKUM` (precision)
  - **Coordinates: `X`, `Y`**
- **Schools = `SHLAV_CHINUH` 1–7: 6,641 rows.** The rest are kindergartens (21,872), daycares (5,750) and so on.
- **There is no student count, no English or Russian name and no address column.**
- **Supervision × sector** for the schools: Jewish ממלכתי 2,381 / ממ"ד 927 / חרדי 2,088; Arab 872; Bedouin 258; Druze
  111; Circassian 4. 811 are special education.

### 4.3 Coordinates and CRS

- `X`/`Y` are **EPSG:2039 (ITM)**. Spot checks are in place: Boyar Jerusalem, Tichon Hadash Tel Aviv, Ironi Alef
  Haifa.
- **Do not use the WGS84 columns in the other MoE files** (old `UTM_X/UTM_Y`, shkifut `LATITUDE/LONGITUDE`). They are
  off by **77.8 m**, which is the same missing-TOWGS84 bug as report 1 §9. Reproject from ITM with the pipeline's
  7-parameter shift.
- **Precision of the 6,641 schools:**

  | Precision | Schools |
  |---|---|
  | very high | 5,529 |
  | high | 604 |
  | medium | 199 |
  | low | 309, placed at the locality centre |

- **1,049 schools sit at 439 points after rounding to ~1 m** (956 at 410 exact source coordinates): shared campuses.
  The 546 figure in the first draft of this report was wrong.

### 4.4 Join to `localities-2011` by CBS code

- **Schools: 6,609 / 6,641 (99.5%).** All institutions: 34,703 / 34,898.
- 31 codes are unmatched:
  - Bedouin tribes and IDF camps that are in bycode but have no polygon
  - post-2021 localities (3815 Tel Zion, 3826 Sha'ar Shomron, 4029 and others)
  - MoE-internal codes (3400 Hebron)
  - evacuated settlements still in MoE data (3758, 3729, 3711)
- **Point-in-polygon** (shapely, against our simplified polygons):
  - 6,270 / 6,641 schools fall inside their own locality.
  - 106 are more than 500 m outside, and 13 more than 2 km.
  - Worst case: kindergartens coded Jat 628 sit about 65 km away, near Yanuh-Jat.
  - Keep the MoE code; flag the outliers; don't relocate.

### 4.5 Outcome metrics (Bagrut)

- **There is no open per-school Bagrut download.** data.gov.il has only RAMA Meitzav 2008–2020 (`rama_meitzav`) and
  old shkifut snapshots (2015/2016).
- shkifut's per-school JSON embeds a national Bagrut list: `ACHUZ_ZAKAIM` eligibility %, excellence, 4/5-unit English
  and maths, for 2014–2025, about 1.1 MB per call.
- Harvesting it means scraping an undocumented API with no licence, so **I recommend against it**. Ask MoE to publish
  the table. Suppression rules: **unverified**.

### 4.6 Licence

- `mosdot_edu` attaches no licence, so the **data.gov.il site licence** applies. I read it myself:
  `https://data.gov.il/he/terms-of-use`, updated 30/08/2025. This also closes report 1's open question about the
  data.gov.il terms.
- **What it grants:** a worldwide, royalty-free, perpetual, non-exclusive licence to copy, distribute, make available,
  modify and create derivative works, commercially or not.
- **Attribution:** **you must name the source** ("ציון מקור המידע"). This is not needed when the use no longer
  preserves the original selection and arrangement.
- **What it forbids:**
  - privacy harm, including by cross-linking with other sources
  - implying official status or state endorsement
- **Warranty:** the data is provided "as is".
- **Credit line:** "משרד החינוך, מוסדות חינוך, data.gov.il (נשלף 25.10.2026)" / "Israel Ministry of Education,
  Educational institutions, via data.gov.il".
- **Update cadence: unknown.** The resource is new, has no `frequency`, and the older coordinates file was updated
  irregularly.

### 4.7 Classification and size

- Records must be numeric, so encode classes as integers.
- **Default layer: "stream", categorical:** 1 ממלכתי (Jewish), 2 ממלכתי-דתי, 3 חרדי, 4 Arab + Bedouin, 5 Druze +
  Circassian.
- **Second layer: stage:** primary / middle / high (incl. middle+high) / multi-stage.
- **No size-by-students.** There is no current count. The 2015 counts would be stepped 150 / 300 / 600 / 1,000
  (round numbers near p25/p50/p80/p95), but don't ship 2015 counts as current.
- **Size** (measured): 6,642 points with 8 properties at 5-decimal coordinates: 1.73 MB raw / **167 KB gzipped**. With
  geometry and code only: 74 KB gzipped. Including kindergartens would make it about 5× larger, so don't.
- **Overlaps:** MapLibre GeoJSON sources support `cluster: true` with `clusterRadius` / `clusterMaxZoom` (checked
  against the MapLibre docs via Context7). Clustering never separates exactly co-located points, so the popup must list
  every school at a point.
- **Geocoding: not needed.** All 6,641 have coordinates. Re-geocoding the 309 low-precision ones would be about a day
  with address lookup. Address fields exist only in shkifut `lists.json` (5,711 schools), not in the open CSV.

## 5. Contract changes needed

1. **Several layers per dataset on one level** (needed by population, census, schools).
   - `pipeline/run.ts:75` and `tests/terminology.test.ts:58–64` require `title === dataset title + " – " + level
     title`. Two layers of one dataset on one level would get identical titles.
   - The viewer's `groupLayers` labels choropleth items by level title, so they would also be indistinguishable.
   - **Proposal:**
     - Add an optional `measure: I18n` to `layerBase` ("Median age").
     - Title rule: `dataset – measure – level` when `measure` is set.
     - Viewer: group by dataset, then label the item `measure` with the level as secondary text, or group by measure
       with level radios.
     - Layer ids: `<dataset>-<measure>-<level>`, e.g. `census-2022-median-age-statistical-areas`.
   - This is additive, so it stays `version: 1`.
2. **New level `statistical-areas-2022`.**
   - Add it to `LevelId`. The kind already exists, so it picks up its wording automatically.
   - Same properties as SA-2011, `parentCode: "locality_code"` (codes shared with `localities-2011`), `countForms`,
     `populationYear` 2022.
   - Optional `neighborhoods_he` (§3.6). An optional numeric dataset field `combined_count`.
   - **Disambiguation:** two "Neighborhoods" levels would co-exist, under different datasets. Consider adding the
     vintage to `officialTerm` ("אזורים סטטיסטיים של הלמ"ס, 2022"). Terminology is keyed by kind today, so this needs
     a `{vintage}` placeholder or a build-time suffix (owner decision).
3. **First use of `PointsLayer`.**
   - The contract says only "FeatureCollection<Point> at `data`; values in properties". The build validates nothing
     about it.
   - Add a zod `PointsData` schema:
     - `code` (string, unique; `SEMEL_MOSAD`)
     - `name_he` (required), `name_en`/`name_ru` (optional; the viewer's `decodePoints` already falls back to
       `name_he`)
     - `locality_code`
     - numeric class fields
     - WGS84, 5 decimals
   - Add `featureType` (and optionally `officialTerm`) to `PointsLayer`. Points have no level, so there is nowhere else
     for "School / בית ספר / Школа".
   - Add `searchable` behaviour: the viewer already indexes points as `layer:<id>`.
   - Document the clustering and co-located-points rule.
4. **Optional: authorities with 2024 membership.** This is a dissolve of the same SA polygons by bycode2024 status,
   giving 259 authorities (+ Tzur Hadassa, + Sha'ar Shomron). The level id convention `<kind>-<vintage>` means
   "boundary vintage", and the polygons are still SA-2011, so naming it `local-authorities-2024` would blur that.
   **Open question.** For v1 I recommend aggregating to the existing 2011 authorities with a note.
5. **No change needed** for categorical/stepped classification, missing-data semantics or attribution. All four
   datasets fit `Categorical | Stepped` with numeric records.

## 6. Recommended build order

| # | Item | Effort | Why this order |
|---|---|---|---|
| 1 | **Peripherality 2020**: t1 → `local-authorities-2011`, t2 → `localities-2011` | **S** (½–1 day) | No contract change. 100% joins. First dataset on `localities-2011`. Proves "second dataset on the same levels". |
| 2 | **Contract: `measure` for several layers per dataset** (§5.1), plus viewer grouping and tests | S–M (1–2 days) | Needed by everything after this |
| 3 | **Population 2024**: size / growth / group / type on `localities-2011`, aggregates on `local-authorities-2011` | **S–M** (1–2 days) | Exercises §5.1 on known geometry. Its caveats (§2.3–2.4) are small and documentable. |
| 4 | **Census 2022 at locality level** (1184/1185 on `localities-2011`) | S (1 day) | Cheap win before the new level. Same parser as step 6. |
| 5 | **Schools**: points layer (stream, stage) | **M** (2–4 days) | First `PointsLayer`. Contract spec (§5.3), clustering, Hebrew-only names. Independent of 1–4. |
| 6 | **`statistical-areas-2022` + Census 2022 SA layers** | **L** (1–2 weeks) | New geometry level, invalid-polygon fixes, combined SAs, names via key, 5–9 layers, size budget (+0.6 MB gzipped) |

I'd push back on doing the census first, even though it is the most valuable layer. It needs §5.1 and §5.2 together
plus the biggest download and repo footprint, so it carries the most risk. Steps 1–4 de-risk it.

## 7. Terminology (proposals; the owner should review he/ru)

**No new level kind is needed.** `statistical-areas-2022` reuses `statistical-areas`, and points layers have no
level. New wording is needed for dataset titles, measures and the points feature type:

| Item | he | en | ru | Uncertainty |
|---|---|---|---|---|
| Dataset | מדד פריפריאליות 2020 | Peripherality index 2020 | Индекс периферийности 2020 | "периферийность" vs "удалённость от центра": which do Russian-language Israeli media use? |
| Peripherality note | 1 = הכי פריפריאלי, 10 = הכי מרכזי | 1 = most peripheral, 10 = most central | 1 = самая периферия, 10 = самый центр | ru phrasing |
| Dataset | אוכלוסייה 2024 | Population 2024 | Население 2024 | — |
| Measures | גודל אוכלוסייה · גידול 2024–2022 · קבוצת אוכלוסייה · צורת יישוב | Population · Growth 2022–24 · Population group · Locality type | Численность · Прирост 2022–24 · Группа населения · Тип населённого пункта | "קבוצת אוכלוסייה" is the CBS term; "צורת יישוב" might read too technical, maybe "סוג יישוב" |
| Dataset | מפקד האוכלוסין 2022 | Census 2022 | Перепись населения 2022 | — |
| Measures | גיל חציוני · בני 65 ומעלה · בעלי תואר אקדמי · שכר חציוני של שכירים · גרים בשכירות · רמת דתיות של משק הבית | Median age · Aged 65+ · Academic degree · Median employee wage · Renting · Household religiosity | Медианный возраст · 65 лет и старше · С высшим образованием · Медианная зарплата наёмных работников · Снимают жильё · Религиозность домохозяйства | "академическая степень" would be wrong in ru; "высшее образование" is the natural term but slightly broader |
| Religiosity classes | חילוני · מסורתי · דתי · חרדי | Secular · Traditional · Religious · Haredi | Светские · Традиционные · Религиозные · Харедим (ультраортодоксы) | ru for חרדי |
| Dataset / feature | בתי ספר / בית ספר | Schools / School | Школы / Школа | the file also has yeshivot ketanot and talmud torah: is "Школы" OK? |
| Stream classes | ממלכתי · ממלכתי-דתי · חרדי · ערבי · דרוזי וצ'רקסי | State · State-religious · Haredi · Arab · Druze & Circassian | Государственные · Государственно-религиозные · Харедимные · Арабские · Друзские и черкесские | ru for ממ"ד and חרדי |
| Stages | יסודי · חטיבת ביניים · תיכון · רב-שלבי | Primary · Middle · High school · Multi-stage | Начальная · Средняя (7–9) · Старшая (10–12) · Многоступенчатая | — |

## 8. Risks and open questions

1. **Peripherality is 2020 data.** It reflects the 2020 municipal map and population. The next edition (2025 data) is
   likely 2027+ **(unverified)**.
2. **Population series breaks** (§2.3): Census rebasing, foreigners from 2023, Lebanese reclassification, no Jews-only
   column in 2024. Growth from small localities is noise. 2023–24 displacement **(unverified)**.
3. **Locality changes after 2021** don't fit the 2011-vintage geometry:
   - 5 new localities (16,686 residents)
   - the Kokhav Ya'akov / Tel Zion split
   - 2 new authorities (Tzur Hadassa, Sha'ar Shomron)

   Decide between merge-and-note (recommended) and a 2024-membership authority level.
4. **Census at SA level is sample-based.** Values are rounded. 193 combined rows cover 240 extra polygons, 171 SAs are
   suppressed, and CBS's own combined and not-published lists disagree with the data in 26 cases. The 3 Arab/Druze
   localities without SA rows and the Bedouin dispersion need the "no data" legend.
5. **SA-2022 neighbourhood names don't exist.** Names inherited through the key are approximate.
6. **SA-2022 geometry:** 5 invalid polygons (fixable). About +0.6 MB gzipped per page load if the level is loaded
   eagerly. Check how the viewer loads levels; ideally lazily per active layer **(not checked)**.
7. **Schools:**
   - no current student counts, no English names, no open Bagrut
   - 309 centroid-placed schools; 1,049 schools at 439 points after rounding to ~1 m (956 at 410 exact source
     coordinates)
   - unknown update cadence
   - licence is "not specified", so the site licence applies
8. **Repo footprint.** About 45 MB of new raw files are untracked and **not gitignored**: the census summaries are
   7.9 + 7.8 MB, the MoE files 21 MB.
   - Proposal: commit only what the pipeline reads:
     - peripherality t1+t2 (0.37 MB)
     - `bycode2024.xlsx` (0.37 MB)
     - `bycode2022.xlsx` (0.34 MB, for growth)
     - the census EN summary (7.9 MB), or the 1 MB 60-column `mifkad-2022.xlsx` if 60 variables are enough
     - the SA-2022 zip and key (9 MB)
     - `mosdot_edu.csv` (10.9 MB)
   - Ignore the rest, including PDFs, the HE duplicate, `mosdot.xlsx` and the shkifut samples.
   - `cbs-local-authorities-2022-publication-1957/` (a PDF zip and an appendix list) turned out to be useless. The
     per-authority profile data for 2023 is PDFs only. The master xlsx of that publication was not located
     **(unverified)**.
9. **data.gov.il hosts.** Resource URLs in CKAN metadata point to `aws-e.data.gov.il`, which redirects to Google OAuth.
   `RawFile.url` must use `https://data.gov.il/dataset/<pkg>/resource/<res>/download/<file>` with a browser UA.

## 9. Raw files added in this spike (`data/raw/`, nothing existing was modified)

| Path | Bytes | sha256 (first 12) |
|---|---|---|
| `cbs-peripherality-2020/24_22_420t1.xlsx` | 100,611 | 280f58d8105a (**used, committed**) |
| `cbs-peripherality-2020/24_22_420t2.xlsx` | 266,599 | 7339b6d2fa5f (**used, committed**) |
| `cbs-peripherality-2020/24_22_420t3.xlsx` | 184,737 | cad6d3f16085 |
| `cbs-peripherality-2020/24_22_420t4.xls`, `24_22_420b.pdf` | 89,088 / 279,598 | |
| `cbs-peripherality-2020-publication-1917/table_01–03.xlsx`, `intro_*.pdf`, `nispah_*.pdf` | 64–486 KB | |
| `cbs-localities-file/bycode2022.xlsx` | 341,988 | b58b54759d18 (**used, committed**) |
| `cbs-localities-file/bycode2023Sofi.xlsx` | 318,412 | a372c2b45e62 |
| `cbs-localities-file/bycode2024.xlsx` | 370,654 | a021c6a15186 (**used, committed**) |
| `cbs-localities-file/index2024.xlsx`, `changes-1948-2024.xlsx`, `change2024-2023Araii-2023Sofi.xlsx`, `intro.pdf` | 27–302 KB | |
| `cbs-census-2022/summary_geo_units_census2022_en.xlsx` | 7,863,230 | 2db3c5bc0cf1 |
| `cbs-census-2022/summary_geo_units_census2022_he.xlsx` | 7,829,964 | 75a00c88f636 |
| `cbs-census-2022/mifkad-2022.xlsx` | 1,140,766 | 84d0a48b75c8 (**used, committed**) |
| `cbs-census-2022/combined_statistical_areas.xlsx` | 44,217 | c89b5b42a2a3 |
| `cbs-census-2022/sa_not_published_census2022.xlsx` | 50,505 | c0982c770e74 (**used, committed**) |
| `cbs-census-2022/` other files (§3.2) | | |
| `datagov-census-2022/*.csv` (3 files) | 25 KB – 949 KB | |
| `cbs-population-sa2022-2023/population_by_locality_sa_age_end2023.xlsx` | 1,405,937 | 1f13c72f4f65 |
| `cbs-local-authorities-2022-publication-1957/2.zip`, `list02.xlsx` | 980,841 / 33,344 | not useful |
| `datagov-moe-mosdot-edu/mosdot_edu.csv` | 10,916,608 | f048c4de263f (**used, committed**) |
| `datagov-moe-mosdot/mosdot.xlsx` | 10,246,108 | e2f64487c196 |
| `datagov-moe-coordinates/moe_mosdot_coordinates.csv` | 2,582,678 | c9e03d89950f |
| `moe-shkifut-api-samples/lists.json`, `mosad_540070_2024.json` | 869,133 / 1,123,061 | API probes; don't commit |
