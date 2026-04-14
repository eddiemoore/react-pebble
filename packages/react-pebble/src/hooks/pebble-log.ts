/**
 * Logging utility — wraps APP_LOG on device, console.log in mock mode.
 */

export type LogLevel = 'error' | 'warning' | 'info' | 'debug';

/**
 * Log a message for development debugging.
 * On Alloy: uses APP_LOG equivalent via Bluetooth.
 * In mock mode: uses console.log/warn/error.
 */
export function pebbleLog(level: LogLevel, ...args: unknown[]): void {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).trace) {
    // Moddable's trace() function outputs to the debug console
    const t = (globalThis as Record<string, unknown>).trace as (msg: string) => void;
    t(`[${level.toUpperCase()}] ${args.map(String).join(' ')}\n`);
    return;
  }
  // Mock mode — use console
  switch (level) {
    case 'error': console.error('[PEBBLE]', ...args); break;
    case 'warning': console.warn('[PEBBLE]', ...args); break;
    default: console.log(`[PEBBLE:${level.toUpperCase()}]`, ...args);
  }
}
