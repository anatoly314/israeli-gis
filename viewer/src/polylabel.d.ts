declare module 'polylabel' {
  /** Pole of inaccessibility of a polygon (rings of [x, y]); `distance` is to the nearest edge. */
  export default function polylabel(polygon: number[][][], precision?: number, debug?: boolean): number[] & { distance: number };
}
