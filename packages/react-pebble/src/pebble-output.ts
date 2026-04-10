/**
 * pebble-output.ts — Poco output layer for react-pebble on Pebble Alloy.
 *
 * Walks the virtual DOM tree (pebble-dom) and issues draw calls against
 * a `commodetto/Poco` renderer, which writes into the watch framebuffer.
 *
 * Key differences from a canvas-style API:
 *
 * - **No stateful color or font.** Every draw call takes the color (an int
 *   produced by `poco.makeColor(r, g, b)`) and font (a `new poco.Font(...)`
 *   object) as arguments. We maintain per-Poco caches so we resolve each
 *   named color / font exactly once.
 * - **No native line, circle, or stroked rectangle.** Poco only has
 *   `fillRectangle`, `drawText`, and bitmap draws. Outlines (stroke) are
 *   emulated as four thin fillRectangles. Axis-aligned lines use
 *   fillRectangles. Circles use a midpoint circle algorithm and diagonal
 *   lines use Bresenham's algorithm — both decomposed into fillRectangle
 *   calls so they work on mock and real Poco without requiring extensions.
 * - **Text alignment is manual.** `drawText(text, font, color, x, y)` only
 *   draws at a point. For center/right alignment we measure with
 *   `getTextWidth` and compute the origin ourselves.
 */

import type Poco from 'commodetto/Poco';
import type { PocoColor, PocoFont } from 'commodetto/Poco';
import type { DOMElement, NodeProps } from './pebble-dom.js';
import { getTextContent } from './pebble-dom.js';

// ---------------------------------------------------------------------------
// Named palette — mapped to RGB, then resolved to PocoColor via a cache.
// ---------------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const COLOR_PALETTE: Readonly<Record<string, RGB>> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 128, b: 0 },
  cyan: { r: 0, g: 255, b: 255 },
  magenta: { r: 255, g: 0, b: 255 },
  clear: { r: 0, g: 0, b: 0 },
  lightGray: { r: 192, g: 192, b: 192 },
  darkGray: { r: 64, g: 64, b: 64 },
};

// ---------------------------------------------------------------------------
// Named font shortcuts — mapped to (family, size) pairs.
//
// The family names must match fonts available in the Moddable manifest.
// These correspond to the Pebble system font families available in Alloy.
// The piu compiler uses the same families via FONT_TO_PIU in compile-to-piu.ts.
// ---------------------------------------------------------------------------

export interface FontSpec {
  family: string;
  size: number;
}

export const FONT_PALETTE: Readonly<Record<string, FontSpec>> = {
  // Gothic family — standard UI text
  gothic14:     { family: 'Gothic', size: 14 },
  gothic14Bold: { family: 'Gothic-Bold', size: 14 },
  gothic18:     { family: 'Gothic', size: 18 },
  gothic18Bold: { family: 'Gothic-Bold', size: 18 },
  gothic24:     { family: 'Gothic', size: 24 },
  gothic24Bold: { family: 'Gothic-Bold', size: 24 },
  gothic28:     { family: 'Gothic', size: 28 },
  gothic28Bold: { family: 'Gothic-Bold', size: 28 },

  // Bitham family — large display fonts
  bitham30Black:         { family: 'Bitham-Black', size: 30 },
  bitham42Bold:          { family: 'Bitham-Bold', size: 42 },
  bitham42Light:         { family: 'Bitham-Light', size: 42 },
  bitham34MediumNumbers: { family: 'Bitham', size: 34 },
  bitham42MediumNumbers: { family: 'Bitham', size: 42 },

  // Roboto family
  robotoCondensed21: { family: 'Roboto-Condensed', size: 21 },
  roboto21:          { family: 'Roboto', size: 21 },

  // Droid Serif
  droid28: { family: 'Droid-Serif', size: 28 },

  // LECO family — LED-style numeric fonts
  leco20: { family: 'LECO', size: 20 },
  leco26: { family: 'LECO', size: 26 },
  leco28: { family: 'LECO', size: 28 },
  leco32: { family: 'LECO', size: 32 },
  leco36: { family: 'LECO', size: 36 },
  leco38: { family: 'LECO', size: 38 },
  leco42: { family: 'LECO', size: 42 },
};

const DEFAULT_FONT_KEY = 'gothic18';

// ---------------------------------------------------------------------------
// Prop accessors — the DOM is loosely typed so we coerce here.
// ---------------------------------------------------------------------------

function num(p: NodeProps, key: string): number {
  const v = p[key];
  return typeof v === 'number' ? v : 0;
}

