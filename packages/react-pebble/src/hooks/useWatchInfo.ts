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
 * On Alloy: reads from `WatchInfo` global if available.
 * In mock mode: derives from SCREEN constants.
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

  // Mock mode: derive from SCREEN (imported lazily to avoid circular deps)
  return {
    model: 'mock',
    platform: 'emery',
    isRound: false,
    isColor: true,
  };
}
