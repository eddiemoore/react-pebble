/**
 * useTimer — one-shot delayed callback with reschedule support.
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseTimerResult {
  /** Start a one-shot timer. Replaces any pending timer. */
  start: (delayMs: number) => void;
  /** Cancel the pending timer. */
  cancel: () => void;
  /** Reschedule a running timer to a new delay from its original start time. */
  reschedule: (newDelayMs: number) => void;
  /** Whether the timer has fired since last start. */
  fired: boolean;
}

/**
 * One-shot timer (complement to `useInterval`).
 *
 * The callback ref is kept stable — changing the callback between renders
 * does not restart the timer.
 *
 * Pebble C equivalent: app_timer_register / app_timer_reschedule / app_timer_cancel
 */
export function useTimer(callback: () => void): UseTimerResult {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const delayRef = useRef(0);
  const [fired, setFired] = useState(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((delayMs: number) => {
    cancel();
    setFired(false);
    startedAtRef.current = Date.now();
    delayRef.current = delayMs;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFired(true);
      cbRef.current();
    }, delayMs);
  }, [cancel]);

  const reschedule = useCallback((newDelayMs: number) => {
    if (timerRef.current === null) return; // no running timer
    cancel();
    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, newDelayMs - elapsed);
    delayRef.current = newDelayMs;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFired(true);
      cbRef.current();
    }, remaining);
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => () => cancel(), [cancel]);

  return { start, cancel, reschedule, fired };
}
