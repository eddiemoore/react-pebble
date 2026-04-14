import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';
import { getPebbleGlobal, getRPTokenBag } from './internal/pebble-global.js';

/**
 * Stable per-(app, watch) identifier (phone's `Pebble.getWatchToken()`).
 * Returns `null` until the phone-side JS has forwarded the token.
 */
export function useWatchToken(): string | null {
  const [token, setToken] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    if (bag?._rpTokWatch) return bag._rpTokWatch;
    const p = getPebbleGlobal();
    const v = p?.getWatchToken?.();
    return typeof v === 'string' && v.length > 0 ? v : null;
  });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = getRPTokenBag();
      if (bag?._rpTokWatch) setToken(bag._rpTokWatch);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  return token;
}
