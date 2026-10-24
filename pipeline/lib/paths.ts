import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const RAW_DIR = path.join(ROOT, 'data/raw');
export const DIST_DIR = path.join(ROOT, 'dist/data');

export const raw = (...parts: string[]) => path.join(RAW_DIR, ...parts);
