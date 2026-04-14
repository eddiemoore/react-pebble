/**
 * useLocale — system language/locale detection.
 */

export interface LocaleInfo {
  language: string;
  country: string;
}

/**
 * Returns the system locale.
 *
 * On Alloy/modern JS: uses `Intl.DateTimeFormat`.
 * In mock mode: returns `{ language: 'en', country: 'US' }`.
 */
export function useLocale(): LocaleInfo {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const opts = new Intl.DateTimeFormat().resolvedOptions();
      const parts = opts.locale.split('-');
      return {
        language: parts[0] ?? 'en',
        country: parts[1] ?? 'US',
      };
    }
  } catch {
    // Intl not available
  }
  return { language: 'en', country: 'US' };
}
