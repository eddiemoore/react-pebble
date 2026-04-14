/**
 * useWebSocket — bidirectional communication via pebbleproxy.
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseWebSocketResult {
  /** Last received message (null until first message). */
  lastMessage: string | null;
  /** Whether the connection is open. */
  connected: boolean;
  /** Send a message. */
  send: (data: string) => void;
  /** Close the connection. */
  close: () => void;
}

/**
 * Connect to a WebSocket server.
 *
 * On Alloy: uses the WebSocket API (proxied via @moddable/pebbleproxy).
 * In mock mode: simulates a connection that echoes messages back.
 */
export function useWebSocket(url: string): UseWebSocketResult {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<{ send: (d: string) => void; close: () => void } | null>(null);

  useEffect(() => {
    // On Alloy: use real WebSocket
    if (typeof WebSocket !== 'undefined') {
      const ws = new WebSocket(url);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => setLastMessage(String(e.data));
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
      wsRef.current = { send: (d) => ws.send(d), close: () => ws.close() };
      return () => ws.close();
    }

    // Mock mode: echo server
    setConnected(true);
    wsRef.current = {
      send: (d: string) => {
        setTimeout(() => setLastMessage(`echo: ${d}`), 50);
      },
      close: () => setConnected(false),
    };
    return () => setConnected(false);
  }, [url]);

  const send = useCallback((data: string) => {
    wsRef.current?.send(data);
  }, []);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return { lastMessage, connected, send, close };
}
