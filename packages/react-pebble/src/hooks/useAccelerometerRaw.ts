/**
 * useAccelerometerRaw — higher-fidelity raw accelerometer samples.
 */

import { useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface AccelerometerRawSample {
  x: number;
  y: number;
  z: number;
  /** Milliseconds since epoch (device time). */
  timestamp: number;
  /** Whether this sample was captured while the device was vibrating. */
  didVibrate?: boolean;
}

export interface UseAccelerometerRawOptions {
  /**
   * Samples per batch update (1-25). Mirrors
   * `accel_service_set_samples_per_update()`.
   */
  samplesPerUpdate?: number;
  /** Sampling rate in Hz (10, 25, 50, or 100). */
  samplingRateHz?: 10 | 25 | 50 | 100;
  /** Called with every batch of samples. */
  onSamples?: (samples: AccelerometerRawSample[]) => void;
}

/**
 * Subscribe to the raw accelerometer data service. Yields batches of samples
 * at the configured rate (vs. `useAccelerometer`, which yields a single
 * smoothed value). Mirrors C SDK `accel_raw_data_service_subscribe()`.
 *
 * On Alloy: uses the `__pbl_accel_raw` global if available, otherwise falls
 * back to synthesizing batches from `__pbl_accel` at the configured rate.
 * In mock mode: generates synthetic samples.
 */
export function useAccelerometerRaw(options: UseAccelerometerRawOptions = {}): AccelerometerRawSample[] {
  const samplesPerUpdate = options.samplesPerUpdate ?? 25;
  const samplingRateHz = options.samplingRateHz ?? 25;
  const [batch, setBatch] = useState<AccelerometerRawSample[]>([]);
  const callbackRef = useRef(options.onSamples);
  callbackRef.current = options.onSamples;

  useEffect(() => {
    const publish = (samples: AccelerometerRawSample[]) => {
      setBatch(samples);
      callbackRef.current?.(samples);
    };

    const g = globalThis as Record<string, unknown>;
    const rawSvc = g.__pbl_accel_raw as {
      onSamples?: (samples: AccelerometerRawSample[]) => void;
      samplingRate?: number;
      samplesPerUpdate?: number;
      start?: () => void;
      stop?: () => void;
    } | undefined;

    if (rawSvc) {
      rawSvc.samplingRate = samplingRateHz;
      rawSvc.samplesPerUpdate = samplesPerUpdate;
      rawSvc.onSamples = publish;
      rawSvc.start?.();
      return () => rawSvc.stop?.();
    }

    // Mock mode: synthesize batches at the requested rate.
    const batchIntervalMs = (samplesPerUpdate * 1000) / samplingRateHz;
    const sampleIntervalMs = 1000 / samplingRateHz;
    const id = setInterval(() => {
      const now = Date.now();
      const samples: AccelerometerRawSample[] = [];
      for (let i = 0; i < samplesPerUpdate; i++) {
        const t = now - (samplesPerUpdate - 1 - i) * sampleIntervalMs;
        samples.push({
          x: Math.round(Math.sin(t / 500) * 100),
          y: Math.round(Math.cos(t / 600) * 80),
          z: -1000 + Math.round(Math.sin(t / 400) * 40),
          timestamp: t,
        });
      }
      publish(samples);
    }, batchIntervalMs);
    return () => clearInterval(id);
  }, [samplesPerUpdate, samplingRateHz]);

  return batch;
}
