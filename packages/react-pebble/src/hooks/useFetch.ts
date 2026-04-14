/**
 * useFetch — HTTP data loading via pebbleproxy.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseFetchOptions<T> {
  /** Mock data returned in Node mock mode so the compiler can render. */
  mockData?: T;
  /** Delay in ms before mock data appears (default 100). */
  mockDelay?: number;
  /** fetch() RequestInit options (method, headers, body). */
  init?: RequestInit;
}

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch JSON data from a URL.
 *
 * On Alloy: uses the standard `fetch()` API (proxied via @moddable/pebbleproxy).
 * In mock mode (Node): returns `mockData` after `mockDelay` ms.
 *
 * Usage:
 *   const { data, loading, error } = useFetch<Weather>(
 *     'https://api.example.com/weather',
 *     { mockData: { temp: 72, condition: 'Sunny' } }
 *   );
 */
export function useFetch<T>(url: string, options: UseFetchOptions<T> = {}): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // On Alloy (real device): use fetch()
    if (typeof globalThis.fetch === 'function') {
      globalThis.fetch(url, options.init)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<T>;
        })
        .then((json) => {
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
      return;
    }

    // Mock mode: return mockData after delay
    if (options.mockData !== undefined) {
      const timer = setTimeout(() => {
        setData(options.mockData!);
        setLoading(false);
      }, options.mockDelay ?? 100);
      return () => clearTimeout(timer);
    }

    // No fetch and no mock data
    setError('fetch() not available');
    setLoading(false);
  }, [url]);

  return { data, loading, error };
}
