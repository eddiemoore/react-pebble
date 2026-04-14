/**
 * Shared accessors for the Moddable `Pebble` global and the runtime token bag
 * populated by inbox/message dispatch (`globalThis.__rpTokens`).
 *
 * Used by `useTimeline`, `useTimelineSubscriptions`, `useAccountToken`,
 * `useWatchToken`, and `useTimelineToken`.
 */

export interface RPTokenBag {
  _rpTokAcct?: string;
  _rpTokWatch?: string;
  _rpTokTL?: string;
  _rpTokTLErr?: string;
}

export interface ModdablePebbleGlobal {
  getAccountToken?: () => string | undefined;
  getWatchToken?: () => string | undefined;
  getTimelineToken?: (
    onSuccess: (token: string) => void,
    onError: (err: string) => void,
  ) => void;
  sendAppMessage?: (msg: Record<string, unknown>) => void;
}

export function getRPTokenBag(): RPTokenBag | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as Record<string, unknown>).__rpTokens as RPTokenBag | undefined;
}

export function getPebbleGlobal(): ModdablePebbleGlobal | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as Record<string, unknown>).Pebble as ModdablePebbleGlobal | undefined;
}
