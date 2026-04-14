import { React, type ReactNode } from './internal/preact-compat.js';
import type {
  Alignment,
  ColorName,
  FontName,
  PositionProps,
  SizeProps,
} from './internal/shared-types.js';

export interface TextProps extends PositionProps, SizeProps {
  font?: FontName;
  color?: ColorName;
  align?: Alignment;
  children?: ReactNode;
}

export function Text({ children, ...props }: TextProps) {
  return React.createElement('pbl-text', props, children);
}
