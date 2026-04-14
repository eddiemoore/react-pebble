/**
 * useConfiguration — phone-side settings page.
 */

import { useCallback, useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface UseConfigurationOptions<T extends Record<string, unknown>> {
  /** URL of the phone-side configuration page */
  url: string;
  /** Default settings values */
  defaults: T;
}

export interface UseConfigurationResult<T extends Record<string, unknown>> {
  settings: T;
  openConfiguration: () => void;
  updateSettings: (partial: Partial<T>) => void;
}

/**
 * Manage app configuration via a phone-side settings page.
 * Settings are persisted to localStorage and synced when the
 * config page sends data back.
 *
 * On Alloy: opens config URL on phone via PebbleKit JS.
 * In mock mode: uses defaults, updateSettings mutates in-memory.
 */
export function useConfiguration<T extends Record<string, unknown>>(
  options: UseConfigurationOptions<T>,
): UseConfigurationResult<T> {
  const [settings, setSettings] = useState<T>(() => {
    // Try to load from localStorage
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).localStorage) {
      try {
        const stored = (globalThis as Record<string, unknown>).localStorage as Storage;
        const raw = stored.getItem('__pebble_config__');
        if (raw) return { ...options.defaults, ...JSON.parse(raw) };
      } catch {
        // ignore parse errors
      }
    }
    return options.defaults;
  });

  const openConfiguration = useCallback(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Pebble) {
      const pbl = (globalThis as Record<string, unknown>).Pebble as {
        openURL?: (url: string) => void;
      };
      pbl.openURL?.(options.url);
    }
  }, [options.url]);

  const updateSettings = useCallback((partial: Partial<T>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).localStorage) {
        try {
          const stored = (globalThis as Record<string, unknown>).localStorage as Storage;
          stored.setItem('__pebble_config__', JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
      }
      return next;
    });
  }, []);

  // Listen for config data coming back from the phone
  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Pebble) {
      const pbl = (globalThis as Record<string, unknown>).Pebble as {
        addEventListener?: (event: string, handler: (e: { response: string }) => void) => void;
        removeEventListener?: (event: string, handler: (e: { response: string }) => void) => void;
      };
      const handler = (e: { response: string }) => {
        try {
          const data = JSON.parse(decodeURIComponent(e.response)) as Partial<T>;
          updateSettings(data);
        } catch {
          // ignore parse errors
        }
      };
      pbl.addEventListener?.('webviewclosed', handler);
      return () => {
        pbl.removeEventListener?.('webviewclosed', handler);
      };
    }
    return undefined;
  }, [updateSettings]);

  return { settings, openConfiguration, updateSettings };
}
