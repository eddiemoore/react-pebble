/**
 * src/platform.ts — Platform catalog.
 *
 * Shape metadata for every Pebble display variant. Consumed by the compiler
 * to emit the IR's `platform` field, and by `useScreen` / `getScreen` as a
 * fallback table when the runtime `screen` / `WatchInfo` globals aren't set
 * (Node, tests, mock mode).
 *
 * Runtime code should not read from this directly — use `useScreen()` or
 * `getScreen()` from `react-pebble/hooks` instead.
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
