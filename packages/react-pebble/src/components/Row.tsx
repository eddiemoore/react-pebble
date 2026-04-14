import { React, type ReactNode } from './internal/preact-compat.js';
import { toArray } from './internal/to-array.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface RowProps extends PositionProps, SizeProps {
  /** Gap between children in pixels (default 0). */
  gap?: number;
  children?: ReactNode;
}

/**
 * Stacks children horizontally, auto-computing each child's `x` offset.
 * Children should specify `w` (or `width`) for correct stacking;
 * children without a width are given a default of 40px.
 */
export function Row({ x = 0, y = 0, gap = 0, children, ...props }: RowProps) {
  let offsetX = 0;
  const mapped = toArray(children).map((child, i) => {
    if (!child || typeof child !== 'object') return child;
    const vnode = child as { type: unknown; props: Record<string, unknown> };
    if (!vnode.type || !vnode.props) return child;
    const childW = (vnode.props.w ?? vnode.props.width ?? 40) as number;
    const el = React.createElement(
      vnode.type as string,
      { ...(vnode.props as object), x: offsetX, key: i },
    );
    offsetX += childW + gap;
    return el;
  });

  return React.createElement('pbl-group', { x, y, ...props }, ...(mapped as ReactNode[]));
}
