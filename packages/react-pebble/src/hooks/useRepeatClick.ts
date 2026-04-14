/**
 * useRepeatClick — auto-repeating button press.
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import {
  type PebbleButton,
  type PebbleButtonHandler,
} from './internal/button-registry.js';
import { useButton } from './useButton.js';
import { useLongButton } from './useLongButton.js';

export interface RepeatClickOptions {
  /** Delay before repeating starts in ms (default: 500). */
  initialDelay?: number;
  /** Interval between repeats in ms (default: 100). */
  repeatInterval?: number;
}

/**
 * Fire a handler repeatedly while a button is held down.
 *
 * Fires once immediately on press, then starts repeating after
 * `initialDelay` ms at `repeatInterval` ms intervals. Uses long-press
 * detection to start the repeat cycle.
 */
export function useRepeatClick(
  button: PebbleButton,
  handler: PebbleButtonHandler,
  options: RepeatClickOptions = {},
): void {
  const { initialDelay = 500, repeatInterval = 100 } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Fire once on initial press
  useButton(button, () => {
    handlerRef.current();
  });

  // Start repeating on long press
  useLongButton(button, () => {
    stopRepeat();
    // Wait initial delay, then repeat
    const startTimer = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        handlerRef.current();
      }, repeatInterval);
    }, initialDelay);
    // Store timer ID in interval ref temporarily for cleanup
    intervalRef.current = startTimer as unknown as ReturnType<typeof setInterval>;
  });

  // Cleanup on unmount
  useEffect(() => () => stopRepeat(), [stopRepeat]);
}
