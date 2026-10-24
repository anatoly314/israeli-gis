import type { Layer, LevelId } from './contract.ts';
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
}

export interface DatasetOutput {
  /** Files written under dist/data/, keyed by path relative to it. */
  files: Record<string, unknown>;
  layers: Layer[];
  joins: JoinReport[];
}

export interface BuildContext {
  /** Codes present in each geometry level. */
  geometryCodes: Record<LevelId, Set<string>>;
}

/** A dataset lives in pipeline/datasets/<id>/ and default-exports one of these. */
export interface DatasetModule {
  id: string;
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
  };
}
