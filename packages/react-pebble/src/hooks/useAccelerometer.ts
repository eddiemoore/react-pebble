/**
 * useAccelerometer — motion sensing via Moddable sensor API.
 */

import { useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

export interface UseAccelerometerOptions {
  /** Sample rate in ms (default: 100). */
  sampleRate?: number;
  /** Called on tap gesture. */
  onTap?: () => void;
  /** Called on double-tap gesture. */
  onDoubleTap?: () => void;
}

/**
 * Read accelerometer data.
 *
 * On Alloy: reads from the Moddable Accelerometer sensor.
 * In mock mode: returns { x: 0, y: 0, z: -1000 } (gravity pointing down).
 */
export function useAccelerometer(options: UseAccelerometerOptions = {}): AccelerometerData {
  const { sampleRate = 100, onTap, onDoubleTap } = options;
  const [data, setData] = useState<AccelerometerData>({ x: 0, y: 0, z: -1000 });
  const tapRef = useRef(onTap);
  const doubleTapRef = useRef(onDoubleTap);
  tapRef.current = onTap;
  doubleTapRef.current = onDoubleTap;

  useEffect(() => {
    // Try to access the Alloy accelerometer
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).__pbl_accel) {
      const accel = (globalThis as Record<string, unknown>).__pbl_accel as {
        onSample?: (x: number, y: number, z: number) => void;
        onTap?: () => void;
        onDoubleTap?: () => void;
        start?: () => void;
        stop?: () => void;
      };
      accel.onSample = (x: number, y: number, z: number) => setData({ x, y, z });
      if (tapRef.current) accel.onTap = () => tapRef.current?.();
      if (doubleTapRef.current) accel.onDoubleTap = () => doubleTapRef.current?.();
      accel.start?.();
      return () => accel.stop?.();
    }

    // Mock mode: simulate gentle wobble
    const id = setInterval(() => {
      setData({
        x: Math.round(Math.sin(Date.now() / 1000) * 50),
        y: Math.round(Math.cos(Date.now() / 1200) * 30),
        z: -1000 + Math.round(Math.sin(Date.now() / 800) * 20),
      });
    }, sampleRate);
    return () => clearInterval(id);
  }, [sampleRate]);

  return data;
}
