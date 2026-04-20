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
  /** Averaged metrics (daily/weekly/min/max). Null when health service is unavailable. */
  averaged: { daily: HealthData; weekly: HealthData; min: HealthData; max: HealthData } | null;
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

function scaleHealth(base: HealthData, factor: number): HealthData {
  return {
    steps: Math.round(base.steps * factor),
    distance: Math.round(base.distance * factor),
    activeSeconds: Math.round(base.activeSeconds * factor),
    calories: Math.round(base.calories * factor),
    heartRate: base.heartRate != null ? Math.round(base.heartRate * factor) : null,
    sleepSeconds: Math.round(base.sleepSeconds * factor),
  };
}

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
    min: scaleHealth(MOCK_HEALTH, 0.5),
    max: scaleHealth(MOCK_HEALTH, 1.5),
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
        getAveraged?: () => { daily: HealthData; weekly: HealthData; min?: HealthData; max?: HealthData } | null;
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
          const avg = health.getAveraged();
          if (avg) {
            setAveraged({
              daily: avg.daily,
              weekly: avg.weekly,
              min: avg.min ?? scaleHealth(base, 0.5),
              max: avg.max ?? scaleHealth(base, 1.5),
            });
          } else {
            setAveraged(null);
          }
        } else {
          setAveraged({
            daily: base,
            weekly: base,
            min: scaleHealth(base, 0.5),
            max: scaleHealth(base, 1.5),
          });
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
