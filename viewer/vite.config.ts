import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import type { Manifest } from '../pipeline/lib/contract.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(root, '../dist/data');
const outDir = path.resolve(root, '../dist/site');

/**
 * dist/data is the pipeline's committed output, so the viewer never builds into it: the dev server serves it at
 * /data/, and the build copies it to dist/site/data/ next to the bundle.
 */
function pipelineData(): Plugin {
  return {
    name: 'pipeline-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const file = path.join(dataDir, path.normalize(rel));
        if (!file.startsWith(dataDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });
    },
    // Copies the manifest and only the files its layers use (a level without a layer is not shipped).
    writeBundle() {
      const manifestFile = path.join(dataDir, 'layers.json');
      if (!fs.existsSync(manifestFile)) throw new Error(`${manifestFile} missing: run \`npm run build:data\``);
      const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
      const files = new Set(['layers.json']);
      for (const l of m.layers) {
        files.add(l.data);
        if (l.kind === 'choropleth') files.add(m.levels[l.level].file);
      }
      for (const rel of files) {
        const dest = path.join(outDir, 'data', rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(dataDir, rel), dest);
      }
    },
  };
}

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  plugins: [pipelineData()],
  build: {
    outDir,
    // outDir is outside the viewer root; it only ever holds this build (dist/data is a sibling, never touched).
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
