/**
 * Connection hook — reads watch.connected (app + pebblekit).
 */

export interface ConnectionState {
  app: boolean;
  pebblekit: boolean;
}

/**
 * Returns the current phone connection state. On Alloy, reads
 * `watch.connected`. In mock mode, returns connected for both.
 */
export function useConnection(): ConnectionState {
  if (typeof watch !== 'undefined' && watch?.connected) {
    return {
      app: watch.connected.app,
      pebblekit: watch.connected.pebblekit,
    };
  }
  // Mock mode
  return { app: true, pebblekit: true };
}
