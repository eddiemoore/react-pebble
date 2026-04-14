/**
 * useHealthAlert — threshold-based health metric alerts (e.g. HR > 140).
 */

import { useEffect, useRef } from 'preact/hooks';

export type HealthMetric =
  | 'steps'
  | 'activeSeconds'
  | 'walkedDistanceMeters'
  | 'sleepSeconds'
  | 'sleepRestfulSeconds'
  | 'restingKCalories'
  | 'activeKCalories'
  | 'heartRateBPM'
  | 'heartRateRawBPM';

export interface UseHealthAlertOptions {
  metric: HealthMetric;
  threshold: number;
  /** 'above' fires when crossing up; 'below' fires when crossing down. */
  direction?: 'above' | 'below';
  onTrigger: (value: number) => void;
}

/**
 * Register a metric alert — fires a callback when a health metric crosses
 * the given threshold. Mirrors `health_service_register_metric_alert`.
 *
 * On Alloy: uses `Health.registerMetricAlert(...)` if available.
 * In mock mode: polls `__pbl_health` at 5s intervals and compares.
 */
export function useHealthAlert(options: UseHealthAlertOptions): void {
  const { metric, threshold, direction = 'above', onTrigger } = options;
  const cbRef = useRef(onTrigger);
  cbRef.current = onTrigger;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      registerMetricAlert?: (metric: string, threshold: number, cb: (v: number) => void) => number;
      cancelMetricAlert?: (handle: number) => void;
    } | undefined;

    if (health?.registerMetricAlert) {
      const handle = health.registerMetricAlert(metric, threshold, (v) => {
        const crossed = direction === 'above' ? v >= threshold : v <= threshold;
        if (crossed) cbRef.current(v);
      });
      return () => health.cancelMetricAlert?.(handle);
    }

    // Mock: poll every 5 seconds.
    let lastValue = 0;
    const id = setInterval(() => {
      const src = (g.Health ?? g.__pbl_health) as Record<string, unknown> | undefined;
      if (!src) return;
      // Map metric to the data field on MOCK_HEALTH / Health global
      const fieldMap: Record<HealthMetric, string> = {
        steps: 'steps',
        activeSeconds: 'activeSeconds',
        walkedDistanceMeters: 'distance',
        sleepSeconds: 'sleepSeconds',
        sleepRestfulSeconds: 'sleepRestfulSeconds',
        restingKCalories: 'restingCalories',
        activeKCalories: 'calories',
        heartRateBPM: 'heartRate',
        heartRateRawBPM: 'heartRate',
      };
      const v = Number(src[fieldMap[metric]] ?? 0);
      const crossed = direction === 'above'
        ? lastValue < threshold && v >= threshold
        : lastValue > threshold && v <= threshold;
      if (crossed) cbRef.current(v);
      lastValue = v;
    }, 5000);
    return () => clearInterval(id);
  }, [metric, threshold, direction]);
}
