/**
 * useUnobstructedArea — adapt to timeline peek obstructions.
 */

export interface UnobstructedArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Returns the unobstructed screen area (excluding timeline peek, etc.).
 *
 * On Alloy: reads `screen.unobstructed`.
 * In mock mode: returns full screen dimensions.
 */
export function useUnobstructedArea(): UnobstructedArea {
  if (typeof screen !== 'undefined' && screen) {
    const s = screen as unknown as {
      width: number; height: number;
      unobstructed?: { x: number; y: number; w: number; h: number };
    };
    if (s.unobstructed) return { x: s.unobstructed.x, y: s.unobstructed.y, w: s.unobstructed.w, h: s.unobstructed.h };
    return { x: 0, y: 0, w: s.width, h: s.height };
  }
  // Mock mode
  return { x: 0, y: 0, w: 200, h: 228 };
}
