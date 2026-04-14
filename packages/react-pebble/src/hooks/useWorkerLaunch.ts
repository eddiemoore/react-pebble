/**
 * Background Worker API — useWorkerLaunch.
 */

import { useCallback, useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface WorkerMessage {
  /** User-defined message type. 0 is reserved for Pebble system messages. */
  type: number;
  /** Opaque payload. Workers typically pack small ints here. */
  data?: number;
}

export type WorkerResult =
  | 'success'
  | 'notRunning'
  | 'alreadyRunning'
  | 'differentApp'
  | 'notInstalled'
  | 'error';

export interface UseWorkerLaunchResult {
  /** Spawn the bundled background worker. */
  launch: () => WorkerResult;
  /** Stop the background worker. */
  kill: () => WorkerResult;
  /** Whether the worker is currently running. */
  isRunning: boolean;
  /** Re-check running status (updates `isRunning`). */
  refresh: () => void;
}

/**
 * Control the app's bundled background worker.
 *
 * On Alloy/C: wraps `app_worker_launch()`, `app_worker_kill()`,
 * `app_worker_is_running()`.
 * In mock mode: tracks launch/kill state in memory.
 */
export function useWorkerLaunch(): UseWorkerLaunchResult {
  const [isRunning, setRunning] = useState(false);

  const readState = useCallback(() => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.app_worker_is_running === 'function') {
      return Boolean((g.app_worker_is_running as () => boolean)());
    }
    const w = g.AppWorker as { isRunning?: () => boolean } | undefined;
    return Boolean(w?.isRunning?.());
  }, []);

  const refresh = useCallback(() => setRunning(readState()), [readState]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const launch = useCallback((): WorkerResult => {
    const g = globalThis as Record<string, unknown>;
    const resultMap: Record<number, WorkerResult> = {
      0: 'success', 1: 'alreadyRunning', 2: 'differentApp', 3: 'notInstalled', 4: 'error',
    };
    if (typeof g.app_worker_launch === 'function') {
      const code = (g.app_worker_launch as () => number)();
      refresh();
      return resultMap[code] ?? 'error';
    }
    const w = g.AppWorker as { launch?: () => WorkerResult } | undefined;
    if (w?.launch) {
      const r = w.launch();
      refresh();
      return r;
    }
    setRunning(true);
    return 'success';
  }, [refresh]);

  const kill = useCallback((): WorkerResult => {
    const g = globalThis as Record<string, unknown>;
    const resultMap: Record<number, WorkerResult> = {
      0: 'success', 1: 'notRunning', 2: 'differentApp', 4: 'error',
    };
    if (typeof g.app_worker_kill === 'function') {
      const code = (g.app_worker_kill as () => number)();
      refresh();
      return resultMap[code] ?? 'error';
    }
    const w = g.AppWorker as { kill?: () => WorkerResult } | undefined;
    if (w?.kill) {
      const r = w.kill();
      refresh();
      return r;
    }
    setRunning(false);
    return 'success';
  }, [refresh]);

  return { launch, kill, isRunning, refresh };
}
