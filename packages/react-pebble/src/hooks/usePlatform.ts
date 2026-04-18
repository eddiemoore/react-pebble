/**
 * usePlatform — combined platform info from useWatchInfo + useScreen.
 *
 * Provides a single hook with all platform-related fields for easy
 * conditional rendering based on device capabilities and form factor.
 */

import { useWatchInfo } from './useWatchInfo.js';
import { useScreen } from './useScreen.js';

export interface PlatformInfo {
  /** Screen width in pixels. */
  width: number;
  /** Screen height in pixels. */
  height: number;
  /** Whether the display is round (chalk). */
  isRound: boolean;
  /** Whether the display supports color. */
  isColor: boolean;
  /** Platform name (e.g. 'basalt', 'chalk', 'aplite', 'diorite', 'emery'). */
  platform: string;
}

/**
 * Returns combined platform info from watch hardware and screen dimensions.
 */
export function usePlatform(): PlatformInfo {
  const { isColor } = useWatchInfo();
  const { width, height, isRound, platform } = useScreen();

  return { width, height, isRound, isColor, platform };
}
