/**
 * useKVStorage — ECMA-419 binary key-value storage.
 *
 * Key-value storage for binary and structured data using the ECMA-419 API.
 *
 * On Alloy: uses `device.keyValue.open(storeName)` for persistent binary storage.
 * In mock mode: uses an in-memory Map.
 *
 * For simple string storage, prefer `useLocalStorage`.
 */

import { useCallback, useRef } from 'preact/hooks';

export function useKVStorage(storeName: string): {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
} {
  const storeRef = useRef<{
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
    delete: (key: string) => void;
  } | null>(null);

  if (!storeRef.current) {
    // Try ECMA-419 device.keyValue API
    const device = (globalThis as Record<string, unknown>).device as {
      keyValue?: { open: (path: string) => {
        get: (key: string) => string | null;
        set: (key: string, value: string) => void;
        delete: (key: string) => void;
      }};
    } | undefined;

    if (device?.keyValue) {
      storeRef.current = device.keyValue.open(storeName);
    } else {
      // Mock mode: in-memory map
      const map = new Map<string, string>();
      storeRef.current = {
        get: (k) => map.get(k) ?? null,
        set: (k, v) => map.set(k, v),
        delete: (k) => { map.delete(k); },
      };
    }
  }

  const store = storeRef.current!;
  return {
    get: useCallback((key: string) => store.get(key), []),
    set: useCallback((key: string, value: string) => store.set(key, value), []),
    remove: useCallback((key: string) => store.delete(key), []),
  };
}
