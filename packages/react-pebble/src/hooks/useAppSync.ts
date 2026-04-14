/**
 * useAppSync — simplified bidirectional phone-watch data sync.
 */

import { useCallback, useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseAppSyncOptions<T extends Record<string, unknown>> {
  /** Initial key-value pairs to synchronize */
  keys: T;
}

export interface UseAppSyncResult<T extends Record<string, unknown>> {
  values: T;
  update: (partial: Partial<T>) => void;
}

/**
 * Simplified phone↔watch data synchronization.
 * Maintains a synchronized set of key-value pairs between phone and watch.
 *
 * On Alloy: uses AppMessage for bidirectional sync.
 * In mock mode: uses local state with initial keys.
 */
export function useAppSync<T extends Record<string, unknown>>(
  options: UseAppSyncOptions<T>,
): UseAppSyncResult<T> {
  const [values, setValues] = useState<T>(options.keys);

  const update = useCallback((partial: Partial<T>) => {
    setValues((prev) => {
      const next = { ...prev, ...partial };
      // Send update to phone via AppMessage
      if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppMessage) {
        const am = (globalThis as Record<string, unknown>).AppMessage as {
          send?: (data: Record<string, unknown>) => void;
        };
        am.send?.(partial);
      }
      return next;
    });
  }, []);

  // Listen for incoming sync updates from phone
  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppMessage) {
      const am = (globalThis as Record<string, unknown>).AppMessage as {
        addEventListener?: (event: string, handler: (data: Record<string, unknown>) => void) => void;
        removeEventListener?: (event: string, handler: (data: Record<string, unknown>) => void) => void;
      };
      const handler = (data: Record<string, unknown>) => {
        setValues((prev) => ({ ...prev, ...data } as T));
      };
      am.addEventListener?.('received', handler);
      return () => {
        am.removeEventListener?.('received', handler);
      };
    }
    return undefined;
  }, []);

  return { values, update };
}
