/**
 * useAccelerometerTap — low-power tap detection (axis + direction).
 */

import { useEffect, useRef } from 'preact/hooks';

export type AccelAxis = 'x' | 'y' | 'z';
export type AccelDirection = 1 | -1;

export interface AccelerometerTapEvent {
  axis: AccelAxis;
  direction: AccelDirection;
}

/**
 * Subscribe to tap gesture events. Unlike `useAccelerometer({ onTap })`,
 * this hook reports the axis and direction of the tap — useful for
 * wrist flicks and shake gestures. Mirrors `accel_tap_service_subscribe()`.
 *
 * On Alloy: uses `__pbl_accel_tap` if present, otherwise degrades to the
 * basic `onTap` callback of the data service.
 * In mock mode: fires a mock tap every 3 seconds cycling through axes.
 */
export function useAccelerometerTap(handler: (event: AccelerometerTapEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const emit = (event: AccelerometerTapEvent) => handlerRef.current(event);

    const g = globalThis as Record<string, unknown>;
    const tapSvc = g.__pbl_accel_tap as {
      onTap?: (axis: AccelAxis, direction: AccelDirection) => void;
      start?: () => void;
      stop?: () => void;
    } | undefined;

    if (tapSvc) {
      tapSvc.onTap = (axis, direction) => emit({ axis, direction });
      tapSvc.start?.();
      return () => tapSvc.stop?.();
    }

    // Fall back to basic accel onTap if available
    const accel = g.__pbl_accel as { onTap?: () => void; start?: () => void; stop?: () => void } | undefined;
    if (accel) {
      accel.onTap = () => emit({ axis: 'z', direction: 1 });
      accel.start?.();
      return () => accel.stop?.();
    }

    // Mock mode
    const axes: AccelAxis[] = ['x', 'y', 'z'];
    let i = 0;
    const id = setInterval(() => {
      emit({ axis: axes[i % axes.length]!, direction: (i % 2 === 0 ? 1 : -1) as AccelDirection });
      i++;
    }, 3000);
    return () => clearInterval(id);
  }, []);
}
