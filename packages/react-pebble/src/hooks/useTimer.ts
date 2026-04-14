/**
 * useTimer — one-shot delayed callback.
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseTimerResult {
  /** Start a one-shot timer. Replaces any pending timer. */
  start: (delayMs: number) => void;
  /** Cancel the pending timer. */
  cancel: () => void;
  /** Whether the timer has fired since last start. */
  fired: boolean;
}

/**
 * One-shot timer (complement to `useInterval`).
 *
 * The callback ref is kept stable — changing the callback between renders
 * does not restart the timer.
 */
export function useTimer(callback: () => void): UseTimerResult {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFired(true);
      cbRef.current();
    }, delayMs);
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => () => cancel(), [cancel]);

  return { start, cancel, fired };
}
