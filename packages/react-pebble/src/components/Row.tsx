import { React, type ReactNode } from './internal/preact-compat.js';
import { toArray } from './internal/to-array.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

import type { EdgeInsets } from './Column.js';

export type { EdgeInsets };

export interface RowProps extends PositionProps, SizeProps {
  /** Gap between children in pixels (default 0). */
  gap?: number;
  /** Padding inside the row. Number for uniform, or {top,right,bottom,left}. */
  padding?: EdgeInsets;
  children?: ReactNode;
}

function resolvePadding(p?: EdgeInsets) {
  if (p == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p };
  return { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 };
}

/**
 * Stacks children horizontally, auto-computing each child's `x` offset.
 * Children should specify `w` (or `width`) for correct stacking;
 * children without a width are given a default of 40px.
 */
export function Row({ x = 0, y = 0, gap = 0, padding, children, ...props }: RowProps) {
  const pad = resolvePadding(padding);
  let offsetX = pad.left;
  const mapped = toArray(children).map((child, i) => {
    if (!child || typeof child !== 'object') return child;
    const vnode = child as { type: unknown; props: Record<string, unknown> };
    if (!vnode.type || !vnode.props) return child;
    const childW = (vnode.props.w ?? vnode.props.width ?? 40) as number;
    const el = React.createElement(
      vnode.type as string,
      { ...(vnode.props as object), x: offsetX, y: pad.top, key: i },
    );
    offsetX += childW + gap;
    return el;
  });

  return React.createElement('pbl-group', { x, y, ...props }, ...(mapped as ReactNode[]));
}
