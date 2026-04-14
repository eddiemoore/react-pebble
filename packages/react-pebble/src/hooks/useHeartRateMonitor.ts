/**
 * useHeartRateMonitor — tune HRM sampling cadence (battery vs. freshness).
 */

import { useCallback, useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseHeartRateMonitorOptions {
  /**
   * Desired sampling interval in seconds. Mirrors
   * `health_service_set_heart_rate_sample_period()`. Low values drain battery.
   * The system will cap the duration; use `expiresAt` to know when the
   * aggressive sampling lapses.
   */
  samplePeriodSeconds: number;
}

export interface UseHeartRateMonitorResult {
  /** Unix ms when the aggressive sample period expires (0 if not running). */
  expiresAt: number;
  /** Manually extend the aggressive sampling window. */
  refresh: () => void;
}

/**
 * Request more frequent heart rate samples than the default (typically
 * every 10 minutes) — used by workout or resting-HR features.
 *
 * On Alloy: uses `Health.setHeartRateSamplePeriod(seconds)` and
 * `Health.getHeartRateSamplePeriodExpirationSec()`.
 * In mock mode: stores the expiry locally.
 */
export function useHeartRateMonitor(options: UseHeartRateMonitorOptions): UseHeartRateMonitorResult {
  const { samplePeriodSeconds } = options;
  const [expiresAt, setExpiresAt] = useState(0);

  const apply = useCallback(() => {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      setHeartRateSamplePeriod?: (seconds: number) => void;
      getHeartRateSamplePeriodExpirationSec?: () => number;
    } | undefined;
    if (health?.setHeartRateSamplePeriod) {
      health.setHeartRateSamplePeriod(samplePeriodSeconds);
      const expSec = health.getHeartRateSamplePeriodExpirationSec?.() ?? samplePeriodSeconds * 60;
      setExpiresAt(Date.now() + expSec * 1000);
    } else {
      // Mock: expire after samplePeriodSeconds * 60
      setExpiresAt(Date.now() + samplePeriodSeconds * 60 * 1000);
    }
  }, [samplePeriodSeconds]);

  useEffect(() => {
    apply();
  }, [apply]);

  return { expiresAt, refresh: apply };
}
