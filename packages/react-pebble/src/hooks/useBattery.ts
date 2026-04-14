/**
 * Battery hook — reads Alloy's Battery sensor (percent, charging, plugged).
 */

export interface BatteryState {
  percent: number;
  charging: boolean;
  plugged: boolean;
}

/**
 * Returns the current battery state. On Alloy, reads the `Battery` global.
 * In mock mode (Node), returns a static default (100%, not charging).
 *
 * Re-reads on each render; battery updates arrive via watch tick events
 * which trigger redraws, so the value stays fresh.
 */
export function useBattery(): BatteryState {
  if (typeof Battery !== 'undefined' && Battery) {
    return {
      percent: Battery.percent,
      charging: Battery.charging,
      plugged: Battery.plugged,
    };
  }
  // Mock mode — return a sensible default
  return { percent: 100, charging: false, plugged: false };
}
