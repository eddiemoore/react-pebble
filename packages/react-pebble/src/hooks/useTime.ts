/**
 * Time hooks
 *
 * On Alloy, `watch.addEventListener('secondchange'|'minutechange'|'hourchange'|
 * 'daychange', fn)` is the canonical tick source — it fires exactly on
 * boundaries and is far more battery-efficient than setInterval. In Node mock
 * mode we fall back to setInterval, or (for 'day') a setTimeout-to-next-
 * midnight chain so boundaries don't drift over long runs.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export type TimeGranularity = 'second' | 'minute' | 'hour' | 'day';

/**
 * Map the `useTime` argument to a concrete granularity.
 *  - `undefined` → 'second' (runtime mock default)
 *  - `TimeGranularity` string → itself
 *  - `number` (legacy intervalMs): ≤1000 → 'second', ≤60_000 → 'minute',
 *    ≤3_600_000 → 'hour', else 'day'.
 */
export function resolveGranularity(arg?: TimeGranularity | number): TimeGranularity {
  if (arg === undefined) return 'second';
  if (typeof arg === 'string') return arg;
  if (arg <= 1000) return 'second';
  if (arg <= 60_000) return 'minute';
  if (arg <= 3_600_000) return 'hour';
  return 'day';
}

function granularityToEvent(g: TimeGranularity): 'secondchange' | 'minutechange' | 'hourchange' | 'daychange' {
  return `${g}change` as 'secondchange' | 'minutechange' | 'hourchange' | 'daychange';
}

function granularityToIntervalMs(g: TimeGranularity): number {
  switch (g) {
    case 'second': return 1000;
    case 'minute': return 60_000;
    case 'hour':   return 3_600_000;
    case 'day':    return 86_400_000;
  }
}

function msToNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function useTime(granularity?: TimeGranularity | number): Date {
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const g = resolveGranularity(granularity);
    const tick = () => setTime(new Date());

    // On Alloy: use watch tick events for battery efficiency
    if (typeof watch !== 'undefined' && watch) {
      const event = granularityToEvent(g);
      watch.addEventListener(event, tick);
      return () => watch!.removeEventListener(event, tick);
    }

    // Mock mode — 'day' uses a setTimeout chain to local-midnight so the
    // boundary doesn't drift across long-running tests.
    if (g === 'day') {
      let id: ReturnType<typeof setTimeout>;
      const schedule = () => {
        id = setTimeout(() => { tick(); schedule(); }, msToNextLocalMidnight());
      };
      schedule();
      return () => clearTimeout(id);
    }

    const id = setInterval(tick, granularityToIntervalMs(g));
    return () => clearInterval(id);
  }, [granularity]);

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
