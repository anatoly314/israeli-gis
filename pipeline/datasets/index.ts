import type { DatasetModule } from '../lib/dataset.ts';
import peripherality2020 from './peripherality-2020/index.ts';
import ses2021 from './ses-2021/index.ts';

/** Register new datasets here; each layer in layers.json comes from one of these, in this order. */
export const datasets: DatasetModule[] = [ses2021, peripherality2020];
