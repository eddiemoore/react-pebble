import { React, type ReactNode } from './internal/preact-compat.js';
import type { ButtonHandlerProps, ColorName } from './internal/shared-types.js';

export interface WindowProps extends ButtonHandlerProps {
  backgroundColor?: ColorName;
  fullscreen?: boolean;
  children?: ReactNode;
}

export function Window({ children, ...props }: WindowProps) {
  return React.createElement('pbl-group', props, children);
}
