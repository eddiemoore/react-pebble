import { React, type ReactNode } from './internal/preact-compat.js';
import type { ColorName, PositionProps } from './internal/shared-types.js';

export interface BadgeProps extends PositionProps {
  r?: number;
  color?: ColorName;
  textColor?: ColorName;
  children?: ReactNode;
}

export function Badge({
  x = 0,
  y = 0,
  r = 12,
  color = 'red',
  textColor = 'white',
  children,
}: BadgeProps) {
  return React.createElement(
    'pbl-group',
    { x, y },
    React.createElement('pbl-circle', { x: 0, y: 0, r, fill: color }),
    React.createElement(
      'pbl-text',
      {
        x: 0,
        y: r - 8,
        w: r * 2,
        h: 16,
        font: 'gothic14Bold',
        color: textColor,
        align: 'center',
      },
      children,
    ),
  );
}
