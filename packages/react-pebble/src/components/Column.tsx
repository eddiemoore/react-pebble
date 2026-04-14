import { React, type ReactNode } from './internal/preact-compat.js';
import { toArray } from './internal/to-array.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface ColumnProps extends PositionProps, SizeProps {
  /** Gap between children in pixels (default 0). */
  gap?: number;
  children?: ReactNode;
}

/**
 * Stacks children vertically, auto-computing each child's `y` offset.
 * Children should specify `h` (or `height`) for correct stacking;
 * children without a height are given a default of 20px.
 */
export function Column({ x = 0, y = 0, gap = 0, children, ...props }: ColumnProps) {
  let offsetY = 0;
  const mapped = toArray(children).map((child, i) => {
    if (!child || typeof child !== 'object') return child;
    const vnode = child as { type: unknown; props: Record<string, unknown> };
    if (!vnode.type || !vnode.props) return child;
    const childH = (vnode.props.h ?? vnode.props.height ?? 20) as number;
    const el = React.createElement(
      vnode.type as string,
      { ...(vnode.props as object), y: offsetY, key: i },
    );
    offsetY += childH + gap;
    return el;
  });

  return React.createElement('pbl-group', { x, y, ...props }, ...(mapped as ReactNode[]));
}
