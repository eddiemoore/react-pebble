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
 *   emulated as four thin fillRectangles. Axis-aligned lines likewise.
 *   Circles and diagonal lines would need the `commodetto/outline` extension
 *   — they're currently stubbed (TODO for a later pass).
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
// The family names here need to match fonts available in the Moddable
// manifest. The Alloy scaffold ships "Bitham-Black" as a default — we use
// it for every logical font for now. Revisit once we add custom font
// resources to the library manifest.
// ---------------------------------------------------------------------------

export interface FontSpec {
  family: string;
  size: number;
}

export const FONT_PALETTE: Readonly<Record<string, FontSpec>> = {
  gothic14: { family: 'Bitham-Black', size: 14 },
  gothic14Bold: { family: 'Bitham-Black', size: 14 },
  gothic18: { family: 'Bitham-Black', size: 18 },
  gothic18Bold: { family: 'Bitham-Black', size: 18 },
  gothic24: { family: 'Bitham-Black', size: 24 },
  gothic24Bold: { family: 'Bitham-Black', size: 24 },
  gothic28: { family: 'Bitham-Black', size: 28 },
  gothic28Bold: { family: 'Bitham-Black', size: 28 },
  bitham30Black: { family: 'Bitham-Black', size: 30 },
  bitham42Bold: { family: 'Bitham-Black', size: 42 },
  bitham42Light: { family: 'Bitham-Black', size: 42 },
  bitham34MediumNumbers: { family: 'Bitham-Black', size: 34 },
  bitham42MediumNumbers: { family: 'Bitham-Black', size: 42 },
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

        if (fill) {
          this.poco.fillRectangle(this.getColor(fill), x, y, w, h);
        }
        if (stroke) {
          // Emulate outline with four thin fill rects.
          const sw = num(p, 'strokeWidth') || 1;
          const c = this.getColor(stroke);
          this.poco.fillRectangle(c, x, y, w, sw); // top
          this.poco.fillRectangle(c, x, y + h - sw, w, sw); // bottom
          this.poco.fillRectangle(c, x, y, sw, h); // left
          this.poco.fillRectangle(c, x + w - sw, y, sw, h); // right
        }

        this.renderChildren(node, x, y);
        break;
      }

      case 'pbl-text': {
        const text = getTextContent(node);
        if (!text) break;

        const boxW = num(p, 'w') || num(p, 'width') || this.poco.width - x;
        const font = this.getFont(str(p, 'font'));
        const color = this.getColor(str(p, 'color') ?? 'white');
        const align = str(p, 'align') ?? 'left';

        let tx = x;
        if (align === 'center' || align === 'right') {
          const tw = this.poco.getTextWidth(text, font);
          if (align === 'center') {
            tx = x + Math.floor((boxW - tw) / 2);
          } else {
            tx = x + boxW - tw;
          }
        }

        this.poco.drawText(text, font, color, tx, y);
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
        // else: diagonal line — silently skipped for now
        break;
      }

      case 'pbl-circle': {
        // TODO: implement via commodetto/outline extension (blendOutline)
        // or a Bresenham-style approximation. Stubbed for now.
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

      case 'pbl-statusbar':
      case 'pbl-actionbar': {
        // Alloy has no built-in status/action bar UI; these are no-ops for now.
        // An app that wants a status bar should draw its own.
        break;
      }

      case 'pbl-root': {
        this.renderChildren(node, ox, oy);
        break;
      }
    }
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
