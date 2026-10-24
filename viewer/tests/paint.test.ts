import { describe, expect, it } from 'vitest';
import { contrast, luminance } from '../src/classify.ts';
import { BORDER, CASING, DIM, DIM_COLOR, FILL, MARKER_STROKE, MARKER_STROKE_WIDTH, OUTLINE } from '../src/paint.ts';
import { manifest } from './fixtures.ts';

const BASEMAP = '#f2f2ef'; // Positron land
const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** `top` at `alpha` over `under`, as #rrggbb. */
const over = (top: string, alpha: number, under: string) => {
  const [a, b] = [rgb(top), rgb(under)];
  return `#${a.map((v, i) => hex(v * alpha + b[i] * (1 - alpha))).join('')}`;
};
const classes = () => {
  const c = manifest().layers[0].classification;
  return c.type === 'categorical' ? c.classes.map((k) => k.color) : [];
};
/** Value of an `interpolate` zoom expression at its first stop. */
const atFirstStop = (e: unknown) => (e as number[])[4];

describe('paint for the RdYlBu palette', () => {
  it('rings idle placeholder markers in dark translucent grey, visible on pale classes and the basemap', () => {
    expect(MARKER_STROKE).toEqual(['case', expect.anything(), '#111111', 'rgba(58,58,58,0.65)']);
    expect(MARKER_STROKE_WIDTH[3]).toBeGreaterThanOrEqual(1.2);
    const ring = over('#3a3a3a', 0.65, BASEMAP);
    for (const fill of ['#e0f3f8', '#fee090', BASEMAP]) expect(contrast(ring, fill), fill).toBeGreaterThanOrEqual(3);
  });

  it('draws borders that read at country zoom', () => {
    expect(atFirstStop(BORDER['line-width'])).toBeGreaterThanOrEqual(0.6);
    expect(atFirstStop(BORDER['line-opacity'])).toBeGreaterThanOrEqual(0.45);
  });

  it('outlines hover/selection at 3:1 or better against every class (dark line or its white casing)', () => {
    for (const c of classes()) expect(Math.max(contrast(OUTLINE.color, c), contrast(CASING.color, c)), c).toBeGreaterThanOrEqual(3);
    expect(contrast(CASING.color, '#313695')).toBeGreaterThanOrEqual(3); // cluster 10
    expect(contrast(CASING.color, '#a50026')).toBeGreaterThanOrEqual(3); // cluster 1
  });

  it('dims to a grey darker than the highlighted pale classes, so a selected cluster 5 or 6 stands out', () => {
    const dimmed = over(DIM_COLOR, DIM, BASEMAP);
    for (const pale of ['#fee090', '#e0f3f8']) expect(luminance(over(pale, FILL, BASEMAP))).toBeGreaterThan(luminance(dimmed));
    // …and lighter than the dark classes, so it never reads as one of them.
    for (const dark of ['#a50026', '#d73027', '#4575b4', '#313695']) expect(luminance(over(dark, FILL, BASEMAP))).toBeLessThan(luminance(dimmed));
  });
});
