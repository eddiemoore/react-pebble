/**
 * PebbleKit JS identity tokens — surfaced to the watch via AppMessage.
 *
 * Pebble.getAccountToken / getWatchToken / getTimelineToken are phone-only
 * APIs. The compiler emits PKJS that reads each token at app ready and
 * forwards it via AppMessage using these reserved keys:
 *
 *   _rpTokAcct   — developer-scoped stable user id (getAccountToken)
 *   _rpTokWatch  — stable per (app, watch) pair        (getWatchToken)
 *   _rpTokTL     — timeline token                      (getTimelineToken)
 *
 * At runtime, inbox/message dispatch populates `globalThis.__rpTokens`.
 * Hooks read from that bag (and a Moddable `Pebble` global fallback).
 * In mock mode (Node compile), the hooks return `null` so snapshots stay
 * deterministic regardless of host environment.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';
import { getPebbleGlobal, getRPTokenBag } from './internal/pebble-global.js';

/**
 * Stable, developer-scoped user identifier (phone's `Pebble.getAccountToken()`).
 * Returns `null` until the phone-side JS has forwarded the token.
 */
export function useAccountToken(): string | null {
  const [token, setToken] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    if (bag?._rpTokAcct) return bag._rpTokAcct;
    const p = getPebbleGlobal();
    const v = p?.getAccountToken?.();
    return typeof v === 'string' && v.length > 0 ? v : null;
  });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = getRPTokenBag();
      if (bag?._rpTokAcct) setToken(bag._rpTokAcct);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  return token;
}
