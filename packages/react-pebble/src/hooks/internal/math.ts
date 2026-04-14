/**
 * Math utilities for animation and polar coordinates — essential for
 * analog watchfaces.
 */

/**
 * Interpolate between two values using an animation progress (0-1).
 */
export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/**
 * Convert degrees to radians.
 */
export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 */
export function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Compute {x, y} at a given angle and radius from a center point.
 * Angle is in degrees, 0 = 12 o'clock (north), clockwise.
 */
export function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  // Convert to math radians: 0° north = -90° in standard math
  const rad = degreesToRadians(angleDeg - 90);
  return {
    x: Math.round(cx + radius * Math.cos(rad)),
    y: Math.round(cy + radius * Math.sin(rad)),
  };
}

/**
 * Compute the angle in degrees between two points.
 * Returns 0-360 with 0 = north, clockwise.
 */
export function angleBetweenPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const rad = Math.atan2(x2 - x1, -(y2 - y1));
  return ((rad * 180) / Math.PI + 360) % 360;
}
