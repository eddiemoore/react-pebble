/**
 * Pebble-convention trig utilities (0-65536 angle range).
 */

/**
 * Pebble's full-circle angle constant (equivalent to 360°).
 */
export const TRIG_MAX_ANGLE = 0x10000; // 65536

/**
 * Sine lookup using Pebble angle convention.
 * Input: angle in 0-65536 range (0 = 0°, 16384 = 90°, 32768 = 180°).
 * Output: scaled to -65536..+65536 (divide by TRIG_MAX_ANGLE for -1..1).
 */
export function sinLookup(angle: number): number {
  const rad = (angle / TRIG_MAX_ANGLE) * 2 * Math.PI;
  return Math.round(Math.sin(rad) * TRIG_MAX_ANGLE);
}

/**
 * Cosine lookup using Pebble angle convention.
 * Same scale as sinLookup.
 */
export function cosLookup(angle: number): number {
  const rad = (angle / TRIG_MAX_ANGLE) * 2 * Math.PI;
  return Math.round(Math.cos(rad) * TRIG_MAX_ANGLE);
}

/**
 * atan2 returning Pebble-convention angle (0-65536).
 */
export function atan2Lookup(y: number, x: number): number {
  const rad = Math.atan2(y, x);
  return Math.round(((rad / (2 * Math.PI)) * TRIG_MAX_ANGLE + TRIG_MAX_ANGLE) % TRIG_MAX_ANGLE);
}
