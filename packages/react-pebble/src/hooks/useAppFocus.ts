/**
 * useAppFocus — detect when app is obscured by system UI.
 */

import { useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface AppFocusOptions {
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface AppFocusResult {
  focused: boolean;
}

/**
 * Track whether the app is currently in focus (not obscured by
 * notifications or system UI).
 *
 * On Alloy: subscribes to watch focus/blur events.
 * In mock mode: returns { focused: true }.
 */
export function useAppFocus(options?: AppFocusOptions): AppFocusResult {
  const [focused, setFocused] = useState(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).watch) {
      const w = (globalThis as Record<string, unknown>).watch as {
        addEventListener?: (event: string, handler: () => void) => void;
        removeEventListener?: (event: string, handler: () => void) => void;
      };
      const handleFocus = () => {
        setFocused(true);
        optionsRef.current?.onFocus?.();
      };
      const handleBlur = () => {
        setFocused(false);
        optionsRef.current?.onBlur?.();
      };
      w.addEventListener?.('focus', handleFocus);
      w.addEventListener?.('blur', handleBlur);
      return () => {
        w.removeEventListener?.('focus', handleFocus);
        w.removeEventListener?.('blur', handleBlur);
      };
    }
    return undefined;
  }, []);

  return { focused };
}
