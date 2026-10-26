// Schools (docs/data-sources-2.md §4): Ministry of Education `mosdot_edu`, the first points layer. Two measures on the
// same points: education stream and school level.
import type { PointsData, PopupFormat, Source } from '../../lib/contract.ts';
import { join, type DatasetModule } from '../../lib/dataset.ts';
import { BROWSER_UA } from '../../lib/download.ts';
import { itmToWgs84 } from '../../lib/gdal.ts';
import { OKABE_ITO } from '../../lib/palettes.ts';
import { raw } from '../../lib/paths.ts';
import { datasetInfo } from '../../terminology.ts';
import { measureKit } from '../measures.ts';
import { parseSchools, type SchoolRow } from './parse.ts';

const ID = 'schools-2026';
/** Stored gzipped (0.95 MB instead of 10.9 MB); `download` fetches the CSV, checks it, and writes this gzip. */
export const FILE = 'datagov-moe-mosdot-edu/mosdot_edu.csv.gz';
const URL =
  'https://data.gov.il/dataset/55ef9f65-c6af-47c8-8f0f-7ce6990420ad/resource/2055063b-93e8-4d6a-b2c5-c253d18c0cf6/download/mosdot_edu.csv';
export const DATA = `datasets/${ID}/schools.geojson`;

/** Israel incl. the West Bank and Golan, generously: anything outside is a geocoding error and is dropped. */
const ITM_BOUNDS = { x: [100_000, 300_000], y: [350_000, 820_000] } as const;
const WGS84_BOUNDS = { lon: [34.2, 35.95], lat: [29.4, 33.4] } as const;

/** 5 decimals ≈ 1 m: finer than the source's best geocoding, and what keeps the file small. */
const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * Locality codes in the MoE list with no `localities-2011` polygon (docs/data-sources-2.md §4.4). Points don't need a
 * polygon, so these schools stay on the map; the build fails only if this list changes.
 */
export const NO_LOCALITY_POLYGON: Record<string, string> = {
  '939': "Mas'udin al-Azazme, Bedouin tribe (no polygon)",
  '957': 'Uqbi (Banu Uqba), Bedouin tribe (no polygon)',
  '963': "A'sam, Bedouin tribe (no polygon)",
  '964': "Qudeirat a-Sani', Bedouin tribe (no polygon)",
  '965': 'Atrash, Bedouin tribe (no polygon)',
  '967': "Abu Juway'ad, Bedouin tribe (no polygon)",
  '1412': 'Tel Nof base, an IDF camp (no polygon)',
  '3815': "Tel Zion, split from Kokhav Ya'akov in 2023",
  '3826': "Sha'ar Shomron, local council since 2022",
  '3870': 'Harsha, recognised after 2021',
  '3890': 'Neria, recognised after 2021',
};

/** Okabe-Ito, matching the other datasets: Haredi reddish purple (census), Arab orange (population). */
export const STREAM_COLORS: Record<number, string> = {
  1: OKABE_ITO.blue,
  2: OKABE_ITO.bluishGreen,
  3: OKABE_ITO.reddishPurple,
  4: OKABE_ITO.orange,
  5: OKABE_ITO.vermillion,
};
export const STAGE_COLORS: Record<number, string> = {
  1: OKABE_ITO.skyBlue,
  2: OKABE_ITO.yellow,
  3: OKABE_ITO.blue,
  4: OKABE_ITO.reddishPurple,
};

const source: Source = {
  name: { he: 'משרד החינוך, מוסדות חינוך (data.gov.il)', en: 'Ministry of Education, Educational institutions (data.gov.il)', ru: 'Министерство образования, учебные заведения (data.gov.il)' },
  url: 'https://data.gov.il/dataset/55ef9f65-c6af-47c8-8f0f-7ce6990420ad',
  license: 'data.gov.il terms of use',
  licenseUrl: 'https://data.gov.il/he/terms-of-use',
  citation: 'משרד החינוך, מוסדות חינוך (mosdot_edu), data.gov.il, עודכן 05.10.2026 (נשלף 25.10.2026). Israel Ministry of Education, Educational institutions, via data.gov.il.',
};

