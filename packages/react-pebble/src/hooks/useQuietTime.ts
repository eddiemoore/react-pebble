/**
 * useQuietTime — detect Do Not Disturb mode.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

/**
 * Returns whether the watch is in Quiet Time (Do Not Disturb) mode.
 * Useful for watchfaces that should suppress animations or reduce
 * update frequency during Quiet Time.
 *
 * On Alloy: reads the `QuietTime` global.
 * In mock mode: returns false.
 */
export function useQuietTime(): boolean {
  const [isQuiet, setIsQuiet] = useState(false);

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).QuietTime) {
      const qt = (globalThis as Record<string, unknown>).QuietTime as {
        isActive?: () => boolean;
      };
      setIsQuiet(qt.isActive?.() ?? false);
    }
  }, []);

  return isQuiet;
}
