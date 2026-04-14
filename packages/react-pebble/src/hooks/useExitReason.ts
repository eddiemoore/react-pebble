/**
 * useExitReason — tell the launcher why the app exited.
 */

import { useCallback } from 'preact/hooks';

export type ExitReasonCode = 'default' | 'actionPerformed' | 'genericError';

export interface UseExitReasonResult {
  /** Record a reason the app is about to exit. Called before your app terminates. */
  setReason: (reason: ExitReasonCode) => void;
}

/**
 * Configure the reason the app exited, which the launcher uses to decide what
 * to show on return (e.g. "Setting saved, please relaunch").
 *
 * On Alloy: calls `app_exit_reason_set()` or writes to `ExitReason.current`.
 * In mock mode: no-op.
 *
 * Also available directly on the rendered app via `app.setExitReason(...)`,
 * but this hook keeps the concept colocated with other hooks.
 */
export function useExitReason(): UseExitReasonResult {
  const setReason = useCallback((reason: ExitReasonCode) => {
    if (typeof globalThis === 'undefined') return;
    const g = globalThis as Record<string, unknown>;
    // C-binding style
    if (typeof g.app_exit_reason_set === 'function') {
      const codes: Record<ExitReasonCode, number> = {
        default: 0,
        actionPerformed: 1,
        genericError: 2,
      };
      (g.app_exit_reason_set as (code: number) => void)(codes[reason]);
      return;
    }
    // Object-style
    if (g.ExitReason && typeof g.ExitReason === 'object') {
      (g.ExitReason as { current?: string }).current = reason;
    }
  }, []);

  return { setReason };
}
