import { React, type ReactNode } from './internal/preact-compat.js';
import { useState, useButton } from '../hooks/index.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface ScrollIndicatorColors {
  /** Color of the "more content above" indicator (default: 'white'). */
  up?: string;
  /** Color of the "more content below" indicator (default: 'white'). */
  down?: string;
}

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
  /** Indicator style: 'bar' (default) or 'arrow'. */
  indicatorStyle?: 'bar' | 'arrow';
  /** Indicator colors for up/down directions. */
  indicatorColors?: ScrollIndicatorColors;
  children?: ReactNode;
}

function BarIndicator({ x, w, h, color, direction }: {
  x: number; y: number; w: number; h: number; color: string; direction: 'up' | 'down';
}) {
  const iy = direction === 'up' ? 1 : h - 4;
  return React.createElement('pbl-rect', { x: x + w / 2 - 10, y: iy, w: 20, h: 3, fill: color });
}

function ArrowIndicator({ x, w, h, color, direction }: {
  x: number; y: number; w: number; h: number; color: string; direction: 'up' | 'down';
}) {
  const cx = x + Math.floor(w / 2);
  if (direction === 'up') {
    // Upward-pointing chevron: two short lines meeting at a point
    return React.createElement('pbl-group', { x: 0, y: 0 },
      React.createElement('pbl-line', { x1: cx - 6, y1: 6, x2: cx, y2: 2, stroke: color }),
      React.createElement('pbl-line', { x1: cx, y1: 2, x2: cx + 6, y2: 6, stroke: color }),
    );
  }
  // Downward-pointing chevron
  return React.createElement('pbl-group', { x: 0, y: 0 },
    React.createElement('pbl-line', { x1: cx - 6, y1: h - 6, x2: cx, y2: h - 2, stroke: color }),
    React.createElement('pbl-line', { x1: cx, y1: h - 2, x2: cx + 6, y2: h - 6, stroke: color }),
  );
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
  indicatorStyle = 'bar',
  indicatorColors,
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
  const upColor = indicatorColors?.up ?? 'white';
  const downColor = indicatorColors?.down ?? 'white';

  const Indicator = indicatorStyle === 'arrow' ? ArrowIndicator : BarIndicator;

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
      ? React.createElement(Indicator, { x: 0, y: 0, w: viewW, h: viewH, color: upColor, direction: 'up' as const })
      : null,
    showIndicators && canScrollDown
      ? React.createElement(Indicator, { x: 0, y: 0, w: viewW, h: viewH, color: downColor, direction: 'down' as const })
      : null,
  );
}
