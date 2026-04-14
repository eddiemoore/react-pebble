/**
 * useAnimationSpawn — run multiple animations in parallel.
 */

import { Easing } from './internal/easing.js';
import type { UseAnimationOptions } from './useAnimation.js';
import { useTime } from './useTime.js';

export interface UseAnimationSpawnResult {
  /** Progress for each animation (0 to 1), eased. */
  progresses: number[];
  /** Whether all animations have completed one cycle. */
  allComplete: boolean;
}

/**
 * Run multiple animations simultaneously. Returns an array of progress
 * values, one per animation.
 *
 * Uses wall-clock time (via `useTime`) for compiler compatibility.
 */
export function useAnimationSpawn(animations: UseAnimationOptions[]): UseAnimationSpawnResult {
  const time = useTime(1000);
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();

  const progresses = animations.map((anim) => {
    const durationSec = anim.duration / 1000;
    const easing = anim.easing ?? Easing.linear;
    const raw = anim.loop
      ? (totalSeconds % durationSec) / durationSec
      : Math.min(totalSeconds / durationSec, 1);
    return easing(raw);
  });

  const maxDuration = Math.max(...animations.map((a) => a.duration));
  const allComplete = !animations.some((a) => a.loop) &&
    totalSeconds >= maxDuration / 1000;

  return { progresses, allComplete };
}
