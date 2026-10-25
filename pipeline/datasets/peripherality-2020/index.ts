// CBS peripherality index 2020 (docs/data-sources-2.md §1): authorities on local-authorities-2011 and every
// locality (cities included) on localities-2011. No statistical-area level exists for this index.
import type { LevelId, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { isRegionalCouncilCode } from '../../lib/keys.ts';
import { raw } from '../../lib/paths.ts';
import { datasetTerms } from '../../terminology.ts';
import { clusterLayer } from '../cluster-index.ts';
import { parseAuthorities, parseLocalities, type PeripheralityRecord } from './parse.ts';

const ID = 'peripherality-2020';
const DIR = 'cbs-peripherality-2020';
const RELEASE = 'https://www.cbs.gov.il/he/mediarelease/DocLib/2022/420';

export const files = {
  authorities: `${DIR}/24_22_420t1.xlsx`,
  localities: `${DIR}/24_22_420t2.xlsx`,
};

const LEVELS = {
  'local-authorities-2011': 'local-authorities',
  'localities-2011': 'localities',
} as const satisfies Partial<Record<LevelId, string>>;
type PeriLevel = keyof typeof LEVELS;

/**
 * ColorBrewer YlGn (sequential, colourblind-safe): cluster 1 (most peripheral) pale → 10 (most central) dark green.
 * Peripherality is one-directional with no meaningful midpoint, so a sequential scale fits; its hues are disjoint
 * from the SES RdYlBu so the two indices can't be confused.
 */
const PALETTE = 'YlGn';

const source: Source = {
  name: {
    he: 'הלמ"ס, מדד הפריפריאליות של יישובים ושל רשויות מקומיות, 2020',
    en: 'CBS, Peripherality Index of Localities and Local Authorities, 2020',
    ru: 'ЦСБ, индекс периферийности населённых пунктов и органов местной власти, 2020',
  },
  url: 'https://www.cbs.gov.il/he/mediarelease/Pages/2022/%D7%9E%D7%93%D7%93-%D7%94%D7%A4%D7%A8%D7%99%D7%A4%D7%A8%D7%99%D7%90%D7%9C%D7%99%D7%95%D7%AA-%D7%A9%D7%9C-%D7%99%D7%99%D7%A9%D7%95%D7%91%D7%99%D7%9D-%D7%95%D7%A9%D7%9C-%D7%A8%D7%A9%D7%95%D7%99%D7%95%D7%AA-%D7%9E%D7%A7%D7%95%D7%9E%D7%99%D7%95%D7%AA,-2020.aspx',
  license: 'CBS open licence',
  licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  citation:
    'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), מדד הפריפריאליות של יישובים ושל רשויות מקומיות 2020 (הודעה לתקשורת 420/2022), ' +
    '(נשלף 25.10.2026), זמין ב: https://www.cbs.gov.il/he/mediarelease/DocLib/2022/420/, הועתק והופץ כמות שהוא בהתאם ' +
    'לרישיון השימוש של הלמ"ס בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
};

const dataPath = (level: PeriLevel) => `datasets/${ID}/${level}.json`;

const pick = <T extends PeripheralityRecord>(records: T[], fields: (keyof T)[]) =>
  Object.fromEntries(records.map((r) => [r.code, Object.fromEntries(fields.map((f) => [f, r[f]]))]));

const peripheralityModule: DatasetModule = {
  id: ID,
  info: { title: datasetTerms(ID).title },
  rawFiles: [
    {
      path: files.authorities,
      url: `${RELEASE}/24_22_420t1.xlsx`,
      sha256: '280f58d8105aa0c4eb7263ea6cd4d69a734d5ba5efd9778f044c2b2efe063057',
    },
    {
      path: files.localities,
      url: `${RELEASE}/24_22_420t2.xlsx`,
      sha256: '7339b6d2fa5fdc1d55ff1bab6b89bfaab210720fcac379fc8cc8b611ee6bbc8e',
    },
  ],

  async build({ geometryCodes }) {
    const authorities = await parseAuthorities(raw(files.authorities));
    const localities = await parseLocalities(raw(files.localities));
    const codesOf = (rs: PeripheralityRecord[]) => rs.map((r) => r.code);
    const rc = (code: string) => isRegionalCouncilCode(Number(code));
    const joins = [
      join('peripherality: local authorities', 'local-authorities-2011', codesOf(authorities), geometryCodes['local-authorities-2011'], [
        { label: 'municipalities + local councils', codes: codesOf(authorities).filter((c) => !rc(c)) },
        { label: 'regional councils', codes: codesOf(authorities).filter(rc) },
      ]),
      join('peripherality: localities', 'localities-2011', codesOf(localities), geometryCodes['localities-2011']),
    ];

    const layer = (level: PeriLevel, rankTotal: number, distance: boolean) =>
      clusterLayer({
        dataset: ID,
        id: `${ID}-${LEVELS[level]}`,
        level,
        data: dataPath(level),
        palette: PALETTE,
        rankTotal,
        extraFields: [
          ...(distance ? [{ field: 'distance_km', format: { type: 'decimal' as const, decimals: 1 } }] : []),
          { field: 'population', format: { type: 'integer' } },
        ],
        source,
      });

    return {
      files: {
        [dataPath('local-authorities-2011')]: pick(authorities, ['cluster', 'index', 'rank', 'population']),
        [dataPath('localities-2011')]: pick(localities, ['cluster', 'index', 'rank', 'distance_km', 'population']),
      },
      layers: [layer('local-authorities-2011', authorities.length, false), layer('localities-2011', localities.length, true)],
      joins,
    };
  },
};

export default peripheralityModule;
