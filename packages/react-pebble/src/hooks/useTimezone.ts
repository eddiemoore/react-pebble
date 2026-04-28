/**
 * useTimezone — system timezone detection.
 *
 * Pebble C equivalent: clock_is_timezone_set(), clock_get_timezone()
 */

export interface TimezoneInfo {
  /** IANA timezone name (e.g. 'America/New_York'). */
  timezone: string;
  /** Whether the timezone has been configured on the watch. */
  isSet: boolean;
}

/**
 * Returns the system timezone.
 *
 * On Alloy/modern JS: uses `Intl.DateTimeFormat`.
 * In mock mode: returns `{ timezone: 'UTC', isSet: true }`.
 */
export function useTimezone(): TimezoneInfo {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return { timezone: tz, isSet: true };
    }
  } catch {
    // Intl not available
  }
  return { timezone: 'UTC', isSet: true };
}
