/**
 * useDisplayBounds — content rect that accounts for round displays.
 */

import { getScreen } from './useScreen.js';

export interface DisplayBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  isRound: boolean;
}

/**
 * Returns the usable content rectangle for the current display shape.
 * On round displays, this inscribes a rectangle inside the circle,
 * inset by the given padding. On rectangular displays, returns the
 * full screen minus padding.
 */
export function useDisplayBounds(padding: number = 0): DisplayBounds {
  const { width: w, height: h, isRound } = getScreen();

  if (isRound) {
    // Inscribe a rectangle in the circle (largest rect with ~70.7% of diameter)
    const r = Math.min(w, h) / 2;
    const inset = Math.round(r - (r * Math.SQRT1_2)) + padding;
    return {
      x: inset,
      y: inset,
      w: w - inset * 2,
      h: h - inset * 2,
      isRound: true,
    };
  }

  return {
    x: padding,
    y: padding,
    w: w - padding * 2,
    h: h - padding * 2,
    isRound: false,
  };
}
