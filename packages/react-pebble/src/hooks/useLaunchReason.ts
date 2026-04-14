/**
 * useLaunchReason — why the app was launched.
 */

import { type LaunchReason, readLaunchInfo } from './useLaunchInfo.js';

/**
 * Returns the reason the app was launched.
 *
 * Back-compat: returns the `LaunchReason` string directly.
 * For access to the launch args (timeline `launchCode`, wakeup cookie, etc.),
 * use `useLaunchInfo()`.
 *
 * On Alloy: reads from LaunchReason global or application.launchReason.
 * In mock mode: returns 'user'.
 */
export function useLaunchReason(): LaunchReason {
  return readLaunchInfo().reason;
}
