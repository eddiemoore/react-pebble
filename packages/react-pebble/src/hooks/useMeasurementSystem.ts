/**
 * useMeasurementSystem — user's preferred measurement system.
 */

export type MeasurementSystem = 'metric' | 'imperial' | 'unknown';

/**
 * Returns the user's preferred measurement system for health data display.
 * Mirrors `health_service_get_measurement_system_for_display()`.
 *
 * On Alloy: reads from `Health.measurementSystem` or
 * `Health.getMeasurementSystemForDisplay()`.
 * In mock mode: infers from `useLocale().country` (US → imperial, else metric).
 */
export function useMeasurementSystem(): MeasurementSystem {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      measurementSystem?: MeasurementSystem;
      getMeasurementSystemForDisplay?: () => MeasurementSystem;
    } | undefined;
    if (health?.getMeasurementSystemForDisplay) {
      return health.getMeasurementSystemForDisplay();
    }
    if (health?.measurementSystem) {
      return health.measurementSystem;
    }
  }
  // Mock mode (Node compile): default to 'metric' so snapshots are stable
  // regardless of host OS locale. On-device the actual health global above
  // always wins. Users whose app needs a specific system at compile time
  // can set `process.env.PEBBLE_MEASUREMENT_SYSTEM` to 'imperial'.
  const envPref = typeof process !== 'undefined' ? process.env?.PEBBLE_MEASUREMENT_SYSTEM : undefined;
  if (envPref === 'imperial' || envPref === 'metric' || envPref === 'unknown') {
    return envPref;
  }
  return 'metric';
}
