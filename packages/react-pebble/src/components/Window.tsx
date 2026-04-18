import { React, type ReactNode } from './internal/preact-compat.js';
import type { ButtonHandlerProps, ColorName } from './internal/shared-types.js';
import { useScreen } from '../hooks/useScreen.js';

export interface WindowProps extends ButtonHandlerProps {
  backgroundColor?: ColorName;
  fullscreen?: boolean;
  children?: ReactNode;
}

export function Window({ backgroundColor, children, ...props }: WindowProps) {
  const { width, height } = useScreen();

  return React.createElement(
    'pbl-group',
    props,
    // Render a full-screen background rect when backgroundColor is set
    backgroundColor
      ? React.createElement('pbl-rect', {
          x: 0,
          y: 0,
          w: width,
          h: height,
          fill: backgroundColor,
        })
      : null,
    children,
  );
}
