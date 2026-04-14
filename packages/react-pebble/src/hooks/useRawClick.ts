/**
 * useRawClick — low-level press/release events for gesture timing.
 */

import { useEffect, useRef } from 'preact/hooks';
import {
  ButtonRegistry,
  type ButtonRegistryKey,
  type PebbleButton,
} from './internal/button-registry.js';

export interface UseRawClickOptions {
  onDown?: () => void;
  onUp?: () => void;
}

/**
 * Subscribe to separate button-down and button-up events for a given button.
 * Useful for gesture timing, chorded input, or custom click patterns that
 * the standard `useButton` / `useLongButton` / `useMultiClick` don't cover.
 *
 * Mirrors `window_raw_click_subscribe()` on the C side.
 *
 * Down/up events are published through `ButtonRegistry` using the
 * `raw_down_<button>` and `raw_up_<button>` keys. The renderer is expected
 * to emit those keys when it detects a raw press/release.
 */
export function useRawClick(button: PebbleButton, options: UseRawClickOptions): void {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const downKey: ButtonRegistryKey = `raw_down_${button}`;
    const upKey: ButtonRegistryKey = `raw_up_${button}`;
    const onDown = () => optsRef.current.onDown?.();
    const onUp = () => optsRef.current.onUp?.();
    ButtonRegistry.subscribe(downKey, onDown);
    ButtonRegistry.subscribe(upKey, onUp);
    return () => {
      ButtonRegistry.unsubscribe(downKey, onDown);
      ButtonRegistry.unsubscribe(upKey, onUp);
    };
  }, [button]);
}
