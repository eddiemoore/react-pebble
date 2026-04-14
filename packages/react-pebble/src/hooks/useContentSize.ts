/**
 * useContentSize — user's preferred content size (accessibility).
 */

export type ContentSize = 'small' | 'default' | 'large' | 'extraLarge';

/**
 * Returns the user's preferred content size setting.
 * Useful for adapting font sizes and spacing for accessibility.
 *
 * On Alloy: reads the `ContentSize` global.
 * In mock mode: returns 'default'.
 */
export function useContentSize(): ContentSize {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).ContentSize) {
    const cs = (globalThis as Record<string, unknown>).ContentSize as {
      preferred?: () => string;
    };
    const pref = cs.preferred?.();
    if (pref === 'small' || pref === 'large' || pref === 'extraLarge') return pref;
  }
  return 'default';
}
