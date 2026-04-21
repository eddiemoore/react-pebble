/**
 * useSniffInterval — Bluetooth sniff interval control.
 *
 * Controls the Bluetooth connection interval for power vs latency tradeoff.
 * Use 'reduced' during heavy communication for lower latency, then switch
 * back to 'normal' to conserve battery.
 */

import { useCallback } from 'preact/hooks';

export type SniffInterval = 'normal' | 'reduced';

export interface UseSniffIntervalResult {
  /** Set the Bluetooth sniff interval. */
  setInterval: (interval: SniffInterval) => void;
  /** Get the current sniff interval. */
  getInterval: () => SniffInterval;
}

/**
 * Control the Bluetooth sniff interval for power/latency tuning.
 *
 * On Alloy: uses the `AppComm` global.
 * In mock mode: returns no-op functions that default to 'normal'.
 *
 * Pebble C equivalent: `app_comm_set_sniff_interval()` / `app_comm_get_sniff_interval()`
 */
export function useSniffInterval(): UseSniffIntervalResult {
  const noopSet = useCallback((_interval: SniffInterval) => {}, []);
  const noopGet = useCallback((): SniffInterval => 'normal', []);

  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppComm) {
    const appComm = (globalThis as Record<string, unknown>).AppComm as {
      setSniffInterval?: (interval: string) => void;
      getSniffInterval?: () => string;
    };
    return {
      setInterval: appComm.setSniffInterval
        ? (interval: SniffInterval) => appComm.setSniffInterval!(interval)
        : noopSet,
      getInterval: appComm.getSniffInterval
        ? () => (appComm.getSniffInterval!() as SniffInterval)
        : noopGet,
    };
  }

  return { setInterval: noopSet, getInterval: noopGet };
}
