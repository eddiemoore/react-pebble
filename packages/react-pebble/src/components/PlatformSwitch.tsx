import { React, type ReactNode } from './internal/preact-compat.js';
import { usePlatform } from '../hooks/usePlatform.js';

export interface PlatformSwitchProps {
  /** Rendered on color displays. */
  color?: ReactNode;
  /** Rendered on black-and-white displays. */
  bw?: ReactNode;
  /** Rendered on round displays. */
  round?: ReactNode;
  /** Rendered on rectangular displays. */
  rect?: ReactNode;
  /** Fallback when no platform-specific child matches. */
  fallback?: ReactNode;
}

/**
 * PlatformSwitch — renders children conditionally based on platform traits.
 *
 * Checks `round`/`rect` first (shape), then `color`/`bw` (display type).
 * Falls back to `fallback` if nothing matches.
 */
export function PlatformSwitch({
  color,
  bw,
  round,
  rect,
  fallback,
}: PlatformSwitchProps) {
  const { isRound, isColor } = usePlatform();

  // Shape-specific branches take priority
  if (isRound && round !== undefined) {
    return React.createElement(React.Fragment, null, round);
  }
  if (!isRound && rect !== undefined) {
    return React.createElement(React.Fragment, null, rect);
  }

  // Color capability branches
  if (isColor && color !== undefined) {
    return React.createElement(React.Fragment, null, color);
  }
  if (!isColor && bw !== undefined) {
    return React.createElement(React.Fragment, null, bw);
  }

  // Fallback
  if (fallback !== undefined) {
    return React.createElement(React.Fragment, null, fallback);
  }

  return null;
}
