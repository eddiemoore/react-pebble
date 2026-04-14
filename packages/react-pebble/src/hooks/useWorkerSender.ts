import { useCallback } from 'preact/hooks';
import type { WorkerMessage } from './useWorkerLaunch.js';

export interface UseWorkerSenderResult {
  /** Send a message to the worker (from foreground app) or to the app (from worker). */
  send: (msg: WorkerMessage) => void;
}

/**
 * Returns a `send(msg)` function for cross-process messaging with the
 * background worker. Mirrors `app_worker_send_message()`.
 */
export function useWorkerSender(): UseWorkerSenderResult {
  const send = useCallback((msg: WorkerMessage) => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.app_worker_send_message === 'function') {
      (g.app_worker_send_message as (type: number, data: number) => void)(
        msg.type,
        msg.data ?? 0,
      );
      return;
    }
    const w = g.AppWorker as {
      send?: (msg: WorkerMessage) => void;
    } | undefined;
    w?.send?.(msg);
  }, []);

  return { send };
}
