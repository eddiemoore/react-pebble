/**
 * useVibration — haptic feedback.
 */

import { useCallback } from 'preact/hooks';

export interface UseVibrationResult {
  shortPulse: () => void;
  longPulse: () => void;
  doublePulse: () => void;
  customPattern: (durations: number[]) => void;
}

/**
 * Haptic feedback via the Pebble vibration motor.
 *
 * On Alloy: uses the `Vibration` global.
 * In mock mode: no-op functions.
 */
export function useVibration(): UseVibrationResult {
  const noop = useCallback(() => {}, []);
  const noopArr = useCallback((_durations: number[]) => {}, []);

  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Vibration) {
    const vib = (globalThis as Record<string, unknown>).Vibration as {
      shortPulse?: () => void;
      longPulse?: () => void;
      doublePulse?: () => void;
      customPattern?: (durations: number[]) => void;
    };
    return {
      shortPulse: vib.shortPulse ?? noop,
      longPulse: vib.longPulse ?? noop,
      doublePulse: vib.doublePulse ?? noop,
      customPattern: vib.customPattern ?? noopArr,
    };
  }

  return { shortPulse: noop, longPulse: noop, doublePulse: noop, customPattern: noopArr };
}
