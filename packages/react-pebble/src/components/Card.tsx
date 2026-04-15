import { React, type ReactNode } from './internal/preact-compat.js';
import type { FontName, PositionProps } from './internal/shared-types.js';

export interface CardProps extends PositionProps {
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  titleFont?: FontName;
  bodyFont?: FontName;
  w?: number;
}

export function Card({
  title,
  body,
  children,
  titleFont,
  bodyFont,
  x = 0,
  y = 0,
  w = 144,
  ...props
}: CardProps) {
  const titleH = 28;
  const bodyY = titleH + 4;

  return React.createElement(
    'pbl-group',
    { x, y, ...props },
    React.createElement('pbl-rect', { x: 0, y: 0, w, h: titleH, fill: 'white' }),
    React.createElement(
      'pbl-text',
      {
        x: 4,
        y: 2,
        w: w - 8,
        h: titleH,
        font: titleFont ?? 'gothic18Bold',
        color: 'black',
      },
      title,
    ),
    body
      ? React.createElement(
          'pbl-text',
          {
            x: 4,
            y: bodyY,
            w: w - 8,
            h: 120,
            font: bodyFont ?? 'gothic14',
            color: 'white',
          },
          body,
        )
      : null,
    children
      ? React.createElement('pbl-group', { x: 0, y: bodyY }, children)
      : null,
  );
}
