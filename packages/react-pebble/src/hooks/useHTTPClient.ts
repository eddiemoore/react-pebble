/**
 * useHTTPClient — streaming/chunked HTTP (ECMA-419 HTTPClient).
 */

import { useCallback, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface HTTPClientRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  onData?: (chunk: ArrayBuffer) => void;
  onHeaders?: (status: number, headers: Record<string, string>) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export interface UseHTTPClientResult {
  /** Send an HTTP request with streaming callbacks. */
  request: (url: string, options?: HTTPClientRequestOptions) => void;
  /** Abort the current request. */
  abort: () => void;
  loading: boolean;
}

/**
 * Streaming HTTP client for chunked/large responses.
 *
 * On Alloy: uses the ECMA-419 HTTPClient for streaming.
 * In mock mode: falls back to fetch() with simulated chunking.
 */
export function useHTTPClient(): UseHTTPClientResult {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<{ abort?: () => void; close?: () => void } | null>(null);

  const request = useCallback((url: string, options?: HTTPClientRequestOptions) => {
    setLoading(true);

    // Alloy runtime: ECMA-419 HTTPClient
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).HTTPClient) {
      try {
        const HTTPClient = (globalThis as Record<string, unknown>).HTTPClient as new (opts: Record<string, unknown>) => {
          close?: () => void;
        };
        const client = new HTTPClient({
          host: new URL(url).hostname,
          path: new URL(url).pathname + new URL(url).search,
          method: options?.method ?? 'GET',
          headers: options?.headers ? Object.entries(options.headers) : [],
          body: options?.body,
          onHeaders(status: number, headers: Record<string, string>) {
            options?.onHeaders?.(status, headers);
          },
          onReadable(count: number) {
            // Read available data
            if (count > 0 && (this as unknown as { read: (count: number) => ArrayBuffer }).read) {
              const chunk = (this as unknown as { read: (count: number) => ArrayBuffer }).read(count);
              options?.onData?.(chunk);
            }
          },
          onDone() {
            setLoading(false);
            options?.onComplete?.();
          },
          onError(err: string) {
            setLoading(false);
            options?.onError?.(err ?? 'Request failed');
          },
        });
        abortRef.current = client;
      } catch (e) {
        setLoading(false);
        options?.onError?.(String(e));
      }
      return;
    }

    // Mock mode: use fetch
    const controller = new AbortController();
    abortRef.current = { abort: () => controller.abort() };

    fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body as string | undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        options?.onHeaders?.(response.status, Object.fromEntries(response.headers.entries()));
        const buffer = await response.arrayBuffer();
        options?.onData?.(buffer);
        setLoading(false);
        options?.onComplete?.();
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          setLoading(false);
          options?.onError?.(String(e));
        }
      });
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort?.();
    abortRef.current?.close?.();
    abortRef.current = null;
    setLoading(false);
  }, []);

  return { request, abort, loading };
}
