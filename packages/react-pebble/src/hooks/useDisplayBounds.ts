/**
 * useDisplayBounds — content rect that accounts for round displays.
 */

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
  // Import SCREEN lazily to avoid circular deps
  const screen = (globalThis as Record<string, unknown>).__PEBBLE_SCREEN__ as
    | { width: number; height: number; isRound: boolean }
    | undefined;

  const w = screen?.width ?? 200;
  const h = screen?.height ?? 228;
  const isRound = screen?.isRound ?? false;

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
