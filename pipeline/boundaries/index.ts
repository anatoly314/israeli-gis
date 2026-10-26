import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { ExtraField, I18n, Level, LevelId, Source } from '../lib/contract.ts';
import { BOT_UA, BROWSER_UA, sparqlUrl, type RawFile } from '../lib/download.ts';
import { toWgs84 } from '../lib/gdal.ts';
import { authorityCode, isRegionalCouncilCode, isRegionalCouncilStatus, LOCAL_COUNCIL, MUNICIPALITY, saKey } from '../lib/keys.ts';
import { cleanEn, cleanHe, withRuFallback } from '../lib/names.ts';
import { raw } from '../lib/paths.ts';
import { addPointObject, toTopoJSON, type Topology } from '../lib/topology.ts';
import { labelsMatch, pickItem, readLocalitiesFile, readWikidataItems, regionalCouncilHe } from './names.ts';
import { placeholderCentre } from './placeholders.ts';
import { readSaNames } from './sa-names.ts';
import { FILE as CENSUS_FILE } from '../datasets/census-2022/index.ts';
import { parseCensusSas } from '../datasets/census-2022/parse.ts';
import { levelKind, termsFor } from '../terminology.ts';

const SA_ZIP = 'cbs-statistical-areas-2011-demography-2020/statisticalareas_2020_demography.gdb.zip';
const SA22_ZIP = 'cbs-statistical-areas-2022/ezorim_statistiim_2022.gdb.zip';
const LOCALITIES_FILE = 'cbs-localities-file/bycode2021.xlsx';
const WD_ITEMS = 'wikidata-p3466/p3466_items.csv';
const WD_COUNCILS = 'wikidata-p3466/regional_councils_Q1022469.csv';
const SA_NAMES = 'cbs-socioeconomic-2021/streets_neighborhoods_sa2011.xlsx';

const labels = `
  OPTIONAL { ?item rdfs:label ?he FILTER(LANG(?he) = "he") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?ru FILTER(LANG(?ru) = "ru") }`;

export const rawFiles: RawFile[] = [
  {
    path: SA_ZIP,
    url: 'https://www.cbs.gov.il/he/Documents/statisticalareas_2020_demography.gdb.zip',
    sha256: 'ef0bb63fc504dd58d6bd088d4b79d93a8211997278d9a3fe3e3a8cf998b94b62',
    manual: 'Linked from https://www.cbs.gov.il/he/Pages/geo-layers.aspx (statistical areas 2011, demography 2020).',
  },
  {
    // Media release 026/2022 ("statistical areas 2022"); the layer has no population, so the level takes it from the
    // census (CENSUS_FILE).
    path: SA22_ZIP,
    url: 'https://www.cbs.gov.il/he/mediarelease/DocLib/2022/026/ezorim_statistiim_2022.gdb.zip',
    sha256: '55b995363be99c438a69603e5f1a89d3fc92fa11cedf922e137592a8551edf27',
  },
  {
    path: LOCALITIES_FILE,
    url: 'https://www.cbs.gov.il/he/publications/DocLib/2019/ishuvim/bycode2021.xlsx',
    sha256: 'bfd76fae74326c15ffca9dc9e06213525c4489eea5b9c6ee1766c3e82d44719a',
  },
  {
    // "Main streets and neighbourhoods of statistical areas, 2011 division" (linked from the 2021 index release).
    path: SA_NAMES,
    url: 'https://www.cbs.gov.il/he/publications/LochutTlushim/2021/%D7%A8%D7%97%D7%95%D7%91%D7%95%D7%AA%20%D7%A2%D7%99%D7%A7%D7%A8%D7%99%D7%99%D7%9D%20%D7%95%D7%A9%D7%9B%D7%95%D7%A0%D7%95%D7%AA%20%D7%9C%D7%90%D7%A1%202011.xlsx',
    sha256: '3c077516152e5b1133ad51c262f8f1546fa3a69ee66b8074f5e585d12a158db5',
  },
  {
    path: WD_ITEMS,
    headers: { 'User-Agent': BOT_UA, Accept: 'text/csv' },
    sha256: 'a94aa3859d06bfa5b696f91ef208e109a94b1127a4160d0fc09609b71b2bbe9c',
    url: sparqlUrl(`SELECT ?item ?code ?he ?en ?ru ?ruwiki ?dissolved WHERE {
  ?item wdt:P3466 ?code .
  OPTIONAL { ?item wdt:P576 ?dissolved }${labels}
  OPTIONAL { ?ruwiki schema:about ?item ; schema:isPartOf <https://ru.wikipedia.org/> }
}`),
  },
  {
    path: WD_COUNCILS,
    headers: { 'User-Agent': BOT_UA, Accept: 'text/csv' },
    sha256: '84a80a57b37be43c388082a9301d7c6d08a79ca1c325e780dfb65d5e7ca88ae7',
    url: sparqlUrl(`SELECT ?item ?he ?en ?ru ?p3466 ?dissolved WHERE {
  ?item wdt:P31 wd:Q1022469 .
  OPTIONAL { ?item wdt:P3466 ?p3466 }
  OPTIONAL { ?item wdt:P576 ?dissolved }${labels}
}`),
  },
  // Not read by the build: tests cross-check the 5500+n authority codes against it.
  {
    path: 'datagov-municipal-authorities/localauthorities.csv',
    reference: true,
    headers: { 'User-Agent': BROWSER_UA },
    sha256: '01f69764b7e83256fc14362373a6ea480788ff4d2d862ae509de869e5896f1a4',
    url: 'https://data.gov.il/dataset/009348a4-40d5-4bbe-92ab-ac19e4460fce/resource/c4916937-f5d3-4295-a22e-88a1af5cde6a/download/localauthorities.csv',
  },
];

