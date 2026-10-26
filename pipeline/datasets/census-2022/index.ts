// Census 2022 (docs/data-sources-2.md §3): six measures on localities-2011 and on statistical-areas-2022.
import type { I18n, LevelId, PopupFormat, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { colorbrewer, OKABE_ITO } from '../../lib/palettes.ts';
import { raw } from '../../lib/paths.ts';
import { combinedSaNote, datasetInfo } from '../../terminology.ts';
import { measureKit } from '../measures.ts';
import { parseCensusLocalities, parseCensusSas, parseNotPublished } from './parse.ts';

const ID = 'census-2022';
const L = 'localities-2011';
const SA = 'statistical-areas-2022';

/**
 * CBS's 60-column "selected data by localities and SAs" (1.1 MB) rather than the 7.9 MB summary file: it has every
 * measure at locality level for all 1,185 localities, from CBS directly (not the data.gov.il copy). The summary file
 * would add only the per-class religiosity shares.
 */
export const FILE = 'cbs-census-2022/mifkad-2022.xlsx';
const URL = 'https://www.cbs.gov.il/he/publications/LochutTlushim/2024/%D7%9E%D7%A4%D7%A7%D7%93-2022.xlsx';

/** CBS's list of SA-2022 areas whose census data is not published (open land, industry…), 181 rows. */
export const NOT_PUBLISHED_FILE = 'cbs-census-2022/sa_not_published_census2022.xlsx';
const NOT_PUBLISHED_URL =
  'https://www.cbs.gov.il/he/publications/LochutTlushim/2024/' +
  encodeURIComponent('רשימת אזורים סטטיסטיים שעבורם לא מפורסמים נתוני מפקד 2022 .xlsx');

/** Population groups in the census with no polygon on our levels. */
const NO_POLYGON: Record<string, string> = {
  '1997': 'Residents outside localities, Southern District (Bedouin dispersion): a population group, not a place',
};

/**
 * Cities divided into SA-2022 for which the census publishes locality rows only; their SA polygons are "no data".
 * The build fails if another divided city has no SA rows, or one of these gains some.
 */
export const LOCALITY_ROWS_ONLY: Record<string, string> = {
  492: 'Deir Hanna',
  504: 'Kabul',
  4201: 'Majdal Shams',
};

/**
 * Stepped breaks, round numbers near the locality deciles (p10 / p25 / p50 / p75 / p90 in comments). The SA layers
 * use the same breaks, so a measure reads the same on both levels; SA deciles (§3.7) spread wider, so more SAs land
 * in the end classes (median age p90 43, wage p10 67.8k).
 */
export const BREAKS = {
  'median-age': [20, 25, 30, 35, 40], // 19 / 27 / 32 / 35 / 38 years
  'aged-65': [5, 10, 15, 20, 25], // 3.4 / 6.7 / 10.4 / 14.7 / 18.7 %
  academic: [10, 20, 30, 40, 50], // 12.7 / 20.1 / 33 / 41.4 / 47.5 %
  wage: [80000, 100000, 120000, 140000, 160000], // 80.6k / 97.9k / 118.7k / 143.7k / 167.3k ₪
  renting: [10, 20, 30, 40, 50], // 8.5 / 18.5 / 27.3 / 34.4 / 42.3 %
} as const;

/**
 * Main household religiosity, nominal: CBS's own category for the locality. Okabe-Ito colours, chosen so the
 * adjacent levels (traditional / religious / Haredi) are far apart in hue.
 */
export const RELIGIOSITY_COLORS: Record<number, string> = {
  1: OKABE_ITO.skyBlue,
  2: OKABE_ITO.yellow,
  3: OKABE_ITO.bluishGreen,
  4: OKABE_ITO.reddishPurple,
  6: OKABE_ITO.orange,
};

const source: Source = {
  name: {
    he: 'הלמ"ס, מפקד האוכלוסין והדיור 2022 – נתונים נבחרים לפי יישובים ואזורים סטטיסטיים',
    en: 'CBS, Population and Housing Census 2022 – selected data by localities and statistical areas',
    ru: 'ЦСБ, перепись населения и жилья 2022 – избранные данные по населённым пунктам и статистическим районам',
  },
  url: URL,
  license: 'CBS open licence',
  licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  citation:
    'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), מפקד האוכלוסין והדיור 2022 – נתונים נבחרים, לפי יישובים ואזורים סטטיסטיים, ' +
    '(נשלף 25.10.2026), זמין ב: https://www.cbs.gov.il/he/publications/LochutTlushim/2024/, הועתק והופץ כמות שהוא ' +
    'בהתאם לרישיון השימוש של הלמ"ס בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
};

const kit = measureKit(ID, source);

/**
 * One popup for every census layer, in reading order: who lives here (size, age), then education and income, then
 * housing and religiosity. Seven short rows, which still fits a phone popup.
 */
const POPUP = kit.popup([
  ['population', { type: 'integer' }],
  ['age_median', { type: 'integer' }],
  ['age65_pct', { type: 'percent', decimals: 1 }],
  ['academic_pct', { type: 'percent', decimals: 1 }],
  ['wage_median', { type: 'currency', currency: 'ILS', decimals: 0 }],
  ['rent_pct', { type: 'percent', decimals: 1 }],
  ['religiosity', { type: 'category', labels: kit.classLabels('religiosity') } satisfies PopupFormat],
]);

const census: DatasetModule = {
  id: ID,
  info: datasetInfo(ID, [L, SA]),
  rawFiles: [
    { path: FILE, url: URL, sha256: '84d0a48b75c845f2093b5fbc213e346036d16ec21b0c1286a09b1be709283d26' },
    { path: NOT_PUBLISHED_FILE, url: NOT_PUBLISHED_URL, sha256: 'c0982c770e741ff0e66c263c3cdfa8493c525a112490fe4bdd0e1523b0273893' },
  ],

  async build({ geometryCodes }) {
    const rows = await parseCensusLocalities(raw(FILE));
    const codes = geometryCodes[L];
    const values = Object.fromEntries(
      rows
        .filter((r) => codes.has(String(r.code)))
        .sort((a, b) => a.code - b.code)
        .map(({ code, ...rest }) => [String(code), rest]),
    );

    // SA level: each row on its own SA, and copied onto the SAs folded into it. Those SAs get a per-feature note
    // saying the figures (population included) are the group's.
    const saRows = await parseCensusSas(raw(FILE));
    const saCodes = geometryCodes[SA];
    const saValues: Record<string, Record<string, number>> = {};
    const combinedNotes: Record<string, I18n> = {};
    for (const { code, locality, members, ...record } of saRows) {
      for (const c of [code, ...members]) {
        if (saValues[c]) throw new Error(`census SA ${c} has two rows`);
        saValues[c] = record;
        if (members.length) combinedNotes[c] = combinedSaNote(members.length + 1);
      }
    }
    const sortedSaValues = Object.fromEntries(Object.entries(saValues).sort(([a], [b]) => Number(a) - Number(b)));

    // An SA polygon without a record must be on CBS's not-published list or in a city with locality rows only.
    const notPublished = await parseNotPublished(raw(NOT_PUBLISHED_FILE));
    const locality = (c: string) => String(Math.floor(Number(c) / 10000));
    const citiesWithRows = new Set(saRows.map((r) => String(r.locality)));
    const noData = [...saCodes].filter((c) => !saValues[c]);
    const unexplained = noData.filter((c) => !notPublished.has(c) && !LOCALITY_ROWS_ONLY[locality(c)]);
    if (unexplained.length) throw new Error(`census SA: ${unexplained.length} SA-2022 polygons with no row and not on CBS's not-published list: ${unexplained.join(', ')}`);
    const citiesWithout = [...new Set([...saCodes].map(locality))].filter((l) => !citiesWithRows.has(l)).sort();
    if (citiesWithout.join() !== Object.keys(LOCALITY_ROWS_ONLY).sort().join()) {
      throw new Error(`census SA: divided cities without SA rows are ${citiesWithout.join(', ')}; LOCALITY_ROWS_ONLY lists ${Object.keys(LOCALITY_ROWS_ONLY).join(', ')}`);
    }
    const publishedAnyway = [...notPublished].filter((c) => saValues[c]).length;
    const memberCodes = saRows.flatMap((r) => r.members);

    const palette = colorbrewer('YlOrBr6');
    const layersOn = (level: LevelId) => {
      const stepped = (measure: keyof typeof BREAKS, field: string) =>
        kit.layer(level, measure, field, kit.stepped(measure, level, [...BREAKS[measure]], palette), POPUP);
      return [
        stepped('median-age', 'age_median'),
        stepped('aged-65', 'age65_pct'),
        stepped('academic', 'academic_pct'),
        stepped('wage', 'wage_median'),
        stepped('renting', 'rent_pct'),
        kit.layer(level, 'religiosity', 'religiosity', kit.nominal('religiosity', level, RELIGIOSITY_COLORS), POPUP),
      ];
    };
    return {
      files: { [`datasets/${ID}/${L}.json`]: values, [`datasets/${ID}/${SA}.json`]: sortedSaValues },
      layers: [...layersOn(L), ...layersOn(SA)],
      featureNotes: { [SA]: Object.fromEntries(Object.entries(combinedNotes).sort(([a], [b]) => Number(a) - Number(b))) },
      joins: [
        join('census: coded locality rows', L, rows.map((r) => String(r.code)), codes, [], NO_POLYGON),
        join('census: SA rows', SA, [...saRows.map((r) => r.code), ...memberCodes], saCodes, [
          { label: 'own rows', codes: saRows.map((r) => r.code) },
          { label: 'folded into a combined row', codes: memberCodes },
        ]),
      ],
      notes: [
        `census SA-2022: ${saRows.length} rows (${saRows.filter((r) => r.members.length).length} combined, covering ${memberCodes.length} more SAs); ` +
          `${noData.length} of ${saCodes.size} polygons without data: ${noData.filter((c) => notPublished.has(c)).length} on CBS's not-published list, ` +
          `${noData.filter((c) => !notPublished.has(c) && LOCALITY_ROWS_ONLY[locality(c)]).length} more in cities with locality rows only (${Object.values(LOCALITY_ROWS_ONLY).join(', ')}); ` +
          `${publishedAnyway} of ${notPublished.size} not-published SAs have data rows anyway (rows win)`,
      ],
    };
  },
};

export default census;
