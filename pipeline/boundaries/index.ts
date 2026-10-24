import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { I18n, Level, LevelId, Source } from '../lib/contract.ts';
import { BOT_UA, BROWSER_UA, sparqlUrl, type RawFile } from '../lib/download.ts';
import { toWgs84 } from '../lib/gdal.ts';
import { authorityCode, isRegionalCouncilCode, isRegionalCouncilStatus, saKey } from '../lib/keys.ts';
import { cleanEn, cleanHe, withRuFallback } from '../lib/names.ts';
import { raw } from '../lib/paths.ts';
import { addPointObject, toTopoJSON, type Topology } from '../lib/topology.ts';
import { labelsMatch, pickItem, readLocalitiesFile, readWikidataItems, regionalCouncilHe } from './names.ts';
import { placeholderCentre } from './placeholders.ts';

const SA_ZIP = 'cbs-statistical-areas-2011-demography-2020/statisticalareas_2020_demography.gdb.zip';
const LOCALITIES_FILE = 'cbs-localities-file/bycode2021.xlsx';
const WD_ITEMS = 'wikidata-p3466/p3466_items.csv';
const WD_COUNCILS = 'wikidata-p3466/regional_councils_Q1022469.csv';

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
    path: LOCALITIES_FILE,
    url: 'https://www.cbs.gov.il/he/publications/DocLib/2019/ishuvim/bycode2021.xlsx',
    sha256: 'bfd76fae74326c15ffca9dc9e06213525c4489eea5b9c6ee1766c3e82d44719a',
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
    name: { he: 'ויקינתונים (P3466)', en: 'Wikidata (P3466)', ru: 'Викиданные (P3466)' },
    url: 'https://www.wikidata.org/wiki/Property:P3466',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    citation: 'Russian place names from Wikidata (CC0), property P3466 "Israeli CBS municipal ID", retrieved 2026-10-24.',
  },
];

export const attribution: I18n = {
  he: 'גבולות: הלמ"ס (אזורים סטטיסטיים 2011) · שמות ברוסית: ויקינתונים',
  en: 'Boundaries: CBS Israel (Statistical Areas 2011) · Russian names: Wikidata',
  ru: 'Границы: ЦСБ Израиля (статистические районы 2011) · Названия на русском: Викиданные',
};

type Geom = Polygon | MultiPolygon;

interface SaProps {
  SEMEL_YISHUV: number;
  STAT11: number | null;
  YISHUV_STAT11: number;
  SHEM_YISHUV: string | null;
  SHEM_YISHUV_ENGLISH: string | null;
}

type LevelMeta = Omit<Level, 'featureCount' | 'placeholderCount'>;

export interface LevelBuild {
  meta: LevelMeta;
  features: Feature<Geom>[];
  /** One point per placeholder polygon, tagged with the feature's code. */
  points: { coordinates: [number, number]; properties: { code: string } }[];
  copyFields: string[];
  simplify: string;
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
}

const level = (id: LevelId, title: I18n, extra: Partial<LevelMeta> = {}): LevelMeta => ({
  title,
  file: `geometry/${id}.topo.json`,
  object: id,
  placeholderObject: `${id}-placeholders`,
  idProperty: 'code',
  ...extra,
});

const LEVEL_META: Record<LevelId, LevelMeta> = {
  'local-authorities-2011': level('local-authorities-2011', { he: 'רשויות מקומיות', en: 'Local authorities', ru: 'Органы местной власти' }),
  'localities-2011': level('localities-2011', { he: 'יישובים', en: 'Localities', ru: 'Населённые пункты' }),
  'rc-localities-2011': level('rc-localities-2011', {
    he: 'יישובים במועצות אזוריות',
    en: 'Localities in regional councils',
    ru: 'Населённые пункты региональных советов',
  }),
  'statistical-areas-2011': level(
    'statistical-areas-2011',
    { he: 'אזורים סטטיסטיים', en: 'Statistical areas', ru: 'Статистические районы' },
    { featureLabel: { he: '{name} – אזור סטטיסטי {sa}', en: '{name} – statistical area {sa}', ru: '{name} – статистический район {sa}' } },
  ),
};

const COPY = ['name_he', 'name_en', 'name_ru', 'placeholder'];
const HEBREW = /[\u{5D0}-\u{5EA}]/u;

