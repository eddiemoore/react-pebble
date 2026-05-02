/**
 * useMessage — runtime data loading via phone→watch messaging
 */

import { useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseMessageOptions<T> {
  /** Message key name (must match PebbleKit JS sendAppMessage key) */
  key: string;
  /** Mock data returned at compile time so the compiler can render the loaded state */
  mockData: T;
  /** Delay in ms before mock data appears (for SETTLE_MS) */
  mockDelay?: number;
  /** Called when an incoming message is dropped (buffer full, etc). */
  onDropped?: (reason: string) => void;
  /** Called when an outbound message fails to send. */
  onSendFailed?: (reason: string) => void;
}

export interface UseMessageResult<T> {
  data: T | null;
  loading: boolean;
  /** Error message if the last receive/send failed, null otherwise. */
  error: string | null;
}

/**
 * Load data from the phone at runtime via Pebble's Message API.
 *
 * At compile time (Node mock mode): returns mockData after mockDelay ms.
 * At runtime (Alloy): the compiler emits a Message subscription that
 * populates data when the phone sends it.
 *
 * The `onDropped` callback fires when an incoming message is dropped
 * (e.g. buffer overflow). The `onSendFailed` callback fires when an
 * outbound message fails. Both map to the C SDK's
 * `app_message_register_inbox_dropped` and `app_message_register_outbox_failed`.
 *
 * Usage:
 *   const { data, loading, error } = useMessage({
 *     key: 'items',
 *     mockData: [{ title: 'Fix bug', status: 'Open' }],
 *     onDropped: (reason) => console.log('dropped:', reason),
 *     onSendFailed: (reason) => console.log('send failed:', reason),
 *   });
 */
export function useMessage<T>(options: UseMessageOptions<T>): UseMessageResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onDroppedRef = useRef(options.onDropped);
  const onSendFailedRef = useRef(options.onSendFailed);
  onDroppedRef.current = options.onDropped;
  onSendFailedRef.current = options.onSendFailed;

  useEffect(() => {
    // In mock mode (compile time), simulate async data arrival
    const timer = setTimeout(() => {
      setData(options.mockData);
      setLoading(false);
    }, options.mockDelay ?? 100);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, error };
}
