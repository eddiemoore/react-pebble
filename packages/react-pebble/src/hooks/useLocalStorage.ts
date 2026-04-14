/**
 * localStorage hook — persists state across app restarts and reboots.
 *
 * Like useState, but backed by localStorage so the value persists across
 * app restarts and watch reboots.
 *
 * On Alloy, `localStorage` is a standard Web API global.
 * In mock mode (Node), falls back to a plain in-memory useState.
 *
 * Values are JSON-serialized. Only use with JSON-safe types.
 */

import { useCallback } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) as T : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setAndPersist = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or unavailable — silently ignore
        }
      }
      return next;
    });
  }, [key]);

  return [value, setAndPersist];
}
