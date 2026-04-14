import { useRef } from 'preact/hooks';
import { React } from './internal/preact-compat.js';
import { useState } from '../hooks/index.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

/**
 * AnimatedImage — frame sequence animation or native animated resource.
 *
 * Two forms:
 *
 *   <AnimatedImage frames={[img0, img1, ...]} fps={10} loop />
 *      Cycles a JS array of bitmap frame references on a timer.
 *
 *   <AnimatedImage src="spinner.apng" loop />
 *   <AnimatedImage src="anim.pdcs"  loop />
 *      Emits native animated playback. APNG → `gbitmap_sequence_*` (C) /
 *      Piu texture sequence (Alloy). PDC-sequence → `gdraw_command_sequence_*`.
 *      The file extension (`.apng` or `.pdcs`) selects the emitter path.
 */
export type AnimatedImageProps = PositionProps & SizeProps & {
  /** Frames per second (default: 10) */
  fps?: number;
  /** Loop the animation (default: true) */
  loop?: boolean;
} & (
  | {
      /** Array of bitmap frame references. */
      frames: unknown[];
      src?: never;
    }
  | {
      /** Path to an `.apng` or `.pdcs` animated resource. */
      src: string;
      frames?: never;
    }
);

/**
 * Displays an animated sequence of bitmap frames or a native APNG/PDC-sequence
 * resource.
 */
export function AnimatedImage(props: AnimatedImageProps) {
  const fps = props.fps ?? 10;
  const loop = props.loop ?? true;
  const { fps: _f, loop: _l, ...rest } = props as AnimatedImageProps & {
    frames?: unknown[];
    src?: string;
  };
  const frames = (rest as { frames?: unknown[] }).frames;
  const src = (rest as { src?: string }).src;
  const posProps: Record<string, unknown> = {};
  for (const k of ['x', 'y', 'w', 'h', 'width', 'height']) {
    if (k in rest) posProps[k] = (rest as Record<string, unknown>)[k];
  }

  // Native animated resource path — the emitter picks the API based on the
  // file extension. We just tag the element so the analyzer sees it.
  if (typeof src === 'string') {
    const animFormat = src.toLowerCase().endsWith('.pdcs') ? 'pdcs' : 'apng';
    return React.createElement('pbl-image', {
      ...posProps,
      src,
      animated: animFormat,
      animLoop: loop,
      animFps: fps,
    });
  }

  // Fallback: cycle the frames[] array at the given FPS.
  const [frameIdx, setFrameIdx] = useState(0);
  const frameRef = useRef(frameIdx);
  frameRef.current = frameIdx;
  const frameList = frames ?? [];

  useState(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Timer) {
      const T = (globalThis as Record<string, unknown>).Timer as {
        repeat?: (callback: () => void, interval: number) => number;
      };
      T.repeat?.(() => {
        setFrameIdx((i) => {
          const next = i + 1;
          if (next >= frameList.length) return loop ? 0 : i;
          return next;
        });
      }, Math.round(1000 / fps));
    }
    return 0;
  });

  const currentFrame = frameList[frameIdx];
  return React.createElement('pbl-image', { ...posProps, bitmap: currentFrame });
}
