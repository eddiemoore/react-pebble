import { useCallback, useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';
import { getPebbleGlobal, getRPTokenBag } from './internal/pebble-global.js';

export interface UseTimelineTokenResult {
  /** The JWT-style token, or `null` while fetching. */
  token: string | null;
  /** Last error message from the phone side (`null` when healthy). */
  error: string | null;
  /** Ask the phone to re-fetch the token. */
  refresh(): void;
}

/**
 * Fetch the user's Pebble timeline token (phone's async `Pebble.getTimelineToken`).
 * The compiler emits PKJS code that fetches and forwards the token at ready
 * and on explicit refresh requests. Requires the `timeline` capability.
 */
export function useTimelineToken(): UseTimelineTokenResult {
  const [token, setToken] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    return bag?._rpTokTL ?? null;
  });
  const [error, setError] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    return bag?._rpTokTLErr ?? null;
  });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = getRPTokenBag();
      if (bag?._rpTokTL) setToken(bag._rpTokTL);
      if (bag?._rpTokTLErr) setError(bag._rpTokTLErr);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  const refresh = useCallback(() => {
    const p = getPebbleGlobal();
    // Ask PKJS to re-fetch by sending a refresh ping. The PKJS handler
    // registers for `_rpTokTLRefresh` and calls `Pebble.getTimelineToken`.
    p?.sendAppMessage?.({ _rpTokTLRefresh: 1 });
  }, []);

  return { token, error, refresh };
}
