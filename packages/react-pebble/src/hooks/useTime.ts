/**
 * Time hooks
 *
 * On Alloy, `watch.addEventListener('secondchange'|'minutechange', fn)` is
 * the canonical tick source — it fires exactly on boundaries and is far more
 * battery-efficient than setInterval. In Node mock mode we fall back to
 * setInterval.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export function useTime(intervalMs = 1000): Date {
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setTime(new Date());

    // On Alloy: use watch tick events for battery efficiency
    if (typeof watch !== 'undefined' && watch) {
      const event = intervalMs <= 1000 ? 'secondchange' : 'minutechange';
      watch.addEventListener(event, tick);
      return () => watch!.removeEventListener(event, tick);
    }

    // Mock mode: fall back to setInterval
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return time;
}

/**
 * Returns `true` when the watch is configured to display time in 24-hour
 * format. Mirrors C SDK `clock_is_24h_style()` and Rocky `userPreferences.clock24h`.
 *
 * On Alloy: reads `clock_is_24h_style()` or `userPreferences.clock24h`.
 * In mock mode: falls back to `Intl.DateTimeFormat` (best-effort).
 */
export function clockIs24HourStyle(): boolean {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.clock_is_24h_style === 'function') {
      return Boolean((g.clock_is_24h_style as () => boolean)());
    }
    const rocky = (g as { rocky?: { userPreferences?: { clock24h?: boolean } } }).rocky;
    if (rocky?.userPreferences && typeof rocky.userPreferences.clock24h === 'boolean') {
      return rocky.userPreferences.clock24h;
    }
  }
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
      return opts.hour12 === false;
    }
  } catch {
    // ignore
  }
  return false;
}

// ---------------------------------------------------------------------------
// Time utility functions (pure; not hooks)
// ---------------------------------------------------------------------------

/**
 * Returns a Unix timestamp (seconds) for midnight local time today.
 * Mirrors C SDK `time_start_of_today()`.
 */
export function startOfToday(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.floor(midnight.getTime() / 1000);
}

/**
 * Convert a `Date` (or local Y/M/D/H/M/S tuple) to a Unix timestamp (seconds).
 * Mirrors C SDK `clock_to_timestamp()`.
 */
export function clockToTimestamp(date: Date): number;
export function clockToTimestamp(
  year: number,
  month: number,
  day: number,
  hour?: number,
  minute?: number,
  second?: number,
): number;
export function clockToTimestamp(
  dateOrYear: Date | number,
  month: number = 0,
  day: number = 1,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
): number {
  const d = dateOrYear instanceof Date
    ? dateOrYear
    : new Date(dateOrYear, month, day, hour, minute, second);
  return Math.floor(d.getTime() / 1000);
}