/** Reads the SA-2011 layer and the name sources, and derives the geometry levels (docs/data-sources.md §11). */
export async function buildBoundaries(): Promise<Boundaries> {
  const sa = await toWgs84<FeatureCollection<Geom, SaProps>>(raw(SA_ZIP), {
    zipped: true,
    multiPolygon: true,
    select: ['SEMEL_YISHUV', 'STAT11', 'YISHUV_STAT11', 'SHEM_YISHUV', 'SHEM_YISHUV_ENGLISH'],
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

  const gdbEn = (p?: SaProps) =>
    p?.SHEM_YISHUV_ENGLISH && !/^no name$/i.test(p.SHEM_YISHUV_ENGLISH.trim()) ? cleanEn(p.SHEM_YISHUV_ENGLISH) : '';

  // he/en: CBS first (localities file, then the layer itself); Wikidata only fills gaps. ru: Wikidata, else en.
  const review: string[] = [];
  const namesCache = new Map<number, Record<'name_he' | 'name_en' | 'name_ru', string> & { ruFallback: boolean }>();
  const namesOf = (code: number, p?: SaProps) => {
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

  type Draft = { code: string; nameCode: number; props: Record<string, unknown>; f: Feature<Geom, SaProps> };
  const drafts: Record<LevelId, Draft[]> = {
    'local-authorities-2011': [],
    'localities-2011': [],
    'rc-localities-2011': [],
    'statistical-areas-2011': [],
  };
  const dropped = { noJurisdiction: 0, noStatus: 0 };

  for (const f of sa.features) {
    const p = f.properties;
    const loc = p.SEMEL_YISHUV;
    const info = localities.get(loc);
    const status = info?.status ?? null;

    // Statistical areas: every polygon of the 117 localities that are subdivided into SAs.
    if ((polygonsPerLocality.get(loc) ?? 0) > 1) {
      if (p.STAT11 == null) throw new Error(`SA polygon without STAT11 in locality ${loc}`);
      const code = saKey(loc, p.STAT11);
      if (code !== String(p.YISHUV_STAT11)) throw new Error(`YISHUV_STAT11 ${p.YISHUV_STAT11} != ${code}`);
      drafts['statistical-areas-2011'].push({ code, nameCode: loc, props: { locality_code: String(loc), sa: p.STAT11 }, f });
    }

    // All localities: every polygon of a place in the CBS localities file (excludes 55xx open land, 99xx).
    if (info) drafts['localities-2011'].push({ code: String(loc), nameCode: loc, props: {}, f });

    // Localities in regional councils, per the CBS localities file.
    if (isRegionalCouncilStatus(status)) drafts['rc-localities-2011'].push({ code: String(loc), nameCode: loc, props: {}, f });

    // Local authorities: municipalities and local councils as themselves; RC member localities plus the RC's
    // open land (55xx) merged into 5500+n. No-jurisdiction areas (99xx) and status-less places belong to none.
    let code: string | null = null;
    if (isRegionalCouncilCode(loc)) code = String(loc);
    else if (status != null) code = authorityCode(status, loc);
    else if (!info) dropped.noJurisdiction++;
    else dropped.noStatus++;
    if (code != null) drafts['local-authorities-2011'].push({ code, nameCode: Number(code), props: {}, f });
  }

  const centres = new Map(sa.features.map((f) => [f, placeholderCentre(f.geometry)]));
  const names = {} as Record<LevelId, NameStats>;
  const levels = {} as Record<LevelId, LevelBuild>;
  const simplify: Record<LevelId, string> = {
    'local-authorities-2011': '10%',
    'localities-2011': '15%',
    'rc-localities-2011': '15%',
    'statistical-areas-2011': '20%',
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
        properties: { code: d.code, ...d.props, ...n, placeholder: allPlaceholder.get(d.code)! },
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
      copyFields: id === 'statistical-areas-2011' ? ['locality_code', 'sa', ...COPY] : COPY,
      simplify: simplify[id],
    };
  }

  return { levels, names, placeholders: [...centres.values()].filter(Boolean).length, dropped, review };
}

// 2e5 (~2 m grid) + fix-geometry is the smallest setting that leaves 0 invalid geometries on every level;
// 1e5 left 21 invalid and 1e6 costs ~40% more bytes. The build re-checks validity either way.
export const QUANTIZATION = 200_000;

/** Simplified TopoJSON for one level, with its placeholder points as a second object. */
export async function levelTopology(level: LevelBuild): Promise<Topology> {
  const topo = await toTopoJSON(
    { type: 'FeatureCollection', features: level.features },
    { object: level.meta.object, dissolve: 'code', copyFields: level.copyFields, simplify: level.simplify, quantization: QUANTIZATION },
  );
  addPointObject(topo, level.meta.placeholderObject, level.points);
  return topo;
}
