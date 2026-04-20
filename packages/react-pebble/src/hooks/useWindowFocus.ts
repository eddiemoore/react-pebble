/**
 * useWindowFocus — window appear/disappear lifecycle hooks.
 */

import { useEffect, useRef } from 'preact/hooks';

export interface WindowFocusCallbacks {
  onAppear?: () => void;
  onDisappear?: () => void;
}

/**
 * Register callbacks for window appear (mount) and disappear (unmount) events.
 *
 * On Alloy: hooks into window visibility events if available, otherwise
 * falls back to the mount/unmount pattern.
 * In mock mode: `onAppear` fires once on mount, `onDisappear` on unmount.
 */
export function useWindowFocus(callbacks: WindowFocusCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    // Fire onAppear on mount
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
      };
    }

    // Fallback: fire onDisappear on unmount
    return () => {
      callbacksRef.current.onDisappear?.();
    };
  }, []);
}
