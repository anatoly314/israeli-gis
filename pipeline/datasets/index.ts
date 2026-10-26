import type { DatasetModule } from '../lib/dataset.ts';
import census2022 from './census-2022/index.ts';
import peripherality2020 from './peripherality-2020/index.ts';
import population2024 from './population-2024/index.ts';
import schools2026 from './schools-2026/index.ts';
import ses2021 from './ses-2021/index.ts';

/** Register new datasets here; each layer in layers.json comes from one of these, in this order. */
export const datasets: DatasetModule[] = [ses2021, peripherality2020, population2024, census2022, schools2026];
