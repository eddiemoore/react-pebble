/**
 * useAnimationSequence — chain multiple animations in sequence.
 */

import type { EasingFn } from './internal/easing.js';
import { useTime } from './useTime.js';

export interface AnimationSequenceStep {
  duration: number;
  easing?: EasingFn;
}

export interface UseAnimationSequenceResult {
  /** Overall progress (0 to 1). */
  progress: number;
  /** Index of the currently active step. */
  stepIndex: number;
  /** Progress within the current step (0 to 1). */
  stepProgress: number;
}

/**
 * Run multiple animations in sequence. Returns overall progress and
 * which step is currently active.
 *
 * Uses wall-clock time (via `useTime`) for compiler compatibility.
 */
export function useAnimationSequence(steps: AnimationSequenceStep[]): UseAnimationSequenceResult {
  const time = useTime(1000);
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();
  const totalDurationSec = totalDuration / 1000;

  const elapsed = (totalSeconds % totalDurationSec) * 1000;

  let accumulated = 0;
  let stepIndex = 0;
  let stepProgress = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (elapsed < accumulated + step.duration) {
      stepIndex = i;
      const raw = (elapsed - accumulated) / step.duration;
      stepProgress = step.easing ? step.easing(raw) : raw;
      break;
    }
    accumulated += step.duration;
    if (i === steps.length - 1) {
      stepIndex = i;
      stepProgress = 1;
    }
  }

  const overallRaw = elapsed / totalDuration;
  const progress = Math.min(overallRaw, 1);

  return { progress, stepIndex, stepProgress };
}
