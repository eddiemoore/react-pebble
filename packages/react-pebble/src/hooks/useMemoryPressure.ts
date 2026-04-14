/**
 * useMemoryPressure — subscribe to Rocky 'memorypressure' events.
 */

import { useEffect, useRef } from 'preact/hooks';

export type MemoryPressureLevel = 'normal' | 'high' | 'critical';

/**
 * Subscribe to memory pressure events (Rocky.js `memorypressure` event).
 * The handler is called when the runtime is about to start dropping
 * allocations — your app should shed caches and large allocations.
 *
 * On Rocky: registers with `rocky.on('memorypressure', ...)`.
 * Elsewhere: no-op (Alloy and C SDK don't expose this event directly).
 */
export function useMemoryPressure(handler: (level: MemoryPressureLevel) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const rocky = g.rocky as {
      on?: (event: string, cb: (ev: { level?: string }) => void) => void;
      off?: (event: string, cb: (ev: { level?: string }) => void) => void;
    } | undefined;
    if (!rocky?.on) return undefined;

    const listener = (ev: { level?: string }) => {
      const lvl = (ev?.level as MemoryPressureLevel) ?? 'high';
      handlerRef.current(lvl);
    };
    rocky.on('memorypressure', listener);
    return () => rocky.off?.('memorypressure', listener);
  }, []);
}
