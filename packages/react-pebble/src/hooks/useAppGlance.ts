/**
 * useAppGlance — app launcher status display.
 */

import { useCallback } from 'preact/hooks';

export interface AppGlanceSlice {
  subtitle: string;
  icon?: unknown;
  expirationTime?: number;
}

export interface UseAppGlanceResult {
  update: (slices: AppGlanceSlice[]) => void;
}

/**
 * Build an AppGlance subtitle that dynamically renders as a countdown to
 * the given future timestamp (e.g. "in 5 min"). Mirrors the Pebble
 * `time_until` template format (%aT = abbreviated hours/mins, %uT = unit,
 * %0T = zero-padded digits).
 *
 * @param unixSecondsFuture — target Unix time in seconds
 * @param format — template string; defaults to `"%aT"` (e.g. "5m", "2h")
 */
export function appGlanceTimeUntil(unixSecondsFuture: number, format: string = '%aT'): string {
  return `<time_until ts="${unixSecondsFuture}" format="${format}">`;
}

/**
 * Build an AppGlance subtitle that dynamically renders as the elapsed time
 * since the given past timestamp (e.g. "3 min ago"). Mirrors
 * `time_since` template format.
 *
 * @param unixSecondsPast — past Unix time in seconds
 * @param format — template string; defaults to `"%aT ago"`
 */
export function appGlanceTimeSince(unixSecondsPast: number, format: string = '%aT ago'): string {
  return `<time_since ts="${unixSecondsPast}" format="${format}">`;
}

/**
 * Update the app glance (status shown in the app launcher).
 *
 * On Alloy: uses the `AppGlance` global.
 * In mock mode: no-op.
 */
export function useAppGlance(): UseAppGlanceResult {
  const update = useCallback((slices: AppGlanceSlice[]) => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppGlance) {
      const ag = (globalThis as Record<string, unknown>).AppGlance as {
        update?: (slices: AppGlanceSlice[]) => void;
      };
      ag.update?.(slices);
    }
  }, []);

  return { update };
}
