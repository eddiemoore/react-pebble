import { useEffect, useRef } from 'preact/hooks';
import type { WorkerMessage } from './useWorkerLaunch.js';

/**
 * Subscribe to messages from the background worker (or, when used inside
 * a worker context, messages from the foreground app).
 *
 * On Alloy/C: uses `app_worker_message_subscribe()`.
 * In mock mode: no-op.
 */
export function useWorkerMessage(handler: (msg: WorkerMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const dispatch = (type: number, data?: number) => handlerRef.current({ type, data });

    if (typeof g.app_worker_message_subscribe === 'function') {
      (g.app_worker_message_subscribe as (cb: (type: number, data: number) => void) => void)(
        (type, data) => dispatch(type, data),
      );
      return () => {
        if (typeof g.app_worker_message_unsubscribe === 'function') {
          (g.app_worker_message_unsubscribe as () => void)();
        }
      };
    }
    const w = g.AppWorker as {
      onMessage?: (cb: (msg: WorkerMessage) => void) => void;
      offMessage?: (cb: (msg: WorkerMessage) => void) => void;
    } | undefined;
    if (w?.onMessage) {
      const cb = (msg: WorkerMessage) => handlerRef.current(msg);
      w.onMessage(cb);
      return () => w.offMessage?.(cb);
    }
    return undefined;
  }, []);
}
