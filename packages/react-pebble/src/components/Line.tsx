import { React } from './internal/preact-compat.js';
import type { ColorName, PositionProps } from './internal/shared-types.js';

export interface LineProps extends PositionProps {
  x2?: number;
  y2?: number;
  color?: ColorName;
  strokeWidth?: number;
}

export function Line(props: LineProps) {
  return React.createElement('pbl-line', props);
}
