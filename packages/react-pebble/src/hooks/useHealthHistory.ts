/**
 * useHealthHistory — minute-by-minute history of a metric.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';
import type { HealthMetric } from './useHealthAlert.js';

export interface UseHealthHistoryOptions {
  metric: HealthMetric;
  /** How many minutes of history to fetch (max 60 on most platforms). */
  minutes: number;
}

/**
 * Fetch a minute-by-minute history of a health metric.
 * Mirrors `health_service_get_minute_history()`.
 *
 * On Alloy: uses `Health.getMinuteHistory(metric, minutes)`.
 * In mock mode: returns synthetic data approximating the metric's typical range.
 */
export function useHealthHistory(options: UseHealthHistoryOptions): number[] {
  const { metric, minutes } = options;
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      getMinuteHistory?: (metric: string, minutes: number) => number[];
    } | undefined;
    if (health?.getMinuteHistory) {
      setHistory(health.getMinuteHistory(metric, minutes));
      return;
    }
    // Mock: synthetic values
    const base = metric === 'heartRateBPM' || metric === 'heartRateRawBPM' ? 72
      : metric === 'steps' ? 80
      : metric === 'walkedDistanceMeters' ? 60
      : metric === 'activeKCalories' ? 2
      : metric === 'sleepSeconds' ? 60
      : 0;
    const mock = Array.from({ length: minutes }, (_, i) =>
      Math.max(0, Math.round(base + Math.sin(i / 3) * (base * 0.2))),
    );
    setHistory(mock);
  }, [metric, minutes]);

  return history;
}
