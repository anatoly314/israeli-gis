import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology as TopoSpec } from 'topojson-specification';
import {
  buildBoundaries,
  levelTopology,
  rawFiles as boundaryFiles,
  attribution,
  sources,
  type CompanionJoin,
  type NameStats,
} from './boundaries/index.ts';
import { datasets } from './datasets/index.ts';
import { DatasetValues, LANGS, LEVEL_IDS, Manifest, PLURAL_CATEGORIES, manifestJsonSchema, type CountForms, type Lang, type Layer, type Level, type LevelId } from './lib/contract.ts';
import type { JoinReport } from './lib/dataset.ts';
import { verifyRawFile } from './lib/download.ts';
import { assertDatumShift, invalidGeometries } from './lib/gdal.ts';
import { writeOut, writeOutJson, type WrittenFile } from './lib/io.ts';
import { layerTitle, levelKind, termsFor } from './terminology.ts';

export interface BuildReport {
  datumErrorM: number;
  joins: JoinReport[];
  names: Record<LevelId, NameStats>;
  placeholders: number;
  dropped: { noJurisdiction: number; noStatus: number };
  review: string[];
  /** Companion attribute joins, with coverage of each choropleth layer's rows on the same level. */
  companions: (CompanionJoin & { layers: { id: string; rows: number; matched: number }[] })[];
  /** What the passed checks covered. */
  checks: { rawFiles: number; validFeatures: number };
  written: WrittenFile[];
}

/**
 * Every level resolves to a complete terminology entry (he/en/ru, non-empty) and carries exactly its wording,
 * so a new level kind or vintage can't ship with missing or stale names.
 */
export function assertTerminology(m: Manifest): void {
  for (const [id, level] of Object.entries(m.levels)) {
    const terms = termsFor(id);
    if (level.kind !== levelKind(id)) throw new Error(`${id}: kind ${level.kind} does not match its id`);
    const pick = (t: { title?: unknown; officialTerm?: unknown; featureType?: unknown; featureLabel?: unknown }, types: unknown) =>
      JSON.stringify([t.title, t.officialTerm, t.featureType, t.featureLabel ?? null, types ?? null]);
    const applied = pick(level, level.featureTypes?.labels);
    const expected = pick(terms, terms.featureTypes);
    if (applied !== expected) throw new Error(`${id}: level wording differs from pipeline/terminology.ts`);
    for (const f of level.extraFields ?? []) {
      const t = terms.extraFields?.[f.property];
      const labels = (x: { label: unknown; shortLabel?: unknown; searchTerm?: unknown }) => JSON.stringify([x.label, x.shortLabel ?? null, x.searchTerm ?? null]);
      if (!t || labels(f) !== labels(t)) {
        throw new Error(`${id}: extra field ${f.property} has no or a different label in pipeline/terminology.ts`);
      }
      if (f.searchable && !f.searchTerm) throw new Error(`${id}: searchable extra field ${f.property} needs a searchTerm in pipeline/terminology.ts`);
    }
    if (JSON.stringify(level.countForms ?? null) !== JSON.stringify(terms.countForms ?? null)) {
      throw new Error(`${id}: countForms differ from pipeline/terminology.ts`);
    }
    // Parts of a place are counted per place in search results: every language needs a phrase for every plural
    // category Intl.PluralRules gives integers.
    if (level.parentCode) {
      if (!level.countForms) throw new Error(`${id}: has a parentCode but no countForms in pipeline/terminology.ts`);
      const missing = missingCountForms(level.countForms);
      if (missing.length) throw new Error(`${id}: countForms lack ${missing.join(', ')}`);
    }
  }
  // One Russian rendering of the CBS term: "статистические районы", never mixed with "статистические участки".
  const text = JSON.stringify(m);
  if (/статистическ\p{L}* район/iu.test(text) && /статистическ\p{L}* участк/iu.test(text)) {
    throw new Error('manifest mixes "статистические районы" and "статистические участки"; use "статистические районы"');
  }
  // Layer titles are derived, never written by hand: datasets[id].title + " – " + the level's title.
  for (const l of m.layers) {
    if (l.kind !== 'choropleth') continue;
    if (JSON.stringify(l.title) !== JSON.stringify(layerTitle(m.datasets[l.dataset].title, l.level))) {
      throw new Error(`${l.id}: title is not datasets["${l.dataset}"].title + the level title`);
    }
  }
}