function str(p: NodeProps, key: string): string | undefined {
  const v = p[key];
  return typeof v === 'string' ? v : undefined;
}

// ---------------------------------------------------------------------------
// Renderer options
// ---------------------------------------------------------------------------

export interface RenderOptions {
  backgroundColor?: string;
  /**
   * Incremental update region. If provided, `poco.begin(x, y, w, h)` is used
   * to clip drawing to just that region. Otherwise the full frame is redrawn.
   */
  dirty?: { x: number; y: number; w: number; h: number };
}

// ---------------------------------------------------------------------------
// PocoRenderer — owns a Poco instance plus color/font caches
// ---------------------------------------------------------------------------

export class PocoRenderer {
  readonly poco: Poco;
  private readonly colorCache = new Map<string, PocoColor>();
  private readonly fontCache = new Map<string, PocoFont>();

  constructor(poco: Poco) {
    this.poco = poco;
  }

  /**
   * Render the full tree into a fresh frame.
   */
  render(rootNode: DOMElement, options: RenderOptions = {}): void {
    const { poco } = this;
    const dirty = options.dirty;

    if (dirty) {
      poco.begin(dirty.x, dirty.y, dirty.w, dirty.h);
    } else {
      poco.begin();
    }

    // Clear to background
    const bg = this.getColor(options.backgroundColor ?? 'black');
    poco.fillRectangle(bg, 0, 0, poco.width, poco.height);

    // Walk the tree
    this.renderChildren(rootNode, 0, 0);

    poco.end();
  }

  /** Resolve a color name (or pass-through int) to a PocoColor. */
  getColor(name: string | undefined): PocoColor {
    const key = name ?? 'black';
    const cached = this.colorCache.get(key);
    if (cached !== undefined) return cached;

    const rgb = COLOR_PALETTE[key] ?? COLOR_PALETTE.white!;
    const color = this.poco.makeColor(rgb.r, rgb.g, rgb.b);
    this.colorCache.set(key, color);
    return color;
  }

  /** Resolve a font name to a PocoFont (cached). */
  getFont(name: string | undefined): PocoFont {
    const key = name ?? DEFAULT_FONT_KEY;
    const cached = this.fontCache.get(key);
    if (cached !== undefined) return cached;

    const spec = FONT_PALETTE[key] ?? FONT_PALETTE[DEFAULT_FONT_KEY]!;
    // `poco.Font` is a constructor hanging off the Poco instance.
    const FontCtor = this.poco.Font;
    const font = new FontCtor(spec.family, spec.size);
    this.fontCache.set(key, font);
    return font;
  }

  // -------------------------------------------------------------------------
  // Private: node renderers
  // -------------------------------------------------------------------------

  private renderChildren(node: DOMElement, ox: number, oy: number): void {
    for (const child of node.children) {
      if (child.type === '#text') continue;
      this.renderNode(child, ox, oy);
    }
  }

