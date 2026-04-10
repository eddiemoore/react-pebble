/**
 * src/platform.ts — Screen dimensions and platform constants.
 *
 * The compiler sets these before rendering so components can use
 * SCREEN.width / SCREEN.height instead of hardcoding pixel values.
 *
 * Usage:
 *   import { SCREEN } from 'react-pebble';
 *   <Rect x={0} y={0} w={SCREEN.width} h={SCREEN.height} fill="black" />
 */

export interface PebblePlatform {
  name: string;
  width: number;
  height: number;
  isRound: boolean;
}

export const PLATFORMS: Record<string, PebblePlatform> = {
  emery: { name: 'emery', width: 200, height: 228, isRound: false },
  gabbro: { name: 'gabbro', width: 200, height: 228, isRound: false },
  // These are NOT supported by Alloy, but listed for reference/future Rocky.js:
  basalt: { name: 'basalt', width: 144, height: 168, isRound: false },
  chalk: { name: 'chalk', width: 180, height: 180, isRound: true },
  diorite: { name: 'diorite', width: 144, height: 168, isRound: false },
  aplite: { name: 'aplite', width: 144, height: 168, isRound: false },
};

/**
 * Current screen dimensions. Set by the compiler before rendering.
 * Components import this and use SCREEN.width / SCREEN.height for
 * responsive layouts.
 */
export const SCREEN = {
  width: 200,
  height: 228,
  isRound: false,
  platform: 'emery',
};

/** @internal — called by the compiler to set the platform. */
export function _setPlatform(platform: string): void {
  const p = PLATFORMS[platform];
  if (p) {
    SCREEN.width = p.width;
    SCREEN.height = p.height;
    SCREEN.isRound = p.isRound;
    SCREEN.platform = p.name;
  }
}
