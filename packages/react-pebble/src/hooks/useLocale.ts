/**
 * useLocale — system language/locale detection.
 */

import { clockIs24HourStyle } from './useTime.js';

export interface LocaleInfo {
  language: string;
  country: string;
  /** Whether the user prefers 24-hour time display. */
  is24Hour: boolean;
}

/**
 * Returns the system locale.
 *
 * On Alloy/modern JS: uses `Intl.DateTimeFormat`.
 * In mock mode: returns `{ language: 'en', country: 'US', is24Hour: false }`.
 */
export function useLocale(): LocaleInfo {
  const is24Hour = clockIs24HourStyle();
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const opts = new Intl.DateTimeFormat().resolvedOptions();
      const parts = opts.locale.split('-');
      return {
        language: parts[0] ?? 'en',
        country: parts[1] ?? 'US',
        is24Hour,
      };
    }
  } catch {
    // Intl not available
  }
  return { language: 'en', country: 'US', is24Hour };
}
