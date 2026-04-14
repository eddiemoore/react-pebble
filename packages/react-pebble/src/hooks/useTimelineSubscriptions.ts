/**
 * useTimelineSubscriptions — manage PebbleKit JS timeline topic subscriptions.
 *
 * The compiler emits PKJS code that handles inbox commands:
 *   _rpTLSub:<topic>    — Pebble.timelineSubscribe(topic)
 *   _rpTLUnsub:<topic>  — Pebble.timelineUnsubscribe(topic)
 *   _rpTLList:1         — Pebble.timelineSubscriptions(cb) → forwards result
 *
 * The phone side forwards the subscription list via `_rpTLSubs` (JSON
 * array), which this hook reads from the `__rpTokens` bag.
 */

import { useCallback, useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';
import { getPebbleGlobal } from './internal/pebble-global.js';

interface RPSubscriptionsBag {
  _rpTLSubs?: string[];
  _rpTLSubsErr?: string;
}

export interface UseTimelineSubscriptionsResult {
  /** Current subscribed topics; `null` until the phone responds the first time. */
  topics: string[] | null;
  /** Last error message from the phone side (`null` when healthy). */
  error: string | null;
  /** Ask the phone to subscribe to `topic`. */
  subscribe(topic: string): void;
  /** Ask the phone to unsubscribe from `topic`. */
  unsubscribe(topic: string): void;
  /** Request an updated subscription list. */
  refresh(): void;
}

export function useTimelineSubscriptions(): UseTimelineSubscriptionsResult {
  const readBag = (): RPSubscriptionsBag | undefined => {
    if (typeof globalThis === 'undefined') return undefined;
    return (globalThis as Record<string, unknown>).__rpTokens as RPSubscriptionsBag | undefined;
  };

  const [topics, setTopics] = useState<string[] | null>(() => readBag()?._rpTLSubs ?? null);
  const [error, setError] = useState<string | null>(() => readBag()?._rpTLSubsErr ?? null);

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = readBag();
      if (bag?._rpTLSubs) setTopics(bag._rpTLSubs);
      if (bag?._rpTLSubsErr) setError(bag._rpTLSubsErr);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  const subscribe = useCallback((topic: string) => {
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLSub: topic });
  }, []);
  const unsubscribe = useCallback((topic: string) => {
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLUnsub: topic });
  }, []);
  const refresh = useCallback(() => {
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLList: 1 });
  }, []);

  return { topics, error, subscribe, unsubscribe, refresh };
}
