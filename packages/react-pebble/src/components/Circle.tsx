import { React } from './internal/preact-compat.js';
import type { ColorName, PositionProps } from './internal/shared-types.js';

export interface CircleProps extends PositionProps {
  r?: number;
  /** Alias for `r`. */
  radius?: number;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
}

export function Circle(props: CircleProps) {
  return React.createElement('pbl-circle', props);
}
