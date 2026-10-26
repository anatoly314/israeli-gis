// Population 2024 (docs/data-sources-2.md §2): CBS localities file end-2024 on the 2011 geometry, four measures on
// localities-2011 (size, growth, population group, locality type) and two on local-authorities-2011 (size, growth).
import type { Classification, PopupField, PopupFormat, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { authorityCode } from '../../lib/keys.ts';
import { colorbrewer, OKABE_ITO } from '../../lib/palettes.ts';
import { raw } from '../../lib/paths.ts';
import { datasetInfo } from '../../terminology.ts';
import { measureKit } from '../measures.ts';
import { parseLocalities2022, parseLocalities2024, type Locality2024 } from './parse.ts';

const ID = 'population-2024';
const DIR = 'cbs-localities-file';
const DOCLIB = 'https://www.cbs.gov.il/he/publications/DocLib/2019/ishuvim';

export const files = { y2024: `${DIR}/bycode2024.xlsx`, y2022: `${DIR}/bycode2022.xlsx` };

/**
 * Tel Zion (3815) was split from Kokhav Ya'akov (3779) in 2023; our 3779 polygon still covers both, so its 2024
 * figures are added to 3779. Without this, 3779 would show 4,093 residents and a −59% "decline".
 */
const MERGE_INTO: Record<number, number> = { 3815: 3779 };

/** Localities founded or split off after the 2011 geometry; they have no polygon (docs/data-sources-2.md §2.4). */
const NO_POLYGON: Record<string, string> = {
  '3826': "Sha'ar Shomron, local council since 2022 (from Sha'are Tiqwa 3720 + Ez Efrayim 3778)",
  '3815': "Tel Zion, split from Kokhav Ya'akov in 2023; merged into 3779",
  '1362': "Giv'ot Eden, founded after 2021",
  '3864': 'Bet Hogla, founded after 2021',
  '4029': 'Ramat Trump, founded after 2021',
};

/** Authorities created after the 2011 geometry, folded into the authority their localities belonged to then. */
const AUTHORITY_2011: Record<number, number> = {
  1113: 5526, // Tzur Hadassa: local council since 2024, before that in Mateh Yehuda
  3826: 5572, // Sha'ar Shomron: local council since 2022, before that in Shomron
};
const AUTHORITY_REASON: Record<string, string> = {
  '1113': 'Tzur Hadassa (local council since 2024): counted in Mateh Yehuda 5526',
  '3826': "Sha'ar Shomron (local council since 2022): counted in Shomron 5572",
};

/** Growth is shown only where 2022 had at least this many residents; below it, two-year changes are mostly noise. */
export const GROWTH_MIN_BASE = 500;

/**
 * Size breaks. Localities: CBS's own size bands in `צורת יישוב` (2k/5k/10k/20k/50k/100k/200k) plus 500, which splits
 * the ~1,000 small rural localities (median 929). Authorities start at 1,748 residents, so their scale starts at
 * 5,000 and drops 500/2,000; 500,000 is left out since only Jerusalem passes it.
 */
export const SIZE_BREAKS: Record<'localities-2011' | 'local-authorities-2011', number[]> = {
  'localities-2011': [500, 2000, 5000, 10000, 20000, 50000, 100000, 200000],
  'local-authorities-2011': [5000, 10000, 20000, 50000, 100000, 200000],
};

/**
 * Growth breaks (%), diverging at 0: round numbers near the 25th (−5), 40th (0), 50th (+2), 65th (+5) and 80th (+10)
 * percentiles of the localities with ≥500 residents. Zero is a break so decline and growth never share a colour.
 */
export const GROWTH_BREAKS = [-5, 0, 2, 5, 10];

/**
 * ColorBrewer BrBG (8-class), brown = decline, teal = growth. Two decline classes take the two lighter browns, four
 * growth classes the four teals; the palest brown (#f6e8c3) and darkest (#8c510a) are unused. Brown ↔ teal is
 * colourblind-safe and unlike SES's red ↔ blue.
 */
const GROWTH_COLORS = (() => {
  const b = colorbrewer('BrBG8');
  return [b[1], b[2], b[4], b[5], b[6], b[7]];
})();

/** CBS `צורת יישוב` codes grouped into six readable types (class values 1–6). */
export function localityTypeGroup(code: number): number {
  if (code >= 120 && code <= 190) return 1; // Jewish towns and cities, 2,000+ residents
  if (code >= 250 && code <= 290) return 2; // non-Jewish towns and cities, 2,000+ residents
  if (code === 191 || code === 192 || code === 310 || code === 320) return 3; // moshav, cooperative moshav (any size)
  if (code === 193 || code === 330) return 4; // kibbutz (any size)
  if (code === 370) return 5; // community settlement
  if ([340, 350, 440].includes(code)) return 6; // institutional and other rural
  if (code === 450) return 7; // the 26 Arab, Druze, Circassian and Bedouin villages in regional councils
  throw new Error(`population-2024: unexpected locality type code ${code}`);
}

/**
 * Okabe-Ito colours. Jewish/mixed is blue and Arab/non-Jewish orange in both nominal layers; the non-Jewish villages
 * (type 7) take vermillion, the warm neighbour of orange that Okabe-Ito keeps distinguishable from it, so kibbutz
 * moved to reddish purple. Black, the eighth Okabe-Ito colour, stays unused: it reads as a border.
 */
const GROUP_COLORS: Record<number, string> = { 1: OKABE_ITO.blue, 2: OKABE_ITO.orange, 4: OKABE_ITO.reddishPurple };
const TYPE_COLORS: Record<number, string> = {
  1: OKABE_ITO.blue,
  2: OKABE_ITO.orange,
  3: OKABE_ITO.bluishGreen,
  4: OKABE_ITO.reddishPurple,
  5: OKABE_ITO.skyBlue,
  6: OKABE_ITO.yellow,
  7: OKABE_ITO.vermillion,
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (part: number, whole: number) => round1((part / whole) * 100);
const growth = (now: number, base: number | undefined) =>
  base != null && base >= GROWTH_MIN_BASE ? { growth_pct: round1((now / base - 1) * 100) } : {};

const source: Source = {
  name: {
    he: 'הלמ"ס, קובץ היישובים 2024 (ו-2022)',
    en: 'CBS, Localities File 2024 (and 2022)',
    ru: 'ЦСБ, файл населённых пунктов 2024 (и 2022)',
  },
  url: `${DOCLIB}/bycode2024.xlsx`,
  license: 'CBS open licence',
  licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  citation:
    'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), קובץ היישובים 2024 וקובץ היישובים 2022, (נשלף 25.10.2026), זמין ב: ' +
    'https://www.cbs.gov.il/he/publications/DocLib/2019/ishuvim/, הועתק והופץ כמות שהוא בהתאם לרישיון השימוש של הלמ"ס ' +
    'בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
};

type PopLevel = 'localities-2011' | 'local-authorities-2011';
const dataPath = (level: PopLevel) => `datasets/${ID}/${level}.json`;

const { stepped, nominal, classLabels, popup: popupFields, layer: measureLayer } = measureKit(ID, source);

/** Popup fields are per level, the same for every measure: any one layer shows the place's whole profile. */
function popup(level: PopLevel): PopupField[] {
  const fields: [string, PopupFormat][] = [
    ['population', { type: 'integer' }],
    ['israelis', { type: 'integer' }],
    ['israelis_2022', { type: 'integer' }],
    ['growth_pct', { type: 'percent', decimals: 1, signed: true }],
    ...(level === 'localities-2011'
      ? ([
          ['group', { type: 'category', labels: classLabels('group') }],
          ['type', { type: 'category', labels: classLabels('type') }],
        ] as [string, PopupFormat][])
      : []),
    ['jews_others_pct', { type: 'percent', decimals: 1 }],
    ['arabs_pct', { type: 'percent', decimals: 1 }],
  ];
  return popupFields(fields);
}

const layer = (level: PopLevel, measure: string, valueField: string, classification: Classification) =>
  measureLayer(level, measure, valueField, classification, popup(level));

const populationModule: DatasetModule = {
  id: ID,
  info: datasetInfo(ID, ['local-authorities-2011', 'localities-2011']),
  rawFiles: [
    { path: files.y2024, url: `${DOCLIB}/bycode2024.xlsx`, sha256: 'a021c6a151863ded624d2f674f9bbcf90ba9f3660c8d55aebe6526ff7f5d2ad0' },
    { path: files.y2022, url: `${DOCLIB}/bycode2022.xlsx`, sha256: 'b58b54759d182fac4ca3a2d6d16d88bc3dbf19c222b673c923e7d6242eb930eb' },
  ],

  async build({ geometryCodes }) {
    const rows2024 = await parseLocalities2024(raw(files.y2024));
    const rows2022 = await parseLocalities2022(raw(files.y2022));
    const base2022 = new Map(rows2022.map((r) => [r.code, r.population]));

    // Localities: Tel Zion folded into Kokhav Ya'akov, everything else as is.
    const merged = new Map<number, Locality2024>();
    for (const r of rows2024) {
      const target = MERGE_INTO[r.code] ?? r.code;
      const prev = merged.get(target);
      merged.set(
        target,
        prev
          ? {
              ...prev,
              population: prev.population + r.population,
              israelis: prev.israelis + r.israelis,
              jewsOthers: prev.jewsOthers + r.jewsOthers,
              arabs: prev.arabs + r.arabs,
            }
          : { ...r, code: target },
      );
    }
    const localityCodes = geometryCodes['localities-2011'];
    const localities = Object.fromEntries(
      [...merged.values()]
        .filter((r) => localityCodes.has(String(r.code)))
        .sort((a, b) => a.code - b.code)
        .map((r) => [
          String(r.code),
          {
            population: r.population,
            israelis: r.israelis,
            ...(base2022.has(r.code) && { israelis_2022: base2022.get(r.code)! }),
            ...growth(r.israelis, base2022.get(r.code)),
            group: r.religion,
            type: localityTypeGroup(r.localityType),
            jews_others_pct: pct(r.jewsOthers, r.israelis),
            arabs_pct: pct(r.arabs, r.israelis),
          },
        ]),
    );

    // Authorities, by 2011 membership: 2024 from `סמל רשות מקומית`, 2022 from the municipal status.
    const to2011 = (code: number) => AUTHORITY_2011[code] ?? code;
    const sum = new Map<number, { population: number; israelis: number; jewsOthers: number; arabs: number; base: number }>();
    const acc = (code: number) => {
      const a = sum.get(code) ?? { population: 0, israelis: 0, jewsOthers: 0, arabs: 0, base: 0 };
      sum.set(code, a);
      return a;
    };
    for (const r of rows2024) {
      if (r.authority == null) continue; // a handful of places without an authority (e.g. Shani 1287)
      const a = acc(to2011(r.authority));
      a.population += r.population;
      a.israelis += r.israelis;
      a.jewsOthers += r.jewsOthers;
      a.arabs += r.arabs;
    }
    for (const r of rows2022) {
      if (r.status == null) continue;
      acc(to2011(Number(authorityCode(r.status, r.code)))).base += r.population;
    }
    const authorityCodes = geometryCodes['local-authorities-2011'];
    for (const code of sum.keys()) {
      if (!authorityCodes.has(String(code))) throw new Error(`${ID}: authority ${code} has no polygon and no 2011 mapping`);
    }
    const authorities = Object.fromEntries(
      [...sum]
        .filter(([, a]) => a.population > 0)
        .sort(([a], [b]) => a - b)
        .map(([code, a]) => [
          String(code),
          {
            population: a.population,
            israelis: a.israelis,
            israelis_2022: a.base,
            ...growth(a.israelis, a.base),
            jews_others_pct: pct(a.jewsOthers, a.israelis),
            arabs_pct: pct(a.arabs, a.israelis),
          },
        ]),
    );

    const rawAuthorities = [...new Set(rows2024.filter((r) => r.authority != null).map((r) => String(r.authority)))];
    const joins = [
      join('population: localities', 'localities-2011', rows2024.map((r) => String(r.code)), localityCodes, [], NO_POLYGON),
      join('population: local authorities', 'local-authorities-2011', rawAuthorities, authorityCodes, [], AUTHORITY_REASON),
    ];

    const L = 'localities-2011';
    const A = 'local-authorities-2011';
    return {
      files: { [dataPath(A)]: authorities, [dataPath(L)]: localities },
      layers: [
        layer(A, 'size', 'population', stepped('size', A, SIZE_BREAKS[A], colorbrewer('BuPu7'))),
        layer(A, 'growth', 'growth_pct', stepped('growth', A, GROWTH_BREAKS, GROWTH_COLORS)),
        layer(L, 'size', 'population', stepped('size', L, SIZE_BREAKS[L], colorbrewer('BuPu9'))),
        layer(L, 'growth', 'growth_pct', stepped('growth', L, GROWTH_BREAKS, GROWTH_COLORS)),
        layer(L, 'group', 'group', nominal('group', L, GROUP_COLORS)),
        layer(L, 'type', 'type', nominal('type', L, TYPE_COLORS)),
      ],
      joins,
    };
  },
};

export default populationModule;
