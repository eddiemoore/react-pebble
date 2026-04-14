import { React, type ReactNode } from './internal/preact-compat.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface GroupProps extends PositionProps, SizeProps {
  children?: ReactNode;
}

export function Group({ children, ...props }: GroupProps) {
  return React.createElement('pbl-group', props, children);
}
