/**
 * useWindowFocus — window lifecycle hooks.
 *
 * Pebble C equivalent: WindowHandlers { load, appear, disappear, unload }
 */

import { useEffect, useRef } from 'preact/hooks';

export interface WindowFocusCallbacks {
  /** Fires once when the window is first pushed (before onAppear). */
  onLoad?: () => void;
  /** Fires each time the window becomes visible. */
  onAppear?: () => void;
  /** Fires each time the window is hidden. */
  onDisappear?: () => void;
  /** Fires once when the window is popped (after onDisappear). */
  onUnload?: () => void;
}

/**
 * Register callbacks for window lifecycle events.
 *
 * On Alloy: hooks into window visibility events if available, otherwise
 * falls back to the mount/unmount pattern.
 * In mock mode: `onLoad` + `onAppear` fire on mount, `onDisappear` + `onUnload`
 * fire on unmount.
 */
export function useWindowFocus(callbacks: WindowFocusCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    // Fire onLoad then onAppear on mount
    callbacksRef.current.onLoad?.();
    callbacksRef.current.onAppear?.();

    // If a window visibility API exists (Alloy runtime), prefer it
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).watch) {
      const w = (globalThis as Record<string, unknown>).watch as {
        addEventListener?: (event: string, handler: () => void) => void;
        removeEventListener?: (event: string, handler: () => void) => void;
      };
      const handleAppear = () => callbacksRef.current.onAppear?.();
      const handleDisappear = () => callbacksRef.current.onDisappear?.();
      w.addEventListener?.('windowAppear', handleAppear);
      w.addEventListener?.('windowDisappear', handleDisappear);
      return () => {
        w.removeEventListener?.('windowAppear', handleAppear);
        w.removeEventListener?.('windowDisappear', handleDisappear);
        callbacksRef.current.onDisappear?.();
        callbacksRef.current.onUnload?.();
      };
    }

    // Fallback: fire onDisappear then onUnload on unmount
    return () => {
      callbacksRef.current.onDisappear?.();
      callbacksRef.current.onUnload?.();
    };
  }, []);
}