/** Plural categories `Intl.PluralRules(lang)` uses for the integers 0–1000. */
export function pluralCategories(lang: Lang): PluralCategory[] {
  const rules = new Intl.PluralRules(lang);
  const out = new Set<PluralCategory>();
  for (let n = 0; n <= 1000; n++) out.add(rules.select(n) as PluralCategory);
  return [...out];
}
type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** `lang.category` pairs that have no count phrase ("ru.few"); [] when every language is covered. */
export function missingCountForms(forms: CountForms): string[] {
  return LANGS.flatMap((lang) => pluralCategories(lang).filter((c) => !forms[lang][c]).map((c) => `${lang}.${c}`));
}

export const allRawFiles = () => [...boundaryFiles, ...datasets.flatMap((d) => d.rawFiles)];

/**
 * raw → `outDir`. Throws, after writing whatever it got to, if a raw file fails its hash, a table code has no
 * geometry, a geometry is invalid, or the manifest breaks the contract; callers decide whether to publish.
 */
export async function buildAll(outDir: string): Promise<BuildReport> {
  const verified = allRawFiles().filter((f) => !f.reference);
  for (const f of verified) verifyRawFile(f);
  let validFeatures = 0;

  const datumErrorM = await assertDatumShift(1);
  const boundaries = await buildBoundaries();

  const written: WrittenFile[] = [];
  const levels = {} as Record<LevelId, Level>;
  const geometryCodes = {} as Record<LevelId, Set<string>>;

  for (const id of LEVEL_IDS) {
    const level = boundaries.levels[id];
    const topo = await levelTopology(level);
    const polygons = feature(topo as unknown as TopoSpec, topo.objects[level.meta.object] as never) as unknown as FeatureCollection;
    const codes = polygons.features.map((f) => String(f.properties?.code));
    geometryCodes[id] = new Set(codes);
    if (geometryCodes[id].size !== codes.length) throw new Error(`${id}: duplicate codes after dissolve`);

    const invalid = await invalidGeometries(polygons, 'code');
    if (invalid.length) {
      throw new Error(`${id}: ${invalid.length} invalid geometries, e.g. ${invalid.slice(0, 5).map((i) => `${i.id} ${i.reason}`).join('; ')}`);
    }
    validFeatures += codes.length;

    // Every type value on the features needs a label in the terminology.
    const types = level.meta.featureTypes;
    if (types) {
      const unlabelled = new Set(polygons.features.map((f) => String(f.properties?.[types.property])).filter((v) => !types.labels[v]));
      if (unlabelled.size) throw new Error(`${id}: no terminology featureTypes label for ${[...unlabelled].join(', ')}`);
    }

    levels[id] = {
      ...level.meta,
      featureCount: codes.length,
      placeholderCount: polygons.features.filter((f) => f.properties?.placeholder === true).length,
    };
    written.push(writeOut(outDir, level.meta.file, JSON.stringify(topo)));
  }

  const layers: Layer[] = [];
  const joins: JoinReport[] = [];
  const datasetCodes = new Map<string, string[]>();
  for (const d of datasets) {
    const out = await d.build({ geometryCodes });
    for (const [path, data] of Object.entries(out.files)) {
      DatasetValues.parse(data);
      datasetCodes.set(path, Object.keys(data as object));
      written.push(writeOutJson(outDir, path, data));
    }
    layers.push(...out.layers);
    joins.push(...out.joins);
  }

  const companions = boundaries.companions.map((c) => {
    const have = new Set(c.matchedCodes);
    const onLevel = layers.filter((l): l is Extract<Layer, { kind: 'choropleth' }> => l.kind === 'choropleth' && l.level === c.level);
    return {
      ...c,
      layers: onLevel.map((l) => {
        const codes = datasetCodes.get(l.data) ?? [];
        return { id: l.id, rows: codes.length, matched: codes.filter((code) => have.has(code)).length };
      }),
    };
  });

  const unmatched = joins.filter((j) => j.unmatched.length);
  if (unmatched.length) {
    throw new Error(`Table codes without geometry:\n${unmatched.map((j) => `  ${j.label}: ${j.unmatched.join(', ')}`).join('\n')}`);
  }

  const datasetInfo = Object.fromEntries(datasets.map((d) => [d.id, d.info]));
  const manifest = Manifest.parse({ version: 1, levels, datasets: datasetInfo, layers, attribution, sources } satisfies Manifest);
  assertTerminology(manifest);
  written.push(writeOutJson(outDir, 'layers.json', manifest, true));
  written.push(writeOutJson(outDir, 'layers.schema.json', manifestJsonSchema(), true));

  return {
    datumErrorM,
    joins,
    names: boundaries.names,
    placeholders: boundaries.placeholders,
    dropped: boundaries.dropped,
    review: boundaries.review,
    companions,
    checks: { rawFiles: verified.length, validFeatures },
    written,
  };
}
