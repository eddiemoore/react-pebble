/**
 * useRawResource — load a declared `type: 'raw'` resource as a byte array.
 */

import { useRef } from 'preact/hooks';

interface PebbleResourceCtor {
  new (name: string): { byteLength: number; slice(begin: number, end: number): ArrayBuffer };
}

/**
 * Read a raw resource blob declared via `pebblePiu({ resources: [{ type: 'raw', name, file }] })`.
 *
 * On Alloy: uses Moddable's `Resource` constructor.
 * On Rocky / C / mock: currently returns `null` (C/Rocky paths rely on
 * compiler-emitted helpers; wire once your app needs them).
 */
export function useRawResource(name: string): Uint8Array | null {
  return useMemoizedValue(() => {
    if (typeof globalThis === 'undefined') return null;
    const Res = (globalThis as Record<string, unknown>).Resource as PebbleResourceCtor | undefined;
    if (!Res) return null;
    try {
      const r = new Res(name);
      const buf = r.slice(0, r.byteLength);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }, [name]);
}

function useMemoizedValue<T>(factory: () => T, deps: unknown[]): T {
  const ref = useRef<{ deps: unknown[]; value: T } | null>(null);
  const cur = ref.current;
  const same =
    cur !== null &&
    cur.deps.length === deps.length &&
    cur.deps.every((d, i) => d === deps[i]);
  if (same) return cur.value;
  const value = factory();
  ref.current = { deps, value };
  return value;
}
