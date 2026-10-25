import type { LevelId, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { raw } from '../../lib/paths.ts';
import { datasetInfo, datasetTerms } from '../../terminology.ts';
import { clusterLayer } from '../cluster-index.ts';
import { parseAuthorities, parseLocalities, parseStatisticalAreas, type IndexRecord } from './parse.ts';

const ID = 'ses-2021';
const DIR = 'cbs-socioeconomic-2021';
const RELEASE = 'https://www.cbs.gov.il/he/mediarelease/DocLib/2024/230';

export const files = {
  authorities: `${DIR}/24_24_230t1.xlsx`,
  localities: `${DIR}/24_24_230t3.xlsx`,
  statisticalAreas: `${DIR}/24_24_230t4.xlsx`,
};

/** The three CBS tables map to three geometry levels; layer ids stay short. */
const LEVELS = {
  'local-authorities-2011': 'local-authorities',
  'rc-localities-2011': 'localities',
  'statistical-areas-2011': 'statistical-areas',
} as const satisfies Partial<Record<LevelId, string>>;
type SesLevel = keyof typeof LEVELS;

const source: Source = {
  name: {
    he: 'הלמ"ס, אפיון יחידות גאוגרפיות וסיווגן לפי הרמה החברתית-כלכלית של האוכלוסייה בשנת 2021',
    en: 'CBS, Characterization and Classification of Geographical Units by the Socio-Economic Level of the Population, 2021',
    ru: 'ЦСБ, характеристика и классификация географических единиц по социально-экономическому уровню населения, 2021',
  },
  url: 'https://www.cbs.gov.il/en/mediarelease/Pages/2024/Characterization-and-Classification-of-Geographical-Units-by-the-Socio-Economic-Level-of-the-Population-2021.aspx',
  license: 'CBS open licence',
  licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  citation:
    'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), אפיון יחידות גאוגרפיות וסיווגן לפי הרמה החברתית-כלכלית של האוכלוסייה בשנת 2021 ' +
    '(הודעה לתקשורת 230/2024), (נשלף 24.10.2026), זמין ב: https://www.cbs.gov.il/he/mediarelease/DocLib/2024/230/, ' +
    'הועתק והופץ כמות שהוא בהתאם לרישיון השימוש של הלמ"ס בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
};

/** Dataset title (from pipeline/terminology.ts); each layer title is this plus the level's plain name. */
export const DATASET_TITLE = datasetTerms(ID).title;

const dataPath = (level: SesLevel) => `datasets/${ID}/${level}.json`;

const values = (records: IndexRecord[]) =>
  Object.fromEntries(records.map(({ code, cluster, index, rank, population }) => [code, { cluster, index, rank, population }]));

const sesModule: DatasetModule = {
  id: ID,
  info: datasetInfo(ID, Object.keys(LEVELS) as SesLevel[]),
  rawFiles: [
    {
      path: files.authorities,
      url: `${RELEASE}/24_24_230t1.xlsx`,
      sha256: 'c512a1961af7025cdd8e4b33bba586616efa19e4470be9526b6315669a19aee9',
    },
    {
      path: files.localities,
      url: `${RELEASE}/24_24_230t3.xlsx`,
      sha256: '5c4c571e39d1bbc2e7bc6671beffd2f6e2ead0115b758aaebbeefa732803df73',
    },
    {
      path: files.statisticalAreas,
      url: `${RELEASE}/24_24_230t4.xlsx`,
      sha256: 'ce0a6ee5a04a7ec6818cc520c2bddb29afd5f3fde2812a85cca5b464cc1b302e',
    },
  ],

  async build({ geometryCodes }) {
    const authorities = await parseAuthorities(raw(files.authorities));
    const byLevel: Record<SesLevel, IndexRecord[]> = {
      'local-authorities-2011': authorities,
      'rc-localities-2011': await parseLocalities(raw(files.localities)),
      'statistical-areas-2011': await parseStatisticalAreas(raw(files.statisticalAreas)),
    };
    const codesOf = (rs: IndexRecord[]) => rs.map((r) => r.code);
    const joins = [
      join('statistical areas', 'statistical-areas-2011', codesOf(byLevel['statistical-areas-2011']), geometryCodes['statistical-areas-2011']),
      join('regional-council localities', 'rc-localities-2011', codesOf(byLevel['rc-localities-2011']), geometryCodes['rc-localities-2011']),
      join('local authorities', 'local-authorities-2011', codesOf(authorities), geometryCodes['local-authorities-2011'], [
        { label: 'municipalities + local councils', codes: codesOf(authorities.filter((a) => a.kind !== 'regional-council')) },
        { label: 'regional councils', codes: codesOf(authorities.filter((a) => a.kind === 'regional-council')) },
      ]),
    ];

    const levels = Object.keys(LEVELS) as SesLevel[];
    return {
      files: Object.fromEntries(levels.map((l) => [dataPath(l), values(byLevel[l])])),
      layers: levels.map((l) =>
        clusterLayer({
          dataset: ID,
          id: `${ID}-${LEVELS[l]}`,
          level: l,
          data: dataPath(l),
          // ColorBrewer RdYlBu (colourblind-safe, owner's choice): cluster 1 (lowest socio-economic level) red → 10 blue.
          palette: 'RdYlBu',
          rankTotal: byLevel[l].length,
          extraFields: [{ field: 'population', format: { type: 'integer' } }],
          source,
        }),
      ),
      joins,
    };
  },
};

export default sesModule;
