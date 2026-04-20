import { React, type ReactNode } from './internal/preact-compat.js';
import type {
  Alignment,
  ColorName,
  FontName,
  PositionProps,
  SizeProps,
} from './internal/shared-types.js';

export interface TextFlowProps extends PositionProps, SizeProps {
  font?: FontName;
  color?: ColorName;
  align?: Alignment;
  /** Enable flow around round display edges (default: true) */
  flowAroundDisplay?: boolean;
  /** Enable page-at-a-time scrolling on round displays. */
  paging?: boolean;
  children?: ReactNode;
}

export function TextFlow({ children, ...props }: TextFlowProps) {
  return React.createElement('pbl-textflow', { flowAroundDisplay: true, ...props }, children);
}
