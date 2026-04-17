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

export type HealthActivity = 'sleep' | 'restfulSleep' | 'walk' | 'run' | 'openWorkout';

export interface UseHealthResult {
  /** Current health metrics. */
  data: HealthData;
  /** Averaged metrics (daily/weekly). Null when health service is unavailable. */
  averaged: { daily: HealthData; weekly: HealthData } | null;
  /** Currently active health activities. */
  currentActivities: HealthActivity[];
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
export function useHealth(pollInterval = 60000): UseHealthResult {
  const [data, setData] = useState<HealthData>(MOCK_HEALTH);
  const [averaged, setAveraged] = useState<UseHealthResult['averaged']>({
    daily: MOCK_HEALTH,
    weekly: MOCK_HEALTH,
  });
  const [currentActivities, setCurrentActivities] = useState<HealthActivity[]>([]);

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
        getAveraged?: () => { daily: HealthData; weekly: HealthData } | null;
        getCurrentActivities?: () => HealthActivity[];
      } | undefined;

      if (health) {
        const base: HealthData = {
          steps: health.steps ?? 0,
          distance: health.distance ?? 0,
          activeSeconds: health.activeSeconds ?? 0,
          calories: health.calories ?? 0,
          heartRate: health.heartRate ?? null,
          sleepSeconds: health.sleepSeconds ?? 0,
        };
        setData(base);

        // Averaged metrics: use runtime method if available, otherwise mirror base.
        if (typeof health.getAveraged === 'function') {
          setAveraged(health.getAveraged());
        } else {
          setAveraged({ daily: base, weekly: base });
        }

        // Current activities: use runtime method if available, otherwise empty.
        if (typeof health.getCurrentActivities === 'function') {
          setCurrentActivities(health.getCurrentActivities());
        } else {
          setCurrentActivities([]);
        }
      }
    };

    readHealth();
    const id = setInterval(readHealth, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval]);

  return { data, averaged, currentActivities };
}
