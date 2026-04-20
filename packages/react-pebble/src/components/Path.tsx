import { React } from './internal/preact-compat.js';
import type { ColorName, PositionProps } from './internal/shared-types.js';

export interface PathProps extends PositionProps {
  /** Array of [x, y] coordinate pairs forming the polygon. */
  points: Array<[number, number]>;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
  /** Rotation in degrees around the centroid. */
  rotation?: number;
  /** Translation offset [dx, dy] applied after rotation. */
  offset?: [number, number];
  /** Whether the path is closed (connects last point back to first). Default: true. */
  closed?: boolean;
}

export function Path(props: PathProps) {
  return React.createElement('pbl-path', props);
}
