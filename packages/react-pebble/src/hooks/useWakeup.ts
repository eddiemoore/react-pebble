/**
 * useWakeup — schedule app launches at future times.
 */

import { useCallback } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseWakeupResult {
  /** Schedule a wakeup. Returns wakeup ID or null on failure. */
  schedule: (timestamp: number, cookie?: number) => number | null;
  /** Cancel a scheduled wakeup. */
  cancel: (id: number) => void;
  /** Cancel all wakeups for this app. */
  cancelAll: () => void;
  /** The wakeup event that launched this app (null if normal launch). */
  launchEvent: { id: number; cookie: number } | null;
}

/**
 * Schedule the app to launch at a future time.
 *
 * On Alloy: uses the `Wakeup` global (max 8 per app).
 * In mock mode: no-op with null returns.
 */
export function useWakeup(): UseWakeupResult {
  const [launchEvent] = useState<{ id: number; cookie: number } | null>(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        getLaunchEvent?: () => { id: number; cookie: number } | null;
      };
      return wk.getLaunchEvent?.() ?? null;
    }
    return null;
  });

  const schedule = useCallback((timestamp: number, cookie = 0): number | null => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        schedule?: (ts: number, cookie: number) => number | null;
      };
      return wk.schedule?.(timestamp, cookie) ?? null;
    }
    return null;
  }, []);

  const cancel = useCallback((id: number) => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        cancel?: (id: number) => void;
      };
      wk.cancel?.(id);
    }
  }, []);

  const cancelAll = useCallback(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        cancelAll?: () => void;
      };
      wk.cancelAll?.();
    }
  }, []);

  return { schedule, cancel, cancelAll, launchEvent };
}
