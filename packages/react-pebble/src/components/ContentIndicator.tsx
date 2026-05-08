/**
 * ContentIndicator — standalone scroll/content direction indicators.
 *
 * Mirrors the Pebble SDK's ContentIndicator API, which can be used
 * independently of ScrollLayer.
 */

import { React } from './internal/preact-compat.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface ContentIndicatorColors {
  /** Color of the "more content above" indicator (default: 'white'). */
  up?: string;
  /** Color of the "more content below" indicator (default: 'white'). */
  down?: string;
}

export interface ContentIndicatorProps extends PositionProps, SizeProps {
  /** Show the upward ("more content above") indicator. */
  showUp?: boolean;
  /** Show the downward ("more content below") indicator. */
  showDown?: boolean;
  /** Indicator style: 'bar' (default) or 'arrow'. */
  style?: 'bar' | 'arrow';
  /** Indicator colors for each direction. */
  colors?: ContentIndicatorColors;
}

/** @internal Bar-style indicator (thin rectangle). */
export function BarIndicator({ x, w, h, color, direction }: {
  x: number; y: number; w: number; h: number; color: string; direction: 'up' | 'down';
}) {
  const iy = direction === 'up' ? 1 : h - 4;
  return React.createElement('pbl-rect', { x: x + w / 2 - 10, y: iy, w: 20, h: 3, fill: color });
}

/** @internal Arrow/chevron-style indicator. */
export function ArrowIndicator({ x, w, h, color, direction }: {
  x: number; y: number; w: number; h: number; color: string; direction: 'up' | 'down';
}) {
  const cx = x + Math.floor(w / 2);
  if (direction === 'up') {
    return React.createElement('pbl-group', { x: 0, y: 0 },
      React.createElement('pbl-line', { x1: cx - 6, y1: 6, x2: cx, y2: 2, stroke: color }),
      React.createElement('pbl-line', { x1: cx, y1: 2, x2: cx + 6, y2: 6, stroke: color }),
    );
  }
  return React.createElement('pbl-group', { x: 0, y: 0 },
    React.createElement('pbl-line', { x1: cx - 6, y1: h - 6, x2: cx, y2: h - 2, stroke: color }),
    React.createElement('pbl-line', { x1: cx, y1: h - 2, x2: cx + 6, y2: h - 6, stroke: color }),
  );
}

/**
 * Standalone content direction indicators.
 *
 * Use this when you need to show directional cues without wrapping content
 * in a `<Scrollable>`. For example, to indicate that a custom list has more
 * items above or below the visible area.
 */
export function ContentIndicator({
  x = 0,
  y = 0,
  w,
  h,
  width,
  height,
  showUp = false,
  showDown = false,
  style = 'bar',
  colors,
}: ContentIndicatorProps) {
  const vw = w ?? width ?? 200;
  const vh = h ?? height ?? 228;
  const upColor = colors?.up ?? 'white';
  const downColor = colors?.down ?? 'white';
  const Indicator = style === 'arrow' ? ArrowIndicator : BarIndicator;

  return React.createElement(
    'pbl-group',
    { x, y },
    showUp
      ? React.createElement(Indicator, { x: 0, y: 0, w: vw, h: vh, color: upColor, direction: 'up' as const })
      : null,
    showDown
      ? React.createElement(Indicator, { x: 0, y: 0, w: vw, h: vh, color: downColor, direction: 'down' as const })
      : null,
  );
}
