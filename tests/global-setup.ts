import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { buildAll, type BuildReport } from '../pipeline/run.ts';

// Tests run against a fresh build in a temp dir, never against whatever happens to be in dist/data;
// tests/dist-fresh.test.ts then checks that the committed dist/data equals this build byte for byte.
export default async function setup(project: TestProject) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'israeli-gis-test-'));
  const report = await buildAll(dir);
  project.provide('buildDir', dir);
  project.provide('buildReport', report);
  return () => fs.rmSync(dir, { recursive: true, force: true });
}

declare module 'vitest' {
  export interface ProvidedContext {
    buildDir: string;
    buildReport: BuildReport;
  }
}
