/**
 * useWatchInfo — device model, platform, display capabilities.
 */

export interface WatchInfo {
  model: string;
  platform: string;
  isRound: boolean;
  isColor: boolean;
}

/**
 * Returns information about the watch hardware.
 *
 * Reads from the `WatchInfo` global set by the Pebble SDK when available
 * (Alloy or when the compiler stubs the global for analysis). Falls back
 * to emery-shaped mock values when neither is present.
 */
export function useWatchInfo(): WatchInfo {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).WatchInfo) {
    const info = (globalThis as Record<string, unknown>).WatchInfo as {
      model?: string;
      platform?: string;
      isRound?: boolean;
      isColor?: boolean;
    };
    return {
      model: info.model ?? 'unknown',
      platform: info.platform ?? 'unknown',
      isRound: info.isRound ?? false,
      isColor: info.isColor ?? true,
    };
  }

  return {
    model: 'mock',
    platform: 'emery',
    isRound: false,
    isColor: true,
  };
}
