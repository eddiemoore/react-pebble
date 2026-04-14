/**
 * useLight — backlight control.
 */

import { useCallback } from 'preact/hooks';

export interface UseLightResult {
  /** Trigger the backlight with normal auto-off timeout. */
  trigger: () => void;
  /** Force backlight on or off. */
  enable: (on: boolean) => void;
}

/**
 * Control the watch backlight.
 *
 * On Alloy: uses the `Light` global.
 * In mock mode: no-op functions.
 */
export function useLight(): UseLightResult {
  const noop = useCallback(() => {}, []);
  const noopBool = useCallback((_on: boolean) => {}, []);

  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Light) {
    const light = (globalThis as Record<string, unknown>).Light as {
      trigger?: () => void;
      enable?: (on: boolean) => void;
    };
    return {
      trigger: light.trigger ?? noop,
      enable: light.enable ?? noopBool,
    };
  }

  return { trigger: noop, enable: noopBool };
}
