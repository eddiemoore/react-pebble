/**
 * useHealth — step count, distance, heart rate, sleep, calories.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface HealthData {
  steps: number;
  distance: number;
  activeSeconds: number;
  calories: number;
  heartRate: number | null;
  sleepSeconds: number;
}

const MOCK_HEALTH: HealthData = {
  steps: 5432,
  distance: 3800,
  activeSeconds: 2400,
  calories: 210,
  heartRate: 72,
  sleepSeconds: 25200,
};

/**
 * Read health/fitness data from the Pebble Health service.
 *
 * On Alloy: reads from the `Health` or `__pbl_health` global.
 * In mock mode: returns static realistic data.
 *
 * @param pollInterval — how often to re-read in ms (default: 60000)
 */
export function useHealth(pollInterval = 60000): HealthData {
  const [data, setData] = useState<HealthData>(MOCK_HEALTH);

  useEffect(() => {
    const readHealth = () => {
      const g = globalThis as Record<string, unknown>;
      const health = (g.Health ?? g.__pbl_health) as {
        steps?: number;
        distance?: number;
        activeSeconds?: number;
        calories?: number;
        heartRate?: number | null;
        sleepSeconds?: number;
      } | undefined;

      if (health) {
        setData({
          steps: health.steps ?? 0,
          distance: health.distance ?? 0,
          activeSeconds: health.activeSeconds ?? 0,
          calories: health.calories ?? 0,
          heartRate: health.heartRate ?? null,
          sleepSeconds: health.sleepSeconds ?? 0,
        });
      }
    };

    readHealth();
    const id = setInterval(readHealth, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval]);

  return data;
}
