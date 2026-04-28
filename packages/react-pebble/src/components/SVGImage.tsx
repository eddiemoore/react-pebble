import { React } from './internal/preact-compat.js';
import type {
  ColorName,
  PositionProps,
  SizeProps,
} from './internal/shared-types.js';

export interface SVGImageProps extends PositionProps, SizeProps {
  /** PDC/SVG resource path (resolved at compile time). */
  src: string;
  /** Rotation in radians. */
  rotation?: number;
  /** Uniform scale factor (1 = original size). */
  scale?: number;
  /** Horizontal scale factor. */
  scaleX?: number;
  /** Vertical scale factor. */
  scaleY?: number;
  /** Horizontal translation offset. */
  translateX?: number;
  /** Vertical translation offset. */
  translateY?: number;
  /** Tint color for monochrome PDC images. */
  color?: ColorName;
  /** Override all fill colors in the PDC commands at runtime. */
  fillOverride?: ColorName;
  /** Override all stroke colors in the PDC commands at runtime. */
  strokeOverride?: ColorName;
  /** Hide the SVG image (render nothing). */
  hidden?: boolean;
}

/**
 * Renders a vector image (Pebble Draw Command / SVG) with optional transforms.
 *
 * On Alloy: emits as Piu SVGImage with rotation, scale, and translation.
 * In mock mode: renders a placeholder rectangle with the source label.
 */
export function SVGImage(props: SVGImageProps) {
  return React.createElement('pbl-svg', props);
}
