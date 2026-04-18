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
  /** Loop the animation (default: false). Equivalent to playCount: Infinity. */
  loop?: boolean;
  /** Number of times to play (default: 1). Set to Infinity for endless looping. */
  playCount?: number;
  /** Reverse direction on odd cycles (ping-pong). */
  reverse?: boolean;
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
 * it repeats indefinitely. `playCount` controls how many cycles to run.
 * `reverse` makes odd-numbered cycles play backwards (ping-pong).
 *
 * Usage:
 *   const { progress } = useAnimation({ duration: 10000, easing: Easing.bounceEaseOut, loop: true });
 *   const x = lerp(0, 200, progress);
 */
export function useAnimation(options: UseAnimationOptions): UseAnimationResult {
  const {
    duration,
    easing = Easing.linear,
    loop = false,
    playCount,
    reverse = false,
  } = options;

  // Resolve effective play count: loop maps to Infinity, default is 1
  const effectivePlayCount = playCount ?? (loop ? Infinity : 1);

  // Use useTime for clock ticks — this makes the compiler detect time deps.
  // Progress is derived purely from the current time (no stored start time),
  // so the compiler can diff T1 vs T2 and detect changing values.
  const time = useTime(1000);

  // Derive progress from current time modulo duration.
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();
  const durationSec = duration / 1000;
  const elapsed = totalSeconds / durationSec;

  // Compute which cycle we're in
  const cycle = Math.floor(elapsed);
  const isFinished = effectivePlayCount !== Infinity && cycle >= effectivePlayCount;

  let raw: number;
  if (isFinished) {
    // Animation complete — clamp to final value
    raw = (reverse && effectivePlayCount % 2 === 0) ? 0 : 1;
  } else {
    // Fractional progress within current cycle
    raw = elapsed - cycle;

    // Reverse on odd cycles for ping-pong effect
    if (reverse && cycle % 2 === 1) {
      raw = 1 - raw;
    }
  }

  const progress = easing(raw);

  const start = useCallback(() => { /* no-op: auto-driven by time */ }, []);
  const stop = useCallback(() => { /* no-op: auto-driven by time */ }, []);

  return { progress, running: !isFinished, start, stop };
}
