/**
 * usePropertyAnimation — animate a numeric value between two endpoints.
 *
 * Wraps `useAnimation` internally, mapping the 0-1 progress to the
 * `from`-`to` range.
 */

import { type EasingFn } from './internal/easing.js';
import { useAnimation, type UseAnimationOptions } from './useAnimation.js';

export interface UsePropertyAnimationOptions {
  /** Start value. */
  from: number;
  /** End value. */
  to: number;
  /** Duration in ms. */
  duration: number;
  /** Easing function (default: linear). */
  easing?: EasingFn;
  /** Delay before start in ms (default: 0). */
  delay?: number;
  /** Auto-start on mount (default: true). */
  autoStart?: boolean;
}

export interface UsePropertyAnimationResult {
  /** Current interpolated value between `from` and `to`. */
  value: number;
  /** Start or restart the animation. */
  start: () => void;
  /** Stop the animation. */
  stop: () => void;
  /** Whether the animation is currently running. */
  running: boolean;
}

/**
 * Animate a numeric property from `from` to `to` over `duration` ms.
 *
 * Usage:
 *   const { value } = usePropertyAnimation({ from: 0, to: 100, duration: 500 });
 *   return <Rect x={value} ... />;
 */
export function usePropertyAnimation(
  options: UsePropertyAnimationOptions,
): UsePropertyAnimationResult {
  const { from, to, duration, easing, delay, autoStart } = options;

  const animOpts: UseAnimationOptions = {
    duration,
    easing,
    delay,
    autoStart,
  };

  const { progress, running, start, stop } = useAnimation(animOpts);

  const value = from + (to - from) * progress;

  return { value, start, stop, running };
}
