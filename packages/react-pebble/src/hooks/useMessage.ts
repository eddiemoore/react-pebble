/**
 * useMessage — runtime data loading via phone→watch messaging
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseMessageOptions<T> {
  /** Message key name (must match PebbleKit JS sendAppMessage key) */
  key: string;
  /** Mock data returned at compile time so the compiler can render the loaded state */
  mockData: T;
  /** Delay in ms before mock data appears (for SETTLE_MS) */
  mockDelay?: number;
}

export interface UseMessageResult<T> {
  data: T | null;
  loading: boolean;
}

/**
 * Load data from the phone at runtime via Pebble's Message API.
 *
 * At compile time (Node mock mode): returns mockData after mockDelay ms.
 * At runtime (Alloy): the compiler emits a Message subscription that
 * populates data when the phone sends it.
 *
 * Usage:
 *   const { data, loading } = useMessage({
 *     key: 'items',
 *     mockData: [{ title: 'Fix bug', status: 'Open' }],
 *   });
 */
export function useMessage<T>(options: UseMessageOptions<T>): UseMessageResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In mock mode (compile time), simulate async data arrival
    const timer = setTimeout(() => {
      setData(options.mockData);
      setLoading(false);
    }, options.mockDelay ?? 100);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading };
}