  private renderNode(node: DOMElement, ox: number, oy: number): void {
    const p = node.props;
    if (p._hidden) return;

    const x = num(p, 'x') + ox;
    const y = num(p, 'y') + oy;

    switch (node.type) {
      case 'pbl-rect': {
        const w = num(p, 'w') || num(p, 'width');
        const h = num(p, 'h') || num(p, 'height');
        const fill = str(p, 'fill');
        const stroke = str(p, 'stroke');
        const br = num(p, 'borderRadius');

        if (br > 0) {
          // Rounded rectangle
          if (fill) {
            this.fillRoundRect(this.getColor(fill), x, y, w, h, br);
          }
          if (stroke) {
            const sw = num(p, 'strokeWidth') || 1;
            this.strokeRoundRect(this.getColor(stroke), x, y, w, h, br, sw);
          }
        } else {
          // Sharp rectangle
          if (fill) {
            this.poco.fillRectangle(this.getColor(fill), x, y, w, h);
          }
          if (stroke) {
            const sw = num(p, 'strokeWidth') || 1;
            const c = this.getColor(stroke);
            this.poco.fillRectangle(c, x, y, w, sw); // top
            this.poco.fillRectangle(c, x, y + h - sw, w, sw); // bottom
            this.poco.fillRectangle(c, x, y, sw, h); // left
            this.poco.fillRectangle(c, x + w - sw, y, sw, h); // right
          }
        }

        this.renderChildren(node, x, y);
        break;
      }

      case 'pbl-text': {
        const text = getTextContent(node);
        if (!text) break;

        const boxW = num(p, 'w') || num(p, 'width') || this.poco.width - x;
        const boxH = num(p, 'h') || num(p, 'height') || 0;
        const font = this.getFont(str(p, 'font'));
        const color = this.getColor(str(p, 'color') ?? 'white');
        const align = str(p, 'align') ?? 'left';
        const lineHeight = (font as unknown as { height: number }).height || 16;

        // Word-wrap text into lines that fit within boxW
        const lines = this.wrapText(text, font, boxW);

        let ty = y;
        for (const line of lines) {
          // Stop if we'd exceed the box height (when specified)
          if (boxH > 0 && ty - y + lineHeight > boxH) break;

          let tx = x;
          if (align === 'center' || align === 'right') {
            const tw = this.poco.getTextWidth(line, font);
            if (align === 'center') {
              tx = x + Math.floor((boxW - tw) / 2);
            } else {
              tx = x + boxW - tw;
            }
          }

          this.poco.drawText(line, font, color, tx, ty);
          ty += lineHeight;
        }
        break;
      }

      case 'pbl-line': {
        // Only axis-aligned lines are supported natively. Diagonals would
        // need the commodetto/outline extension — TODO.
        const x2 = num(p, 'x2') + ox;
        const y2 = num(p, 'y2') + oy;
        const c = this.getColor(str(p, 'color') ?? str(p, 'stroke') ?? 'white');
        const sw = num(p, 'strokeWidth') || 1;

        if (x === x2) {
          // Vertical
          const top = Math.min(y, y2);
          const h = Math.abs(y2 - y) || 1;
          this.poco.fillRectangle(c, x, top, sw, h);
        } else if (y === y2) {
          // Horizontal
          const left = Math.min(x, x2);
          const w = Math.abs(x2 - x) || 1;
          this.poco.fillRectangle(c, left, y, w, sw);
        }
        else {
          // Diagonal line via Bresenham's algorithm
          this.drawDiagonalLine(c, x, y, x2, y2, sw);
        }
        break;
      }

      case 'pbl-circle': {
        const r = num(p, 'r') || num(p, 'radius');
        if (r <= 0) break;
        const fill = str(p, 'fill');
        const stroke = str(p, 'stroke');
        const sw = num(p, 'strokeWidth') || 1;

        // Midpoint circle algorithm — works on any Poco (real or mock)
        // without requiring the commodetto/outline extension.
        if (fill) {
          const fc = this.getColor(fill);
          this.fillCircle(fc, x + r, y + r, r);
        }
        if (stroke) {
          const sc = this.getColor(stroke);
          this.strokeCircle(sc, x + r, y + r, r, sw);
        }
        break;
      }

      case 'pbl-image': {
        const bitmap = p.bitmap;
        if (bitmap) {
          this.poco.drawBitmap(bitmap as never, x, y);
        }
        break;
      }

      case 'pbl-group': {
        this.renderChildren(node, x, y);
        break;
      }

      case 'pbl-statusbar': {
        // Render a simple status bar: background + time text
        const sbBg = str(p, 'backgroundColor') ?? 'black';
        const sbColor = str(p, 'color') ?? 'white';
        const sbH = 16;
        const sbW = this.poco.width;

        this.poco.fillRectangle(this.getColor(sbBg), 0, 0, sbW, sbH);

        // Draw current time in the center
        const sbFont = this.getFont('gothic14');
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const tw = this.poco.getTextWidth(timeStr, sbFont);
        this.poco.drawText(timeStr, sbFont, this.getColor(sbColor), Math.floor((sbW - tw) / 2), 1);

        // Separator line
        const sep = str(p, 'separator') ?? 'none';
        if (sep === 'line') {
          this.poco.fillRectangle(this.getColor(sbColor), 0, sbH - 1, sbW, 1);
        } else if (sep === 'dotted') {
          for (let dx = 0; dx < sbW; dx += 3) {
            this.poco.fillRectangle(this.getColor(sbColor), dx, sbH - 1, 1, 1);
          }
        }
        break;
      }

      case 'pbl-actionbar': {
        // Render an action bar on the right edge: background column + icon placeholders
        const abBg = str(p, 'backgroundColor') ?? 'darkGray';
        const abW = 30;
        const abX = this.poco.width - abW;
        const abH = this.poco.height;

        this.poco.fillRectangle(this.getColor(abBg), abX, 0, abW, abH);

        // Draw dot placeholders for up/select/down icons
        const dotColor = this.getColor('white');
        const dotR = 3;
        const centerX = abX + Math.floor(abW / 2);
        // Up icon area (top third)
        this.poco.fillRectangle(dotColor, centerX - dotR, Math.floor(abH / 6) - dotR, dotR * 2, dotR * 2);
        // Select icon area (middle)
        this.poco.fillRectangle(dotColor, centerX - dotR, Math.floor(abH / 2) - dotR, dotR * 2, dotR * 2);
        // Down icon area (bottom third)
        this.poco.fillRectangle(dotColor, centerX - dotR, Math.floor(abH * 5 / 6) - dotR, dotR * 2, dotR * 2);
        break;
      }

      case 'pbl-root': {
        this.renderChildren(node, ox, oy);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Circle rendering — midpoint circle algorithm
  // -------------------------------------------------------------------------

  /** Fill a circle by drawing horizontal spans for each row. */
  private fillCircle(color: PocoColor, cx: number, cy: number, r: number): void {
    const { poco } = this;
    let x0 = r;
    let y0 = 0;
    let err = 1 - r;

    // Track the last drawn y to avoid duplicate spans
    let lastY1 = -1;
    let lastY2 = -1;

    while (x0 >= y0) {
      // Draw horizontal spans for each octant pair
      if (cy + y0 !== lastY1) {
        poco.fillRectangle(color, cx - x0, cy + y0, x0 * 2 + 1, 1);
        lastY1 = cy + y0;
      }
      if (cy - y0 !== lastY2 && y0 !== 0) {
        poco.fillRectangle(color, cx - x0, cy - y0, x0 * 2 + 1, 1);
        lastY2 = cy - y0;
      }
      if (cy + x0 !== lastY1) {
        poco.fillRectangle(color, cx - y0, cy + x0, y0 * 2 + 1, 1);
        lastY1 = cy + x0;
      }
      if (cy - x0 !== lastY2) {
        poco.fillRectangle(color, cx - y0, cy - x0, y0 * 2 + 1, 1);
        lastY2 = cy - x0;
      }

      y0++;
      if (err < 0) {
        err += 2 * y0 + 1;
      } else {
        x0--;
        err += 2 * (y0 - x0) + 1;
      }
    }
  }

  /** Stroke a circle outline by drawing small rects at each perimeter point. */
  private strokeCircle(color: PocoColor, cx: number, cy: number, r: number, sw: number): void {
    const { poco } = this;
    let x0 = r;
    let y0 = 0;
    let err = 1 - r;

    while (x0 >= y0) {
      // 8 octant points
      poco.fillRectangle(color, cx + x0, cy + y0, sw, sw);
      poco.fillRectangle(color, cx - x0, cy + y0, sw, sw);
      poco.fillRectangle(color, cx + x0, cy - y0, sw, sw);
      poco.fillRectangle(color, cx - x0, cy - y0, sw, sw);
      poco.fillRectangle(color, cx + y0, cy + x0, sw, sw);
      poco.fillRectangle(color, cx - y0, cy + x0, sw, sw);
      poco.fillRectangle(color, cx + y0, cy - x0, sw, sw);
      poco.fillRectangle(color, cx - y0, cy - x0, sw, sw);

      y0++;
      if (err < 0) {
        err += 2 * y0 + 1;
      } else {
        x0--;
        err += 2 * (y0 - x0) + 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Diagonal line rendering — Bresenham's line algorithm
  // -------------------------------------------------------------------------

  private drawDiagonalLine(
    color: PocoColor, x1: number, y1: number, x2: number, y2: number, sw: number,
  ): void {
    const { poco } = this;
    let dx = Math.abs(x2 - x1);
    let dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let cx = x1;
    let cy = y1;

    for (;;) {
      poco.fillRectangle(color, cx, cy, sw, sw);
      if (cx === x2 && cy === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rounded rectangle rendering
  // -------------------------------------------------------------------------

  /** Fill a rounded rectangle by combining rects and quarter-circle corners. */
  private fillRoundRect(
    color: PocoColor, x: number, y: number, w: number, h: number, r: number,
  ): void {
    const { poco } = this;
    const cr = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));

    // Center body
    poco.fillRectangle(color, x, y + cr, w, h - cr * 2);
    // Top strip (between corners)
    poco.fillRectangle(color, x + cr, y, w - cr * 2, cr);
    // Bottom strip (between corners)
    poco.fillRectangle(color, x + cr, y + h - cr, w - cr * 2, cr);

    // Four quarter-circle corners via midpoint algorithm
    this.fillQuarterCircles(color, x + cr, y + cr, x + w - cr - 1, y + h - cr - 1, cr);
  }

  /** Stroke a rounded rectangle outline. */
  private strokeRoundRect(
    color: PocoColor, x: number, y: number, w: number, h: number, r: number, sw: number,
  ): void {
    const { poco } = this;
    const cr = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));

    // Straight edges
    poco.fillRectangle(color, x + cr, y, w - cr * 2, sw);              // top
    poco.fillRectangle(color, x + cr, y + h - sw, w - cr * 2, sw);     // bottom
    poco.fillRectangle(color, x, y + cr, sw, h - cr * 2);              // left
    poco.fillRectangle(color, x + w - sw, y + cr, sw, h - cr * 2);     // right

    // Corner arcs
    this.strokeQuarterCircles(color, x + cr, y + cr, x + w - cr - 1, y + h - cr - 1, cr, sw);
  }

  /** Fill four quarter-circles at the corners of a rounded rect. */
  private fillQuarterCircles(
    color: PocoColor, cx1: number, cy1: number, cx2: number, cy2: number, r: number,
  ): void {
    const { poco } = this;
    let x0 = r;
    let y0 = 0;
    let err = 1 - r;

    while (x0 >= y0) {
      // Top-left corner
      poco.fillRectangle(color, cx1 - x0, cy1 - y0, x0, 1);
      poco.fillRectangle(color, cx1 - y0, cy1 - x0, y0, 1);
      // Top-right corner
      poco.fillRectangle(color, cx2 + 1, cy1 - y0, x0, 1);
      poco.fillRectangle(color, cx2 + 1, cy1 - x0, y0, 1);
      // Bottom-left corner
      poco.fillRectangle(color, cx1 - x0, cy2 + y0, x0, 1);
      poco.fillRectangle(color, cx1 - y0, cy2 + x0, y0, 1);
      // Bottom-right corner
      poco.fillRectangle(color, cx2 + 1, cy2 + y0, x0, 1);
      poco.fillRectangle(color, cx2 + 1, cy2 + x0, y0, 1);

      y0++;
      if (err < 0) {
        err += 2 * y0 + 1;
      } else {
        x0--;
        err += 2 * (y0 - x0) + 1;
      }
    }
  }

  /** Stroke four quarter-circle arcs at the corners of a rounded rect. */
  private strokeQuarterCircles(
    color: PocoColor, cx1: number, cy1: number, cx2: number, cy2: number, r: number, sw: number,
  ): void {
    const { poco } = this;
    let x0 = r;
    let y0 = 0;
    let err = 1 - r;

    while (x0 >= y0) {
      // Top-left
      poco.fillRectangle(color, cx1 - x0, cy1 - y0, sw, sw);
      poco.fillRectangle(color, cx1 - y0, cy1 - x0, sw, sw);
      // Top-right
      poco.fillRectangle(color, cx2 + x0, cy1 - y0, sw, sw);
      poco.fillRectangle(color, cx2 + y0, cy1 - x0, sw, sw);
      // Bottom-left
      poco.fillRectangle(color, cx1 - x0, cy2 + y0, sw, sw);
      poco.fillRectangle(color, cx1 - y0, cy2 + x0, sw, sw);
      // Bottom-right
      poco.fillRectangle(color, cx2 + x0, cy2 + y0, sw, sw);
      poco.fillRectangle(color, cx2 + y0, cy2 + x0, sw, sw);

      y0++;
      if (err < 0) {
        err += 2 * y0 + 1;
      } else {
        x0--;
        err += 2 * (y0 - x0) + 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Text wrapping
  // -------------------------------------------------------------------------

  /** Break text into lines that fit within maxWidth. */
  private wrapText(text: string, font: PocoFont, maxWidth: number): string[] {
    // If the full text fits, skip wrapping
    if (this.poco.getTextWidth(text, font) <= maxWidth) {
      return [text];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (this.poco.getTextWidth(testLine, font) <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        // If a single word exceeds maxWidth, it goes on its own line (truncated visually)
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }
}

// ---------------------------------------------------------------------------
// Compatibility shims — still useful for mock-mode tests that want to
// resolve a color name without constructing a Poco. These return *names*
// rather than native handles.
// ---------------------------------------------------------------------------

export function resolveColorName(color: string | undefined): string {
  if (!color) return 'black';
  return color in COLOR_PALETTE ? color : 'black';
}

export function resolveFontName(font: string | undefined): string {
  if (!font) return DEFAULT_FONT_KEY;
  return font in FONT_PALETTE ? font : DEFAULT_FONT_KEY;
}
