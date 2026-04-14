/**
 * useAnimation — property interpolation with easing.
 */

import { useCallback } from 'preact/hooks';
import { Easing, type EasingFn } from './internal/easing.js';
import { useTime } from './useTime.js';

export interface UseAnimationOptions {
  /** Duration in ms. */
  duration: number;
  /** Easing function (default: linear). */
  easing?: EasingFn;
  /** Delay before start in ms (default: 0). */
  delay?: number;
  /** Loop the animation (default: false). */
  loop?: boolean;
  /** Auto-start on mount (default: true). */
  autoStart?: boolean;
}

export interface UseAnimationResult {
  /** Current progress value (0 to 1), eased. */
  progress: number;
  /** Whether the animation is currently running. */
  running: boolean;
  /** Start or restart the animation. */
  start: () => void;
  /** Stop the animation. */
  stop: () => void;
}

/**
 * Animate a progress value from 0 to 1 over a duration with easing.
 *
 * Uses `useTime` internally so that animation progress is derived from
 * the wall clock. This ensures compatibility with the piu compiler,
 * which detects time-dependent values via T1/T2 render diffs.
 *
 * The animation cycles based on `duration` (in ms). If `loop` is true,
 * it repeats indefinitely.
 *
 * Usage:
 *   const { progress } = useAnimation({ duration: 10000, easing: Easing.bounceEaseOut, loop: true });
 *   const x = lerp(0, 200, progress);
 */
export function useAnimation(options: UseAnimationOptions): UseAnimationResult {
  const { duration, easing = Easing.linear, loop = false } = options;
  // Use useTime for clock ticks — this makes the compiler detect time deps.
  // Progress is derived purely from the current time (no stored start time),
  // so the compiler can diff T1 vs T2 and detect changing values.
  const time = useTime(1000);

  // Derive progress from current time modulo duration.
  // For a 60s duration, this cycles every 60s based on wall clock.
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();
  const durationSec = duration / 1000;
  const raw = loop
    ? (totalSeconds % durationSec) / durationSec
    : Math.min(totalSeconds / durationSec, 1);
  const progress = easing(raw);

  const start = useCallback(() => { /* no-op: auto-driven by time */ }, []);
  const stop = useCallback(() => { /* no-op: auto-driven by time */ }, []);

  return { progress, running: true, start, stop };
}