/** Names no source gets right; each entry says why. Keyed by code. */
const NAME_OVERRIDES: Record<number, { he?: string; en?: string; ru?: string }> = {
  // CBS has no English name; the Wikidata item conflates the local council with the Ramat Hovav industrial zone.
  1770: { en: 'Neot Hovav' },
  // Renamed from Sedot Dan; the 2021 index (table A1) already says עמק לוד / EMEQ LOD, the 2021 localities file and
  // the SA layer still have the old name.
  5540: { he: 'עמק לוד', en: 'Emek Lod', ru: 'Эмек-Лод' },
  // Pairs of localities whose Wikidata ru names collide (cleanRu drops the disambiguator, or the labels are equal).
  // The CBS Hebrew names tell them apart in parentheses; the Russian ones now do too.
  173: { ru: 'Гиват-Хайим (Меухад)' },
  2018: { ru: 'Гиват-Хайим (Ихуд)' },
  1084: { ru: 'Бен-Шемен (молодёжная деревня)' },
  2013: { ru: 'Бен-Шемен (мошав)' },
  66: { ru: 'Мерхавия (кибуц)' },
  97: { ru: 'Мерхавия (мошав)' },
  547: { ru: 'Тамра (Изреэль)' },
};

/**
 * Lone Wikidata items for a CBS code that describe a different entity, reviewed by hand. The build prints every
 * lone item whose labels don't match the CBS name as a "review" line, so re-check this list when the snapshot changes.
 */
const WIKIDATA_REJECT: Record<number, string> = {
  897: 'Ruppin Academic Center, not the Midreshet Ruppin locality',
  926: 'a geriatric centre whose ru.wikipedia link points to Shoham, not Neve Avot',
  2010: 'Hasolelim, not Kefar Ben Nun',
  // The item is Givat Washington, the college campus beside the Beit Rabban school; co-located but a different
  // entity. It has no ru name and CBS has English, so rejecting changes no output, it only keeps a future ru
  // label for the college off the locality.
  848: 'Givat Washington campus, not the Beit Rabban locality',
};

