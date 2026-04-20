import { React, type ReactNode } from './internal/preact-compat.js';
import { useState, useButton } from '../hooks/index.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface ScrollableProps extends PositionProps, SizeProps {
  /** Total content height (scrollable area). */
  contentHeight: number;
  /** Pixels to scroll per button press (default: 20). */
  scrollStep?: number;
  /** Show scroll indicators at top/bottom (default: true). */
  showIndicators?: boolean;
  /** When true, scroll by viewport height instead of scrollStep. */
  paging?: boolean;
  /** When true, scroll offset changes animate smoothly (~200ms lerp). */
  animated?: boolean;
  children?: ReactNode;
}

export function Scrollable({
  x = 0,
  y = 0,
  w,
  h,
  width,
  height,
  contentHeight,
  scrollStep = 20,
  showIndicators = true,
  paging = false,
  animated = false,
  children,
}: ScrollableProps) {
  const viewW = w ?? width ?? 200;
  const viewH = h ?? height ?? 228;
  const maxOffset = Math.max(0, contentHeight - viewH);
  const step = paging ? viewH : scrollStep;

  const [scrollOffset, setScrollOffset] = useState(0);

  useButton('down', () => {
    setScrollOffset((o) => Math.min(o + step, maxOffset));
  });
  useButton('up', () => {
    setScrollOffset((o) => Math.max(o - step, 0));
  });

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxOffset;

  return React.createElement(
    'pbl-group',
    { x, y },
    // Scrollable viewport with clip
    React.createElement(
      'pbl-scrollable',
      { x: 0, y: 0, w: viewW, h: viewH, scrollOffset, animated },
      children,
    ),
    // Scroll indicators
    showIndicators && canScrollUp
      ? React.createElement('pbl-rect', { x: viewW / 2 - 10, y: 1, w: 20, h: 3, fill: 'white' })
      : null,
    showIndicators && canScrollDown
      ? React.createElement('pbl-rect', { x: viewW / 2 - 10, y: viewH - 4, w: 20, h: 3, fill: 'white' })
      : null,
  );
}
