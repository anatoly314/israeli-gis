import type { ChoroplethLayer, Classification, I18n, LevelId, PopupField, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { raw } from '../../lib/paths.ts';
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

// viridis, 10 stops: cluster 1 (lowest socio-economic level) dark → cluster 10 (highest) light.
const PALETTE = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];

const NOT_CALCULATED: Record<SesLevel, I18n> = {
  'local-authorities-2011': {
    he: 'הלמ"ס לא חישבה מדד לרשות זו.',
    en: 'CBS did not calculate the index for this authority.',
    ru: 'ЦСБ не рассчитывало индекс для этого органа власти.',
  },
  'rc-localities-2011': {
    he: 'הלמ"ס לא חישבה מדד ליישוב זה (פחות מ-120 תושבים, יישוב מוסדי או שאינו יישוב מגורים).',
    en: 'CBS did not calculate the index for this locality (fewer than 120 residents, institutional or non-residential).',
    ru: 'ЦСБ не рассчитывало индекс для этого населённого пункта (менее 120 жителей, учреждение или нежилая территория).',
  },
  'statistical-areas-2011': {
    he: 'הלמ"ס לא חישבה מדד לאזור זה: פחות מ-120 תושבים, אזור שאינו למגורים, או עיר שאין לה נתונים ברמת אזור סטטיסטי (בעיקר יישובים ערביים ודרוזיים).',
    en: 'CBS did not calculate the index for this area: fewer than 120 residents, a non-residential area, or a city without statistical-area data (mostly Arab and Druze cities).',
    ru: 'ЦСБ не рассчитывало индекс для этого района: менее 120 жителей, нежилая территория или город без данных на уровне статистических районов (в основном арабские и друзские города).',
  },
};

function classification(level: SesLevel): Classification {
  return {
    type: 'categorical',
    classes: PALETTE.map((color, i) => ({
      value: i + 1,
      color,
      label: { he: `אשכול ${i + 1}`, en: `Cluster ${i + 1}`, ru: `Кластер ${i + 1}` },
    })),
    missing: {
      color: '#c8c8c8',
      label: { he: 'לא חושב', en: 'Not calculated', ru: 'Не рассчитан' },
      description: NOT_CALCULATED[level],
    },
    note: {
      he: '1 – הרמה החברתית-כלכלית הנמוכה ביותר, 10 – הגבוהה ביותר',
      en: '1 = lowest socio-economic level, 10 = highest',
      ru: '1 – самый низкий социально-экономический уровень, 10 – самый высокий',
    },
  };
}

function popup(rankTotal: number): PopupField[] {
  return [
    { field: 'cluster', format: { type: 'integer' }, label: { he: 'אשכול', en: 'Cluster', ru: 'Кластер' } },
    { field: 'index', format: { type: 'decimal', decimals: 3 }, label: { he: 'ערך מדד', en: 'Index value', ru: 'Значение индекса' } },
    { field: 'rank', format: { type: 'rank', total: rankTotal }, label: { he: 'דירוג', en: 'Rank', ru: 'Место' } },
    {
      field: 'population',
      format: { type: 'integer' },
      label: { he: 'אוכלוסיית המדד', en: 'Index population', ru: 'Население (для индекса)' },
    },
  ];
}

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

const attribution: I18n = {
  he: 'מדד חברתי-כלכלי 2021: הלמ"ס',
  en: 'Socio-Economic Index 2021: CBS Israel',
  ru: 'Социально-экономический индекс 2021: ЦСБ Израиля',
};

const TITLE: Record<SesLevel, I18n> = {
  'local-authorities-2011': {
    he: 'מדד חברתי-כלכלי 2021 – רשויות מקומיות',
    en: 'Socio-economic index 2021 – local authorities',
    ru: 'Социально-экономический индекс 2021 – органы местной власти',
  },
  'rc-localities-2011': {
    he: 'מדד חברתי-כלכלי 2021 – יישובים במועצות אזוריות',
    en: 'Socio-economic index 2021 – localities in regional councils',
    ru: 'Социально-экономический индекс 2021 – населённые пункты региональных советов',
  },
  'statistical-areas-2011': {
    he: 'מדד חברתי-כלכלי 2021 – אזורים סטטיסטיים',
    en: 'Socio-economic index 2021 – statistical areas',
    ru: 'Социально-экономический индекс 2021 – статистические районы',
  },
};

const dataPath = (level: SesLevel) => `datasets/${ID}/${level}.json`;

function layer(level: SesLevel, rankTotal: number): ChoroplethLayer {
  return {
    id: `${ID}-${LEVELS[level]}`,
    dataset: ID,
    kind: 'choropleth',
    level,
    title: TITLE[level],
    data: dataPath(level),
    valueField: 'cluster',
    classification: classification(level),
    popup: popup(rankTotal),
    attribution,
    source,
  };
}

const values = (records: IndexRecord[]) =>
  Object.fromEntries(records.map(({ code, cluster, index, rank, population }) => [code, { cluster, index, rank, population }]));

const sesModule: DatasetModule = {
  id: ID,
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
      layers: levels.map((l) => layer(l, byLevel[l].length)),
      joins,
    };
  },
};

export default sesModule;
