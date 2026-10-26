// Census 2022 at locality level (docs/data-sources-2.md §3): six measures on localities-2011. The statistical-area
// level (SA-2022 geometry) is a later step.
import type { PopupFormat, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { colorbrewer, OKABE_ITO } from '../../lib/palettes.ts';
import { raw } from '../../lib/paths.ts';
import { datasetInfo } from '../../terminology.ts';
import { measureKit } from '../measures.ts';
import { parseCensusLocalities } from './parse.ts';

const ID = 'census-2022';
const L = 'localities-2011';

/**
 * CBS's 60-column "selected data by localities and SAs" (1.1 MB) rather than the 7.9 MB summary file: it has every
 * measure at locality level for all 1,185 localities, from CBS directly (not the data.gov.il copy). The summary file
 * would add only the per-class religiosity shares.
 */
export const FILE = 'cbs-census-2022/mifkad-2022.xlsx';
const URL = 'https://www.cbs.gov.il/he/publications/LochutTlushim/2024/%D7%9E%D7%A4%D7%A7%D7%93-2022.xlsx';

/** Population groups in the census with no polygon on our levels. */
const NO_POLYGON: Record<string, string> = {
  '1997': 'Residents outside localities, Southern District (Bedouin dispersion): a population group, not a place',
};

/**
 * Stepped breaks, round numbers near the locality deciles (p10 / p25 / p50 / p75 / p90 in comments). Same breaks the
 * report proposes for the SA level where they fit, so the later SA layers can share legends.
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
  info: datasetInfo(ID, [L]),
  rawFiles: [{ path: FILE, url: URL, sha256: '84d0a48b75c845f2093b5fbc213e346036d16ec21b0c1286a09b1be709283d26' }],

  async build({ geometryCodes }) {
    const rows = await parseCensusLocalities(raw(FILE));
    const codes = geometryCodes[L];
    const values = Object.fromEntries(
      rows
        .filter((r) => codes.has(String(r.code)))
        .sort((a, b) => a.code - b.code)
        .map(({ code, ...rest }) => [String(code), rest]),
    );
    const palette = colorbrewer('YlOrBr6');
    const stepped = (measure: keyof typeof BREAKS, field: string) =>
      kit.layer(L, measure, field, kit.stepped(measure, L, [...BREAKS[measure]], palette), POPUP);
    return {
      files: { [`datasets/${ID}/${L}.json`]: values },
      layers: [
        stepped('median-age', 'age_median'),
        stepped('aged-65', 'age65_pct'),
        stepped('academic', 'academic_pct'),
        stepped('wage', 'wage_median'),
        stepped('renting', 'rent_pct'),
        kit.layer(L, 'religiosity', 'religiosity', kit.nominal('religiosity', L, RELIGIOSITY_COLORS), POPUP),
      ],
      joins: [join('census: coded locality rows', L, rows.map((r) => String(r.code)), codes, [], NO_POLYGON)],
    };
  },
};

export default census;
