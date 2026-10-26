import type { DatasetInfo, I18n, Layer, LevelId } from './contract.ts';
import type { RawFile } from './download.ts';

export interface JoinCount {
  label: string;
  rows: number;
  matched: number;
}

export interface JoinReport extends JoinCount {
  level: LevelId;
  unmatched: string[];
  /** Geometry features at this level with no row in the table, i.e. drawn as "missing". */
  geometryWithoutData: number;
  /** Optional per-subset counts, e.g. municipalities vs regional councils. */
  breakdown: JoinCount[];
  /**
   * Codes known to have no polygon, with the reason (localities founded after the 2011 geometry). The build fails if
   * `unmatched` differs from this list in either direction, so it can neither hide a new miss nor go stale.
   */
  expectedUnmatched?: Record<string, string>;
  /**
   * Set when the rows are points (e.g. "schools") rather than one row per area: several rows share a code, and
   * polygons without points are normal, so the report counts unmatched rows and codes instead.
   */
  pointsNoun?: string;
}

export interface DatasetOutput {
  /** Files written under dist/data/, keyed by path relative to it. */
  files: Record<string, unknown>;
  layers: Layer[];
  joins: JoinReport[];
  /** Extra lines for the build report (counts the joins don't show, e.g. points dropped for bad coordinates). */
  notes?: string[];
  /**
   * Per-feature notes computed from the data (level → code → text), merged into `manifest.datasets[id].notes` next
   * to the fixed ones from the terminology.
   */
  featureNotes?: Partial<Record<LevelId, Record<string, I18n>>>;
}

export interface BuildContext {
  /** Codes present in each geometry level. */
  geometryCodes: Record<LevelId, Set<string>>;
}

/** A dataset lives in pipeline/datasets/<id>/ and default-exports one of these. */
export interface DatasetModule {
  id: string;
  /** Written to `manifest.datasets[id]`; layer titles are composed from `info.title` + the level title. */
  info: DatasetInfo;
  rawFiles: RawFile[];
  build(ctx: BuildContext): Promise<DatasetOutput> | DatasetOutput;
}

/** Matches table codes against one geometry level; `subsets` split the counts for the report. */
export function join(
  label: string,
  level: LevelId,
  codes: string[],
  geometry: Set<string>,
  subsets: { label: string; codes: string[] }[] = [],
  expectedUnmatched?: Record<string, string>,
): JoinReport {
  const have = new Set(codes);
  const unmatched = codes.filter((c) => !geometry.has(c));
  const count = (l: string, cs: string[]): JoinCount => ({ label: l, rows: cs.length, matched: cs.filter((c) => geometry.has(c)).length });
  return {
    ...count(label, codes),
    level,
    unmatched,
    geometryWithoutData: [...geometry].filter((c) => !have.has(c)).length,
    breakdown: subsets.map((s) => count(s.label, s.codes)),
    ...(expectedUnmatched && { expectedUnmatched }),
  };
}

/** Unmatched codes the dataset didn't declare, and declared ones that now match; [] when the join is as expected. */
export function unexpectedUnmatched(j: JoinReport): string[] {
  const expected = new Set(Object.keys(j.expectedUnmatched ?? {}));
  const actual = new Set(j.unmatched);
  return [
    ...j.unmatched.filter((c) => !expected.has(c)).map((c) => `${c} has no polygon`),
    ...[...expected].filter((c) => !actual.has(c)).map((c) => `${c} is listed as unmatched but matches`),
  ];
}
