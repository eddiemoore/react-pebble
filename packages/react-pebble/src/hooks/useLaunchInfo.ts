/**
 * useLaunchInfo — full launch context (reason + args).
 */

export type LaunchReason =
  | 'user'
  | 'wakeup'
  | 'timeline'
  | 'phone'
  | 'worker'
  | 'quickLaunch'
  | 'smartstrap'
  | 'unknown';

export interface LaunchInfo {
  reason: LaunchReason;
  /** Launch argument (from `launch_get_args()` — set by timeline openWatchApp.launchCode, wakeup, or worker). */
  args: number;
  /** Wakeup event cookie from `wakeup_get_launch_id()`. Only meaningful when `reason === 'wakeup'`; `null` otherwise. */
  wakeupId: number | null;
}

/**
 * Returns the full launch context — reason plus the launch argument set by
 * the caller (timeline pin `launchCode`, `wakeup_schedule(cookie)`, or worker).
 *
 * On Alloy: calls `launch_get_args()` if available.
 * In mock mode: returns `{ reason: 'user', args: 0, wakeupId: null }`.
 */
export function useLaunchInfo(): LaunchInfo {
  return readLaunchInfo();
}

export function readLaunchInfo(): LaunchInfo {
  let reason: LaunchReason = 'user';
  let args = 0;
  let wakeupId: number | null = null;
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (g.LaunchReason && typeof g.LaunchReason === 'object') {
      const lr = g.LaunchReason as { reason?: string; args?: number };
      if (lr.reason) reason = lr.reason as LaunchReason;
      if (typeof lr.args === 'number') args = lr.args;
    } else if (typeof g.launch_reason === 'function') {
      const code = (g.launch_reason as () => number)();
      const map: Record<number, LaunchReason> = {
        0: 'user', 1: 'phone', 2: 'wakeup', 3: 'worker',
        4: 'quickLaunch', 5: 'timeline', 6: 'smartstrap',
      };
      reason = map[code] ?? 'unknown';
    }
    if (typeof g.launch_get_args === 'function') {
      try {
        args = (g.launch_get_args as () => number)();
      } catch {
        // ignore
      }
    }
    // Read the wakeup event ID when launched via wakeup.
    if (reason === 'wakeup') {
      if (g.Wakeup && typeof g.Wakeup === 'object') {
        const wk = g.Wakeup as {
          getLaunchEvent?: () => { id: number; cookie: number } | null;
        };
        const ev = wk.getLaunchEvent?.();
        if (ev) wakeupId = ev.id;
      } else if (typeof g.wakeup_get_launch_id === 'function') {
        try {
          wakeupId = (g.wakeup_get_launch_id as () => number)();
        } catch {
          // ignore
        }
      }
    }
  }
  return { reason, args, wakeupId };
}
