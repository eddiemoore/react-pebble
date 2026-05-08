/**
 * useTouch — touchscreen input.
 *
 * Provides touchdown, move, and liftoff events with x/y coordinates
 * on platforms with a touchscreen (Alloy hardware with PBL_TOUCH).
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import { TouchRegistry, type TouchEvent, type TouchEventType } from './internal/touch-registry.js';

export type { TouchEvent, TouchEventType } from './internal/touch-registry.js';

export interface UseTouchOptions {
  /** Called when the user places a finger on the screen. */
  onTouchdown?: (x: number, y: number) => void;
  /** Called when an existing touch moves. */
  onMove?: (x: number, y: number) => void;
  /** Called when the user lifts their finger. */
  onLiftoff?: (x: number, y: number) => void;
}

export interface UseTouchResult {
  /** Whether the touchscreen is available on this platform. */
  isEnabled: boolean;
  /** Whether a finger is currently on the screen. */
  isTouching: boolean;
  /** The most recent touch coordinates, or null if no touch has occurred. */
  lastTouch: { x: number; y: number } | null;
}

function isTouchEnabled(): boolean {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Touch) {
    const touch = (globalThis as Record<string, unknown>).Touch as {
      isEnabled?: () => boolean;
    };
    return touch.isEnabled?.() ?? true;
  }
  return false;
}

/**
 * Subscribe to touchscreen events.
 *
 * On Alloy: receives events from the TouchRegistry (fed by the renderer).
 * In mock mode: `isEnabled` is false, no events fire.
 */
export function useTouch(options?: UseTouchOptions): UseTouchResult {
  const enabled = isTouchEnabled();
  const [isTouching, setIsTouching] = useState(false);
  const [lastTouch, setLastTouch] = useState<{ x: number; y: number } | null>(null);

  const handler = useCallback(
    (event: TouchEvent) => {
      setLastTouch({ x: event.x, y: event.y });

      switch (event.type) {
        case 'touchdown':
          setIsTouching(true);
          options?.onTouchdown?.(event.x, event.y);
          break;
        case 'position':
          options?.onMove?.(event.x, event.y);
          break;
        case 'liftoff':
          setIsTouching(false);
          options?.onLiftoff?.(event.x, event.y);
          break;
      }
    },
    [options?.onTouchdown, options?.onMove, options?.onLiftoff],
  );

  useEffect(() => {
    TouchRegistry.subscribe(handler);
    return () => TouchRegistry.unsubscribe(handler);
  }, [handler]);

  return { isEnabled: enabled, isTouching, lastTouch };
}
