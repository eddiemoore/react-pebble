import { React } from './internal/preact-compat.js';
import type { ColorName, PositionProps } from './internal/shared-types.js';

export interface ArcProps extends PositionProps {
  /** Outer radius */
  r: number;
  /** Inner radius (0 = pie slice, >0 = donut/ring) */
  innerR?: number;
  /** Start angle in degrees (0 = 12 o'clock / north, clockwise) */
  startAngle: number;
  /** End angle in degrees */
  endAngle: number;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
}

export function Arc(props: ArcProps) {
  return React.createElement('pbl-arc', props);
}
