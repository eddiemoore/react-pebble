/**
 * usePreferredResultDuration — how long to show result/notification windows.
 */

/**
 * Returns the user-preferred duration (in ms) for showing result windows.
 *
 * On Alloy: reads from the Preferences API.
 * In mock mode: returns 3000ms.
 */
export function usePreferredResultDuration(): number {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    // Pebble Preferences API
    if (typeof g.preferred_result_display_duration === 'function') {
      return (g.preferred_result_display_duration as () => number)();
    }
    // Alloy-style Preferences object
    if (g.Preferences && typeof (g.Preferences as Record<string, unknown>).resultDisplayDuration === 'number') {
      return (g.Preferences as { resultDisplayDuration: number }).resultDisplayDuration;
    }
  }
  return 3000;
}