const kit = measureKit(ID, source);

function popup() {
  const cat = (field: string): PopupFormat => {
    const labels = kit.terms.popupClasses?.[field] ?? kit.classLabels(field);
    return { type: 'category', labels };
  };
  return kit.popup([
    ['stream', cat('stream')],
    ['stage', cat('stage')],
    ['status', cat('status')],
    ['gender', cat('gender')],
    ['special', cat('special')],
    ['approx', cat('approx')],
  ]);
}

const inBounds = ([lo, hi]: readonly [number, number], v: number) => Number.isFinite(v) && v >= lo && v <= hi;

const schools: DatasetModule = {
  id: ID,
  info: datasetInfo(ID, []),
  rawFiles: [
    {
      path: FILE,
      url: URL,
      sha256: '3b5b8684fd773d7d486447c37a731452a197544d51432a42eaddd86b25f3b0e4', // the committed .gz
      gunzipSha256: 'f048c4de263f8a6249382388f72c7fb4c45f76710cdf1484b9bfc5401785e8f4', // the CSV as downloaded
      headers: { 'User-Agent': BROWSER_UA },
    },
  ],

  async build({ geometryCodes }) {
    const { rows, duplicates } = parseSchools(raw(FILE));
    const dropped: { code: string; reason: string }[] = [];
    const placeable = rows.filter((r) => {
      const ok = inBounds(ITM_BOUNDS.x, r.x) && inBounds(ITM_BOUNDS.y, r.y);
      if (!ok) dropped.push({ code: r.code, reason: `ITM ${r.x}, ${r.y} outside Israel` });
      return ok;
    });
    // Same 7-parameter datum path as the polygons (the build has already checked it on control points).
    const lonlat = await itmToWgs84(placeable.map((r) => [r.x, r.y]));
    const features: PointsData['features'] = [];
    placeable.forEach((r: SchoolRow, i) => {
      const [lon, lat] = lonlat[i];
      if (!inBounds(WGS84_BOUNDS.lon, lon) || !inBounds(WGS84_BOUNDS.lat, lat)) {
        dropped.push({ code: r.code, reason: `WGS84 ${lon}, ${lat} outside Israel` });
        return;
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round5(lon), round5(lat)] },
        properties: {
          code: r.code,
          name_he: r.name,
          locality_code: r.localityCode,
          stream: r.stream,
          stage: r.stage,
          status: r.status,
          ...(r.gender && { gender: r.gender }),
          ...(r.special && { special: r.special }),
          ...(r.approx && { approx: r.approx }),
        },
      });
    });
    features.sort((a, b) => Number(a.properties.code) - Number(b.properties.code));
    const notes = [
      `schools: ${rows.length} school rows (SHLAV_CHINUH 1–7), ${duplicates} duplicate codes dropped, ` +
        `${dropped.length} without usable coordinates dropped${dropped.length ? `: ${dropped.map((d) => `${d.code} (${d.reason})`).join(', ')}` : ''}; ` +
        `${features.length} points`,
    ];

    const parent = { level: 'localities-2011' as const, property: 'locality_code' };
    const fields = popup();
    return {
      files: { [DATA]: { type: 'FeatureCollection', features } satisfies PointsData },
      layers: [
        kit.pointsLayer('stream', 'stream', kit.nominalPoints('stream', STREAM_COLORS), fields, DATA, parent),
        kit.pointsLayer('stage', 'stage', kit.nominalPoints('stage', STAGE_COLORS), fields, DATA, parent),
      ],
      joins: [
        {
          ...join('schools: locality codes', 'localities-2011', features.map((f) => String(f.properties.locality_code)), geometryCodes['localities-2011'], [], NO_LOCALITY_POLYGON),
          pointsNoun: 'schools',
        },
      ],
      notes,
    };
  },
};

export default schools;
