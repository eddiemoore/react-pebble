/**
 * geometry.ts — Rectangle and point utility functions.
 *
 * Mirrors the Pebble C SDK's GRect/GPoint helpers:
 *   grect_contains_point, grect_center_point, grect_crop,
 *   grect_inset, grect_align.
 */

export interface GPoint {
  x: number;
  y: number;
}

export interface GRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GAlignment =
  | 'topLeft' | 'top' | 'topRight'
  | 'left' | 'center' | 'right'
  | 'bottomLeft' | 'bottom' | 'bottomRight';

/**
 * Test whether a point is inside a rectangle.
 * Inclusive on top/left edges, exclusive on bottom/right (matching Pebble SDK).
 */
export function rectContainsPoint(rect: GRect, point: GPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.w &&
    point.y >= rect.y &&
    point.y < rect.y + rect.h
  );
}

/** Return the center point of a rectangle. */
export function rectCenter(rect: GRect): GPoint {
  return {
    x: rect.x + Math.floor(rect.w / 2),
    y: rect.y + Math.floor(rect.h / 2),
  };
}

/** Shrink a rectangle by `cropPixels` on all sides. */
export function rectCrop(rect: GRect, cropPixels: number): GRect {
  return {
    x: rect.x + cropPixels,
    y: rect.y + cropPixels,
    w: Math.max(0, rect.w - 2 * cropPixels),
    h: Math.max(0, rect.h - 2 * cropPixels),
  };
}

/** Inset a rectangle by per-edge amounts. */
export function rectInset(
  rect: GRect,
  insets: { top?: number; right?: number; bottom?: number; left?: number },
): GRect {
  const t = insets.top ?? 0;
  const r = insets.right ?? 0;
  const b = insets.bottom ?? 0;
  const l = insets.left ?? 0;
  return {
    x: rect.x + l,
    y: rect.y + t,
    w: Math.max(0, rect.w - l - r),
    h: Math.max(0, rect.h - t - b),
  };
}

/**
 * Position `inner` within `outer` according to `alignment`.
 * Returns a new rect with the same size as `inner` but repositioned.
 */
export function rectAlign(inner: GRect, outer: GRect, alignment: GAlignment): GRect {
  let x: number;
  let y: number;

  // Horizontal
  if (alignment.includes('Left') || alignment === 'left') {
    x = outer.x;
  } else if (alignment.includes('Right') || alignment === 'right') {
    x = outer.x + outer.w - inner.w;
  } else {
    x = outer.x + Math.floor((outer.w - inner.w) / 2);
  }

  // Vertical
  if (alignment.startsWith('top') || alignment === 'top') {
    y = outer.y;
  } else if (alignment.startsWith('bottom') || alignment === 'bottom') {
    y = outer.y + outer.h - inner.h;
  } else {
    y = outer.y + Math.floor((outer.h - inner.h) / 2);
  }

  return { x, y, w: inner.w, h: inner.h };
}
