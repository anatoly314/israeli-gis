import type { DatasetModule } from '../lib/dataset.ts';
import ses2021 from './ses-2021/index.ts';

/** Register new datasets here; each layer in layers.json comes from one of these. */
export const datasets: DatasetModule[] = [ses2021];