export const sources: Source[] = [
  {
    name: {
      he: 'הלמ"ס, שכבת אזורים סטטיסטיים 2011 (דמוגרפיה 2020)',
      en: 'CBS, Statistical Areas 2011 layer (demography 2020)',
      ru: 'ЦСБ, слой статистических районов 2011 (демография 2020)',
    },
    url: 'https://www.cbs.gov.il/he/Pages/geo-layers.aspx',
    license: 'CBS open licence',
    licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
    citation:
      'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), שכבת אזורים סטטיסטיים 2011 – דמוגרפיה 2020 וקובץ יישובים 2021, (נשלף 24.10.2026), ' +
      'זמין ב: https://www.cbs.gov.il/he/Pages/geo-layers.aspx, הועתק והופץ כמות שהוא בהתאם לרישיון השימוש של הלמ"ס ' +
      'בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  },
  {
    name: {
      he: 'הלמ"ס, שכבת אזורים סטטיסטיים 2022',
      en: 'CBS, Statistical Areas 2022 layer',
      ru: 'ЦСБ, слой статистических районов 2022',
    },
    url: 'https://www.cbs.gov.il/he/mediarelease/DocLib/2022/026/ezorim_statistiim_2022.gdb.zip',
    license: 'CBS open licence',
    licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
    citation:
      'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), שכבת אזורים סטטיסטיים 2022, (נשלף 24.10.2026), ' +
      'זמין ב: https://www.cbs.gov.il/he/mediarelease/DocLib/2022/026/, הועתק והופץ כמות שהוא בהתאם לרישיון השימוש של הלמ"ס ' +
      'בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  },
  {
    name: {
      he: 'הלמ"ס, רחובות עיקריים ושכונות לפי אזור סטטיסטי (חלוקת 2011)',
      en: 'CBS, main streets and neighborhoods by statistical area (2011 division)',
      ru: 'ЦСБ, главные улицы и кварталы по статистическим районам (деление 2011 года)',
    },
    url: 'https://www.cbs.gov.il/he/publications/LochutTlushim/2021/%D7%A8%D7%97%D7%95%D7%91%D7%95%D7%AA%20%D7%A2%D7%99%D7%A7%D7%A8%D7%99%D7%99%D7%9D%20%D7%95%D7%A9%D7%9B%D7%95%D7%A0%D7%95%D7%AA%20%D7%9C%D7%90%D7%A1%202011.xlsx',
    license: 'CBS open licence',
    licenseUrl: 'https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
    citation:
      'הלשכה המרכזית לסטטיסטיקה (הלמ"ס), רחובות עיקריים ושכונות לא"ס 2011 (הופק 28.7.2021), (נשלף 24.10.2026), ' +
      'זמין ב: https://www.cbs.gov.il/he/publications/LochutTlushim/2021/, הועתק והופץ כמות שהוא בהתאם לרישיון השימוש ' +
      'של הלמ"ס בכתובת https://www.cbs.gov.il/he/Pages/רישיון-שימוש.aspx',
  },
  {
    name: { he: 'ויקינתונים (P3466)', en: 'Wikidata (P3466)', ru: 'Викиданные (P3466)' },
    url: 'https://www.wikidata.org/wiki/Property:P3466',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    citation: 'Russian place names from Wikidata (CC0), property P3466 "Israeli CBS municipal ID", retrieved 2026-10-24.',
  },
];

export const attribution: I18n = {
  he: 'גבולות: הלמ"ס (אזורים סטטיסטיים 2011, 2022) · שמות ברוסית: ויקינתונים',
  en: 'Boundaries: CBS Israel (Statistical Areas 2011, 2022) · Russian names: Wikidata',
  ru: 'Границы: ЦСБ Израиля (статистические районы 2011, 2022) · Названия на русском: Викиданные',
};

type Geom = Polygon | MultiPolygon;

interface SaProps {
  SEMEL_YISHUV: number;
  STAT11: number | null;
  YISHUV_STAT11: number;
  SHEM_YISHUV: string | null;
  SHEM_YISHUV_ENGLISH: string | null;
  Pop_Total: number | null;
}

interface Sa22Props {
  SEMEL_YISHUV: number;
  STAT_2022: number | null;
  YISHUV_STAT_2022: number;
  SHEM_YISHUV: string | null;
  SHEM_YISHUV_ENGLISH: string | null;
}

type NameProps = Pick<SaProps, 'SHEM_YISHUV' | 'SHEM_YISHUV_ENGLISH'>;

type LevelMeta = Omit<Level, 'featureCount' | 'placeholderCount'>;

export interface LevelBuild {
  meta: LevelMeta;
  features: Feature<Geom>[];
  /** One point per placeholder polygon, tagged with the feature's code. */
  points: { coordinates: [number, number]; properties: { code: string } }[];
  copyFields: string[];
  simplify: string;
  snapInterval?: number;
  /** Properties added to the output features by code after topology building (lists don't go through mapshaper). */
  extraProps?: Map<string, Record<string, string[]>>;
}

export interface NameStats {
  /** Distinct features at the level. */
  total: number;
  /** name_ru fell back to English. */
  ruFallback: number;
  /** No English name anywhere, so name_en (and name_ru) are Hebrew. */
  enIsHebrew: number;
}

export interface Boundaries {
  levels: Record<LevelId, LevelBuild>;
  names: Record<LevelId, NameStats>;
  placeholders: number;
  /** Lone Wikidata items whose labels differ from the CBS name, with the verdict applied. */
  review: string[];
  dropped: { noJurisdiction: number; noStatus: number };
  /** Companion attribute files joined onto a level (the SA streets/neighbourhoods list). */
  companions: CompanionJoin[];
}

/** The SA-2011 layer's demography edition: the year of the `-2011` levels' `population`. */
const POPULATION_YEAR = 2020;
/** SA-2022 `population` is the census 2022 count (`pop_approx`), the only figure covering every published SA-2022. */
const SA22_POPULATION_YEAR = 2022;

export type AuthorityType = 'city' | 'local-council' | 'regional-council';

/**
 * Structure of a level (files, properties); every user-facing string comes from pipeline/terminology.ts by the
 * level's kind. `typeProperty` names the feature property whose values key `featureTypes` in the terminology.
 */
function level(
  id: LevelId,
  extra: {
    parentCode?: string;
    typeProperty?: string;
    extraFields?: Omit<ExtraField, 'label' | 'shortLabel' | 'searchTerm'>[];
    populationYear?: number;
  } = {},
): LevelMeta {
  const terms = termsFor(id);
  if (extra.typeProperty && !terms.featureTypes) throw new Error(`${id}: terminology has no featureTypes for ${extra.typeProperty}`);
  const extraFields = extra.extraFields?.map((f) => {
    const t = terms.extraFields?.[f.property];
    if (!t) throw new Error(`${id}: terminology has no extraFields label for ${f.property}`);
    return { ...f, label: t.label, ...(t.shortLabel && { shortLabel: t.shortLabel }), ...(t.searchTerm && { searchTerm: t.searchTerm }) };
  });
  return {
    kind: levelKind(id),
    title: terms.title,
    officialTerm: terms.officialTerm,
    ...(terms.popupOfficialTerm === false && { popupOfficialTerm: false as const }),
    file: `geometry/${id}.topo.json`,
    object: id,
    placeholderObject: `${id}-placeholders`,
    idProperty: 'code',
    populationYear: extra.populationYear ?? POPULATION_YEAR,
    featureType: terms.featureType,
    ...(terms.countForms && { countForms: terms.countForms }),
    ...(terms.featureLabel && { featureLabel: terms.featureLabel }),
    ...(extra.parentCode && { parentCode: extra.parentCode }),
    ...(extra.typeProperty && { featureTypes: { property: extra.typeProperty, labels: terms.featureTypes! } }),
    ...(extraFields && { extraFields }),
  };
}

const LEVEL_META: Record<LevelId, LevelMeta> = {
  'local-authorities-2011': level('local-authorities-2011', { typeProperty: 'authority_type' }),
  'localities-2011': level('localities-2011'),
  'rc-localities-2011': level('rc-localities-2011'),
  'statistical-areas-2011': level('statistical-areas-2011', {
    parentCode: 'locality_code',
    extraFields: [
      { property: 'neighborhoods_he', kind: 'list', textLang: 'he', searchable: true },
      { property: 'streets_he', kind: 'list', textLang: 'he', searchable: false },
    ],
  }),
  // No neighbourhood or street names: CBS publishes none for the 2022 division (docs/data-sources-2.md §3.6).
  'statistical-areas-2022': level('statistical-areas-2022', { parentCode: 'locality_code', populationYear: SA22_POPULATION_YEAR }),
};

/** Share of SA-2011 polygons that must find a row in the streets/neighbourhoods file, or the build fails. */
export const SA_NAMES_MIN_MATCH = 0.95;

export interface CompanionJoin {
  label: string;
  level: LevelId;
  rows: number;
  /** Rows whose code is a feature of the level. */
  matched: number;
  /** Features of the level that found a row. */
  featuresMatched: number;
  features: number;
  unmatched: string[];
  /** Feature codes that found a row. */
  matchedCodes: string[];
  withNeighborhoods: number;
  withStreets: number;
  withNeither: number;
}
function authorityType(status: number | null, code: number): AuthorityType {
  if (isRegionalCouncilCode(code) || isRegionalCouncilStatus(status)) return 'regional-council';
  if (status === MUNICIPALITY) return 'city';
  if (status === LOCAL_COUNCIL) return 'local-council';
  throw new Error(`No authority type for ${code} (status ${status})`);
}

const COPY = ['name_he', 'name_en', 'name_ru', 'placeholder'];
/** Level-specific properties carried through the dissolve, besides COPY. */
const EXTRA_FIELDS: Partial<Record<LevelId, string[]>> = {
  'statistical-areas-2011': ['locality_code', 'sa'],
  'statistical-areas-2022': ['locality_code', 'sa'],
  'local-authorities-2011': ['authority_type'],
};
const HEBREW = /[\u{5D0}-\u{5EA}]/u;

/** Reads the SA-2011 layer and the name sources, and derives the geometry levels (docs/data-sources.md §11). */
export async function buildBoundaries(): Promise<Boundaries> {
  const sa = await toWgs84<FeatureCollection<Geom, SaProps>>(raw(SA_ZIP), {
    zipped: true,
    multiPolygon: true,
    select: ['SEMEL_YISHUV', 'STAT11', 'YISHUV_STAT11', 'SHEM_YISHUV', 'SHEM_YISHUV_ENGLISH', 'Pop_Total'],
  });
  const localities = await readLocalitiesFile(raw(LOCALITIES_FILE));
  const rcHe = regionalCouncilHe(localities);
  const wikidata = readWikidataItems(raw(WD_ITEMS), raw(WD_COUNCILS));

  const polygonsPerLocality = new Map<number, number>();
  const openLand = new Map<number, SaProps>();
  for (const f of sa.features) {
    const type = (f.geometry as Geometry | null)?.type;
    if (type !== 'MultiPolygon' && type !== 'Polygon') {
      throw new Error(`Non-polygon geometry (${type}) for ${f.properties.YISHUV_STAT11}`);
    }
    const loc = f.properties.SEMEL_YISHUV;
    polygonsPerLocality.set(loc, (polygonsPerLocality.get(loc) ?? 0) + 1);
    if (isRegionalCouncilCode(loc)) openLand.set(loc, f.properties);
  }

  const gdbEn = (p?: NameProps) =>
    p?.SHEM_YISHUV_ENGLISH && !/^no name$/i.test(p.SHEM_YISHUV_ENGLISH.trim()) ? cleanEn(p.SHEM_YISHUV_ENGLISH) : '';

  // he/en: CBS first (localities file, then the layer itself); Wikidata only fills gaps. ru: Wikidata, else en.
  const review: string[] = [];
  const namesCache = new Map<number, Record<'name_he' | 'name_en' | 'name_ru', string> & { ruFallback: boolean }>();
  const namesOf = (code: number, p?: NameProps) => {
    const cached = namesCache.get(code);
    if (cached) return cached;
    let he: string;
    let en: string;
    if (isRegionalCouncilCode(code)) {
      const land = openLand.get(code);
      he = rcHe.get(code) || cleanHe(land?.SHEM_YISHUV) || String(code);
      en = gdbEn(land);
    } else {
      const l = localities.get(code);
      he = l?.he || cleanHe(p?.SHEM_YISHUV);
      en = l?.en || gdbEn(p);
    }
    const candidates = wikidata.get(code);
    const picked = pickItem(candidates, he, en);
    if (picked && candidates?.filter((c) => !c.dissolved).length === 1 && !labelsMatch(picked, he, en)) {
      const verdict = WIKIDATA_REJECT[code] ? `rejected (${WIKIDATA_REJECT[code]})` : 'accepted';
      review.push(`${code} ${he} ↔ ${picked.he || '?'} / ${picked.en || '?'} / ${picked.ru ?? '-'}: ${verdict}`);
    }
    const item = WIKIDATA_REJECT[code] ? null : picked;
    const o = NAME_OVERRIDES[code] ?? {};
    he = o.he || he;
    en = o.en || en || item?.en.replace(/ Regional Council$/, '') || he;
    const n = withRuFallback(he, en, o.ru || item?.ru);
    const names = { name_he: n.he, name_en: n.en, name_ru: n.ru, ruFallback: n.ruIsFallback };
    namesCache.set(code, names);
    return names;
  };

  /** `population`: residents of this polygon in the level's `populationYear`. */
  type Draft = { code: string; nameCode: number; props: Record<string, unknown>; population: number; f: Feature<Geom, NameProps> };
  const drafts: Record<LevelId, Draft[]> = {
    'local-authorities-2011': [],
    'localities-2011': [],
    'rc-localities-2011': [],
    'statistical-areas-2011': [],
    'statistical-areas-2022': [],
  };
  const dropped = { noJurisdiction: 0, noStatus: 0 };

  for (const f of sa.features) {
    const p = f.properties;
    const loc = p.SEMEL_YISHUV;
    const info = localities.get(loc);
    const status = info?.status ?? null;
    // Residents in POPULATION_YEAR (SA layer Pop_Total), summed by the dissolve; lets the viewer rank places by size.
    const population = Math.round(p.Pop_Total ?? 0);

    // Statistical areas: every polygon of the 117 localities that are subdivided into SAs.
    if ((polygonsPerLocality.get(loc) ?? 0) > 1) {
      if (p.STAT11 == null) throw new Error(`SA polygon without STAT11 in locality ${loc}`);
      const code = saKey(loc, p.STAT11);
      if (code !== String(p.YISHUV_STAT11)) throw new Error(`YISHUV_STAT11 ${p.YISHUV_STAT11} != ${code}`);
      drafts['statistical-areas-2011'].push({ code, nameCode: loc, props: { locality_code: String(loc), sa: p.STAT11 }, population, f });
    }

    // All localities: every polygon of a place in the CBS localities file (excludes 55xx open land, 99xx).
    if (info) drafts['localities-2011'].push({ code: String(loc), nameCode: loc, props: {}, population, f });

    // Localities in regional councils, per the CBS localities file.
    if (isRegionalCouncilStatus(status)) drafts['rc-localities-2011'].push({ code: String(loc), nameCode: loc, props: {}, population, f });

    // Local authorities: municipalities and local councils as themselves; RC member localities plus the RC's
    // open land (55xx) merged into 5500+n. No-jurisdiction areas (99xx) and status-less places belong to none.
    let code: string | null = null;
    if (isRegionalCouncilCode(loc)) code = String(loc);
    else if (status != null) code = authorityCode(status, loc);
    else if (!info) dropped.noJurisdiction++;
    else dropped.noStatus++;
    if (code != null) {
      drafts['local-authorities-2011'].push({ code, nameCode: Number(code), props: { authority_type: authorityType(status, loc) }, population, f });
    }
  }

  // Statistical areas, 2022 division: every polygon of the 145 localities divided into SAs (single-SA localities
  // carry STAT_2022 1 there, so "divided" means more than one polygon, as for 2011). Same reprojection as SA-2011.
  const sa22 = await toWgs84<FeatureCollection<Geom, Sa22Props>>(raw(SA22_ZIP), {
    zipped: true,
    multiPolygon: true,
    select: ['SEMEL_YISHUV', 'STAT_2022', 'YISHUV_STAT_2022', 'SHEM_YISHUV', 'SHEM_YISHUV_ENGLISH'],
  });
  const sa22PerLocality = new Map<number, number>();
  for (const f of sa22.features) sa22PerLocality.set(f.properties.SEMEL_YISHUV, (sa22PerLocality.get(f.properties.SEMEL_YISHUV) ?? 0) + 1);
  // Census rows: a combined row's population goes to its own SA only, so a city's SAs still sum to the city.
  const census = new Map((await parseCensusSas(raw(CENSUS_FILE))).map((r) => [r.code, r.population]));
  for (const f of sa22.features) {
    const p = f.properties;
    const loc = p.SEMEL_YISHUV;
    if ((sa22PerLocality.get(loc) ?? 0) < 2) continue;
    const type = (f.geometry as Geometry | null)?.type;
    if (type !== 'MultiPolygon' && type !== 'Polygon') throw new Error(`Non-polygon geometry (${type}) for SA-2022 ${p.YISHUV_STAT_2022}`);
    if (p.STAT_2022 == null) throw new Error(`SA-2022 polygon without STAT_2022 in locality ${loc}`);
    const code = saKey(loc, p.STAT_2022);
    if (code !== String(p.YISHUV_STAT_2022)) throw new Error(`YISHUV_STAT_2022 ${p.YISHUV_STAT_2022} != ${code}`);
    drafts['statistical-areas-2022'].push({
      code,
      nameCode: loc,
      props: { locality_code: String(loc), sa: p.STAT_2022 },
      population: census.get(code) ?? 0,
      f,
    });
  }

  const centres = new Map<Feature<Geom, NameProps>, [number, number] | null>(
    [...sa.features, ...drafts['statistical-areas-2022'].map((d) => d.f)].map((f) => [f, placeholderCentre(f.geometry)]),
  );
  const names = {} as Record<LevelId, NameStats>;
  const levels = {} as Record<LevelId, LevelBuild>;
  const simplify: Record<LevelId, string> = {
    'local-authorities-2011': '10%',
    'localities-2011': '15%',
    'rc-localities-2011': '15%',
    'statistical-areas-2011': '20%',
    'statistical-areas-2022': '20%',
  };

  for (const id of Object.keys(drafts) as LevelId[]) {
    // A dissolved feature is a placeholder only if every polygon it is made of is one.
    const allPlaceholder = new Map<string, boolean>();
    for (const d of drafts[id]) allPlaceholder.set(d.code, (allPlaceholder.get(d.code) ?? true) && centres.get(d.f) != null);

    const stats: NameStats = { total: 0, ruFallback: 0, enIsHebrew: 0 };
    const seen = new Set<string>();
    const features = drafts[id].map((d) => {
      const { ruFallback, ...n } = namesOf(d.nameCode, d.f.properties);
      if (!seen.has(d.code)) {
        seen.add(d.code);
        stats.total++;
        if (ruFallback) stats.ruFallback++;
        if (HEBREW.test(n.name_en)) stats.enIsHebrew++;
      }
      return {
        type: 'Feature' as const,
        geometry: d.f.geometry,
        properties: {
          code: d.code,
          ...d.props,
          ...n,
          placeholder: allPlaceholder.get(d.code)!,
          population: d.population,
        },
      };
    });
    names[id] = stats;
    levels[id] = {
      meta: LEVEL_META[id],
      features,
      points: drafts[id].flatMap((d) => {
        const c = centres.get(d.f);
        return c ? [{ coordinates: c, properties: { code: d.code } }] : [];
      }),
      copyFields: [...(EXTRA_FIELDS[id] ?? []), ...COPY],
      simplify: simplify[id],
      ...(SNAP_INTERVAL[id] && { snapInterval: SNAP_INTERVAL[id] }),
    };
  }

  // Neighbourhood and main-street names per statistical area, as lists; empty lists are left out.
  const saLevel = levels['statistical-areas-2011'];
  const saNames = await readSaNames(raw(SA_NAMES));
  const saCodes = new Set(saLevel.features.map((f) => String(f.properties?.code)));
  const extraProps = new Map<string, Record<string, string[]>>();
  for (const [code, n] of saNames) {
    if (!saCodes.has(code)) continue;
    const props: Record<string, string[]> = {};
    if (n.neighborhoods.length) props.neighborhoods_he = n.neighborhoods;
    if (n.streets.length) props.streets_he = n.streets;
    if (Object.keys(props).length) extraProps.set(code, props);
  }
  saLevel.extraProps = extraProps;
  const rows = [...saNames];
  const companion: CompanionJoin = {
    label: 'SA streets/neighborhoods',
    level: 'statistical-areas-2011',
    rows: rows.length,
    matched: rows.filter(([c]) => saCodes.has(c)).length,
    featuresMatched: [...saCodes].filter((c) => saNames.has(c)).length,
    features: saCodes.size,
    unmatched: rows.filter(([c]) => !saCodes.has(c)).map(([c]) => c),
    matchedCodes: rows.filter(([c]) => saCodes.has(c)).map(([c]) => c),
    withNeighborhoods: rows.filter(([, n]) => n.neighborhoods.length).length,
    withStreets: rows.filter(([, n]) => n.streets.length).length,
    withNeither: rows.filter(([, n]) => !n.neighborhoods.length && !n.streets.length).length,
  };
  if (companion.featuresMatched < SA_NAMES_MIN_MATCH * companion.features) {
    throw new Error(
      `${SA_NAMES}: only ${companion.featuresMatched}/${companion.features} SA polygons matched (need ${SA_NAMES_MIN_MATCH * 100}%)`,
    );
  }

  return { levels, names, placeholders: [...centres.values()].filter(Boolean).length, dropped, review, companions: [companion] };
}

// 2e5 (~2 m grid) + fix-geometry is the smallest setting that leaves 0 invalid geometries on every level;
// 1e5 left 21 invalid and 1e6 costs ~40% more bytes. The build re-checks validity either way.
export const QUANTIZATION = 200_000;

/**
 * SA-2022 has four sub-metre necks (Jerusalem 2221 and 2913, Tel Aviv 916, Ness Ziona 12) that simplification or
 * the grid pinches into self-touching rings, invalid under GEOS; 2913 and 916 stay pinched even unsimplified at 1e6.
 * Snapping vertices within 1e-5° (~1 m, about one grid step) before `-clean` lets mapshaper rebuild those rings as
 * separate parts. The 2011 levels keep mapshaper's default, so their output is unchanged.
 */
const SNAP_INTERVAL: Partial<Record<LevelId, number>> = { 'statistical-areas-2022': 0.00001 };

/** Simplified TopoJSON for one level, with its placeholder points as a second object. */
export async function levelTopology(level: LevelBuild): Promise<Topology> {
  const topo = await toTopoJSON(
    { type: 'FeatureCollection', features: level.features },
    {
      object: level.meta.object,
      dissolve: 'code',
      copyFields: level.copyFields,
      sumFields: ['population'],
      simplify: level.simplify,
      quantization: QUANTIZATION,
      ...(level.snapInterval && { snapInterval: level.snapInterval }),
    },
  );
  if (level.extraProps) {
    for (const g of topo.objects[level.meta.object].geometries) {
      const extra = level.extraProps.get(String(g.properties?.code));
      if (extra) g.properties = { ...g.properties, ...extra };
    }
  }
  addPointObject(topo, level.meta.placeholderObject, level.points);
  return topo;
}
