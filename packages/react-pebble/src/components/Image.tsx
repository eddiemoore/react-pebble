import { React } from './internal/preact-compat.js';
import type {
  CompositeOp,
  PositionProps,
  SizeProps,
} from './internal/shared-types.js';

export interface ImageProps extends PositionProps, SizeProps {
  /** Image file path (resolved at compile time). */
  src?: string;
  /** Raw bitmap object (runtime use only). */
  bitmap?: unknown;
  /** Rotation in radians. */
  rotation?: number;
  /** Scale factor (1 = original size). */
  scale?: number;
  /** Bitmap compositing mode for blending. */
  compositeOp?: CompositeOp;
  /** X pivot point for rotation (default: center of image). */
  pivotX?: number;
  /** Y pivot point for rotation (default: center of image). */
  pivotY?: number;
}

export function Image(props: ImageProps) {
  return React.createElement('pbl-image', props);
}
