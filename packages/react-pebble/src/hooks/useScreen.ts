/**
 * useScreen — runtime screen dimensions + platform info.
 *
 * Reads from the Moddable `screen` global for dimensions and from the
 * Pebble SDK `WatchInfo` global for `isRound` / `platform`. Falls back
 * to emery-sized mock values when running in Node (tests, compiler).
 *
 * Screen size is static for an app's lifetime on Alloy (no rotation,
 * no resize), so the result is memoized on first call and the hook
 * doesn't subscribe — it just reads the cache.
 */

import { PLATFORMS } from '../platform.js';

export interface ScreenInfo {
  width: number;
  height: number;
  isRound: boolean;
  platform: string;
}

let cached: ScreenInfo | undefined;

/**
 * Synchronous screen accessor. Safe to call at module load time
 * (e.g. deriving constants like `const VIEW_H = getScreen().height - HEADER_H`).
 */
export function getScreen(): ScreenInfo {
  if (cached) return cached;

  const g = globalThis as Record<string, unknown>;
  const scr = g.screen as { width?: number; height?: number } | undefined;
  const wi = g.WatchInfo as { platform?: string; isRound?: boolean } | undefined;

  let width = typeof scr?.width === 'number' ? scr.width : undefined;
  let height = typeof scr?.height === 'number' ? scr.height : undefined;

  let platformName: string;
  if (wi?.platform) {
    platformName = wi.platform;
  } else if (width !== undefined && height !== undefined) {
    platformName =
      Object.values(PLATFORMS).find((p) => p.width === width && p.height === height)?.name ??
      'unknown';
  } else {
    platformName = 'mock';
  }

  if (width === undefined || height === undefined) {
    const p = PLATFORMS[platformName] ?? PLATFORMS.emery!;
    width = p.width;
    height = p.height;
  }

  const isRound =
    typeof wi?.isRound === 'boolean' ? wi.isRound : PLATFORMS[platformName]?.isRound ?? false;

  cached = { width, height, isRound, platform: platformName };
  return cached;
}

/**
 * React hook form. Screen size never changes on Alloy, so this is
 * equivalent to calling `getScreen()` directly — no subscription or
 * re-render triggering. Provided for idiomatic React usage.
 */
export function useScreen(): ScreenInfo {
  return getScreen();
}

/** @internal — test / compiler helper to clear the memoized value. */
export function _resetScreenCache(): void {
  cached = undefined;
}
