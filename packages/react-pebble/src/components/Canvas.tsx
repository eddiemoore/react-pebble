import { React } from './internal/preact-compat.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface CanvasDrawContext {
  /** Fill a rectangle. */
  fillRect: (color: string, x: number, y: number, w: number, h: number) => void;
  /** Draw text at a position. */
  drawText: (text: string, font: string, color: string, x: number, y: number) => void;
  /** Draw a line between two points. */
  drawLine: (color: string, x1: number, y1: number, x2: number, y2: number, thickness?: number) => void;
  /** Draw a filled circle. */
  drawCircle: (color: string, cx: number, cy: number, radius: number) => void;
  /** Draw a rounded rectangle. */
  drawRoundRect: (x: number, y: number, w: number, h: number, color: string, radius: number) => void;
  /** Fill a radial (donut/ring) segment. Angles in degrees, 0° = north, clockwise. */
  fillRadial: (color: string, cx: number, cy: number, innerR: number, outerR: number, startAngle: number, endAngle: number) => void;
  /** Measure the width of text in a given font. */
  getTextWidth: (text: string, font: string) => number;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
}

export interface CanvasProps extends PositionProps, SizeProps {
  /** Drawing callback — called with a context that provides Poco drawing methods. */
  onDraw: (ctx: CanvasDrawContext) => void;
  /** Redraw interval in milliseconds (for animated canvases). 0 = draw once. */
  interval?: number;
}

/**
 * Custom drawing surface using Piu Port + Poco graphics.
 *
 * This is the escape hatch for anything not covered by built-in components.
 * The `onDraw` callback receives a drawing context with methods like
 * `fillRect`, `drawText`, `drawCircle`, etc.
 *
 * On Alloy: compiles to a Piu Port with a Behavior containing `onDraw`.
 * In mock mode: calls `onDraw` with a wrapper around the PocoRenderer.
 */
export function Canvas(props: CanvasProps) {
  return React.createElement('pbl-canvas', props);
}
