/**
 * useDataLogging — batch data collection to phone.
 */

import { useCallback, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseDataLoggingResult {
  /** Log a data item. Returns true on success. */
  log: (data: string) => boolean;
  /** Close the logging session. */
  finish: () => void;
  /** Whether the session is active. */
  active: boolean;
}

/**
 * Batch data collection for transmission to the phone.
 *
 * On Alloy: uses the `DataLogging` global.
 * In mock mode: logs to console.
 */
export function useDataLogging(tag: number): UseDataLoggingResult {
  const sessionRef = useRef<{ log: (d: string) => boolean; finish: () => void } | null>(null);
  const [active, setActive] = useState(false);

  if (!sessionRef.current) {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).DataLogging) {
      const dl = (globalThis as Record<string, unknown>).DataLogging as {
        create?: (tag: number, type: string, size: number) => {
          log: (d: string) => boolean;
          finish: () => void;
        } | null;
      };
      const session = dl.create?.(tag, 'byte', 1);
      if (session) {
        sessionRef.current = session;
        setActive(true);
      }
    }

    if (!sessionRef.current) {
      // Mock: log to console
      sessionRef.current = {
        log: (d: string) => { /* no-op in mock */ return true; },
        finish: () => {},
      };
    }
  }

  const log = useCallback((data: string) => {
    return sessionRef.current?.log(data) ?? false;
  }, []);

  const finish = useCallback(() => {
    sessionRef.current?.finish();
    setActive(false);
  }, []);

  return { log, finish, active };
}
