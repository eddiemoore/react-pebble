/**
 * Internationalization — useTranslation + defineTranslations.
 */

import { useCallback } from 'preact/hooks';
import { useLocale } from './useLocale.js';

export type TranslationDict = Record<string, Record<string, string>>;

let _translationTable: TranslationDict = {};
let _fallbackLocale = 'en';

/**
 * Register translation strings. Call once at app startup, before rendering.
 *
 *   defineTranslations({
 *     en: { hello: "Hello", steps: "{n} steps" },
 *     fr: { hello: "Bonjour", steps: "{n} pas" },
 *   });
 *
 * Translations are looked up by language code first (e.g. 'fr'), then by
 * full locale (e.g. 'fr-CA'). If neither is present, falls back to
 * `fallback` (default `'en'`).
 */
export function defineTranslations(dict: TranslationDict, fallback: string = 'en'): void {
  _translationTable = dict;
  _fallbackLocale = fallback;
}

/**
 * Returns a `t(key, params?)` function that resolves translation strings
 * for the device's current locale. Re-renders when the locale changes.
 *
 *   const t = useTranslation();
 *   return <Text>{t('steps', { n: steps })}</Text>;
 */
export function useTranslation(): (key: string, params?: Record<string, string | number>) => string {
  const { language } = useLocale();

  return useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = _translationTable[language]
      ?? _translationTable[_fallbackLocale]
      ?? {};
    let str = dict[key] ?? _translationTable[_fallbackLocale]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }, [language]);
}
