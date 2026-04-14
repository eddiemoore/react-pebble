/**
 * useNotification — push a simple notification to the watch from PebbleKit JS.
 */

import { useCallback } from 'preact/hooks';

export interface SimpleNotification {
  title: string;
  body: string;
}

export interface UseNotificationResult {
  show: (notification: SimpleNotification) => void;
}

/**
 * Push a one-line notification to the watch from phone-side code.
 *
 * On Alloy (phone side): calls `Pebble.showSimpleNotificationOnPebble(title, body)`.
 * In mock mode: logs to console.
 *
 * Watchside code doesn't generally call this — it's for phone JS. The hook is
 * provided for symmetry with other hooks so apps that blend phone/watch logic
 * in the same source can call it from either side.
 */
export function useNotification(): UseNotificationResult {
  const show = useCallback((n: SimpleNotification) => {
    if (typeof globalThis === 'undefined') return;
    const g = globalThis as Record<string, unknown>;
    const pebble = g.Pebble as {
      showSimpleNotificationOnPebble?: (title: string, body: string) => void;
    } | undefined;
    if (pebble?.showSimpleNotificationOnPebble) {
      pebble.showSimpleNotificationOnPebble(n.title, n.body);
      return;
    }
    // Mock / non-phone runtime
    console.log(`[notification] ${n.title}: ${n.body}`);
  }, []);

  return { show };
}
