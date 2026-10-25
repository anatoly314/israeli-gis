// Named colour scales for classifications, so a dataset picks one by name instead of copying hex lists.
// Values are the published 10-class schemes, checked against d3-scale-chromatic (src/diverging/RdYlBu.js,
// src/sequential-multi/viridis.js and interpolateYlGn sampled at 10) and the ColorBrewer export (colorbrewer.json).

const PALETTES = {
  /**
   * ColorBrewer RdYlBu, diverging and colourblind-safe: red (low) → pale yellow/blue (middle) → blue (high). Note:
   * ColorBrewer rates RdYlBu "screen-friendly" only up to 8 classes; the 10-class version relies on borders to keep
   * its pale middle readable on screen.
   */
  RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
  /**
   * viridis, sequential: dark purple (low) → yellow (high). Kept on purpose as the second named palette, for
   * one-directional data (rates, counts) where a diverging scale's middle would suggest a meaningful midpoint.
   */
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  /**
   * ColorBrewer YlGn, sequential multi-hue and colourblind-safe: pale yellow (low) → dark green (high). ColorBrewer
   * publishes sequential schemes up to 9 classes, so these are d3-scale-chromatic 3.0.0 (installed via mapshaper) `interpolateYlGn` (a basis
   * spline through the 9-class scheme) sampled at t = i/9 with `quantize(interpolateYlGn, 10)`; the ends equal the
   * ColorBrewer endpoints #ffffe5 and #004529. Its hues don't occur in RdYlBu, so a YlGn layer can't be mistaken
   * for an SES one.
   */
  YlGn: ['#ffffe5', '#f5fbc0', '#dff2a8', '#bbe395', '#8fd082', '#60ba6c', '#389d55', '#1b7f41', '#046335', '#004529'],
} as const;

export type PaletteName = keyof typeof PALETTES;

/** The 10 colours of a named palette, low → high. */
export const palette10 = (name: PaletteName): string[] => [...PALETTES[name]];

/**
 * ColorBrewer schemes for stepped classifications whose class count isn't 10. BrBG8 is the published scheme exactly
 * as d3-scale-chromatic 3.0.0 ships it (`schemeBrBG[8]`).
 */
const COLORBREWER = {
  /**
   * Sequential blue → purple, colourblind-safe; no hue shared with RdYlBu's reds or YlGn's greens. The published
   * BuPu starts at near-white (#f7fcfd / #edf8fb), which reads as "unfilled" on the pale basemap for the ~400
   * smallest localities. So these sample d3-scale-chromatic 3.0.0 `interpolateBuPu` (the spline through the 9-class
   * scheme) evenly over t = 0.15…1: same hue path and lightness order, a visibly tinted first class, same dark end.
   */
  BuPu7: ['#d9e6f1', '#b4cbe2', '#96aad0', '#8c7cb9', '#894ca1', '#7d197f', '#4d004b'],
  BuPu9: ['#d9e6f1', '#bdd2e6', '#a3bcda', '#929fcb', '#8c7cb9', '#8a58a8', '#863292', '#751073', '#4d004b'],
  /** Diverging brown ↔ teal, colourblind-safe; distinct from RdYlBu's red ↔ blue. */
  BrBG8: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
} as const;

export const colorbrewer = (name: keyof typeof COLORBREWER): string[] => [...COLORBREWER[name]];

/**
 * Okabe-Ito qualitative palette (Okabe & Ito 2008, "Color Universal Design"), built to stay distinguishable under
 * every common colour-vision deficiency. Hex values as in R's grDevices `palette.colors(palette = "Okabe-Ito")`
 * (src/library/grDevices/R/colorstuff.R). Black and grey are left out: they read as borders or "no data".
 */
export const OKABE_ITO = {
  orange: '#e69f00',
  skyBlue: '#56b4e9',
  bluishGreen: '#009e73',
  yellow: '#f0e442',
  blue: '#0072b2',
  vermillion: '#d55e00',
  reddishPurple: '#cc79a7',
} as const;
