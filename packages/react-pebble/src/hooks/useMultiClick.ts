/**
 * useMultiClick — double-click, triple-click detection.
 */

import { useRef } from 'preact/hooks';
import {
  type PebbleButton,
  type PebbleButtonHandler,
} from './internal/button-registry.js';
import { useButton } from './useButton.js';

export interface MultiClickOptions {
  /** Number of clicks to detect (default: 2 for double-click). */
  count?: number;
  /** Maximum interval between clicks in ms (default: 300). */
  maxInterval?: number;
}

/**
 * Detect multi-click patterns (double-click, triple-click, etc.).
 *
 * The handler fires only when exactly `count` clicks occur within
 * `maxInterval` ms of each other.
 */
export function useMultiClick(
  button: PebbleButton,
  handler: PebbleButtonHandler,
  options: MultiClickOptions = {},
): void {
  const { count = 2, maxInterval = 300 } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const clickTimesRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useButton(button, () => {
    const now = Date.now();
    clickTimesRef.current.push(now);

    // Trim old clicks outside the window
    clickTimesRef.current = clickTimesRef.current.filter(
      (t) => now - t <= maxInterval,
    );

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    if (clickTimesRef.current.length >= count) {
      clickTimesRef.current = [];
      handlerRef.current();
    } else {
      // Reset after window expires
      timerRef.current = setTimeout(() => {
        clickTimesRef.current = [];
        timerRef.current = null;
      }, maxInterval);
    }
  });
}
