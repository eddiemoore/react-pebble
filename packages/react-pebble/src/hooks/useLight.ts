/**
 * useLight — backlight control.
 */

import { useCallback } from 'preact/hooks';

export interface UseLightResult {
  /** Trigger the backlight with normal auto-off timeout. */
  trigger: () => void;
  /** Force backlight on or off. */
  enable: (on: boolean) => void;
  /** Set backlight RGB tint (on hardware with an RGB backlight). */
  setColor: (r: number, g: number, b: number) => void;
  /** Set backlight brightness (0–100). */
  setBrightness: (level: number) => void;
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
  const noopRGB = useCallback((_r: number, _g: number, _b: number) => {}, []);
  const noopNum = useCallback((_level: number) => {}, []);

  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Light) {
    const light = (globalThis as Record<string, unknown>).Light as {
      trigger?: () => void;
      enable?: (on: boolean) => void;
      setColor?: (r: number, g: number, b: number) => void;
      setBrightness?: (level: number) => void;
    };
    return {
      trigger: light.trigger ?? noop,
      enable: light.enable ?? noopBool,
      setColor: light.setColor ?? noopRGB,
      setBrightness: light.setBrightness ?? noopNum,
    };
  }

  return { trigger: noop, enable: noopBool, setColor: noopRGB, setBrightness: noopNum };
}
