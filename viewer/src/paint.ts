import type { ExpressionSpecification } from 'maplibre-gl';

// Paint values for the data layers, kept apart from map.ts (which needs a browser) so tests can check them.

/** Fill opacity of a class colour. */
export const FILL = 0.85;
/**
 * Highlighting turns the other features a flat grey instead of a faded class colour: with a diverging palette a
 * faded dark blue or red would read as one of the pale middle classes. Dark enough that a highlighted pale class
 * (RdYlBu 6, #e0f3f8) still stands out; "not calculated" stays apart by its hatch.
 */
export const DIM_COLOR = '#c4c4c4';
export const DIM = 0.45;

const state = (key: string): ExpressionSpecification => ['boolean', ['feature-state', key], false];
export const active: ExpressionSpecification = ['any', state('hover'), state('selected')];

/** Dark, translucent borders: pale classes keep an edge on the light basemap, also at country zoom. */
export const BORDER: { 'line-color': string; 'line-opacity': ExpressionSpecification; 'line-width': ExpressionSpecification } = {
  'line-color': '#3a3a3a',
  'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.45, 9, 0.45, 12, 0.55],
  'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 9, 0.8, 12, 1.2, 15, 2],
};

const outlineWidth: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 6, 1.6, 12, 3];

/** Hover/selection outline: near-black over a white casing, so it reads on dark (1, 10) and pale classes alike. */
export const OUTLINE = { color: '#111111', width: outlineWidth } as const;
export const CASING = {
  color: '#ffffff',
  width: ['interpolate', ['linear'], ['zoom'], 6, 3.6, 12, 5.5] as ExpressionSpecification,
} as const;

/** Placeholder markers: a dark translucent ring when idle, so pale-class markers stay visible on the basemap. */
export const MARKER_STROKE: ExpressionSpecification = ['case', active, '#111111', 'rgba(58,58,58,0.65)'];
export const MARKER_STROKE_WIDTH: ExpressionSpecification = ['case', active, 2.5, 1.2];
