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
  // Basic aliases (backwards compatible)
  black:     { r: 0, g: 0, b: 0 },
  white:     { r: 255, g: 255, b: 255 },
  red:       { r: 255, g: 0, b: 0 },
  green:     { r: 0, g: 255, b: 0 },
  blue:      { r: 0, g: 0, b: 255 },
  yellow:    { r: 255, g: 255, b: 0 },
  orange:    { r: 255, g: 128, b: 0 },
  cyan:      { r: 0, g: 255, b: 255 },
  magenta:   { r: 255, g: 0, b: 255 },
  clear:     { r: 0, g: 0, b: 0 },
  lightGray: { r: 192, g: 192, b: 192 },
  darkGray:  { r: 64, g: 64, b: 64 },

  // Full Pebble 64-color GColor palette (2-bit per channel: 0x00, 0x55, 0xAA, 0xFF)
  oxfordBlue:           { r: 0, g: 0, b: 85 },
  dukeBlue:             { r: 0, g: 0, b: 170 },
  darkBlue:             { r: 0, g: 0, b: 170 },
  darkGreen:            { r: 0, g: 85, b: 0 },
  midnightGreen:        { r: 0, g: 85, b: 85 },
  cobaltBlue:           { r: 0, g: 85, b: 170 },
  blueMoon:             { r: 0, g: 85, b: 255 },
  islamicGreen:         { r: 0, g: 170, b: 0 },
  jaegerGreen:          { r: 0, g: 170, b: 85 },
  tiffanyBlue:          { r: 0, g: 170, b: 170 },
  vividCerulean:        { r: 0, g: 170, b: 255 },
  springBud:            { r: 0, g: 255, b: 85 },
  mintGreen:            { r: 0, g: 255, b: 170 },
  celeste:              { r: 0, g: 255, b: 255 },
  bulgarianRose:        { r: 85, g: 0, b: 0 },
  imperialPurple:       { r: 85, g: 0, b: 85 },
  indigo:               { r: 85, g: 0, b: 170 },
  electricUltramarine:  { r: 85, g: 0, b: 255 },
  armyGreen:            { r: 85, g: 85, b: 0 },
  liberty:              { r: 85, g: 85, b: 170 },
  veryLightBlue:        { r: 85, g: 85, b: 255 },
  kellyGreen:           { r: 85, g: 170, b: 0 },
  mayGreen:             { r: 85, g: 170, b: 85 },
  cadetBlue:            { r: 85, g: 170, b: 170 },
  pictonBlue:           { r: 85, g: 170, b: 255 },
  brightGreen:          { r: 85, g: 255, b: 0 },
  screaminGreen:        { r: 85, g: 255, b: 85 },
  mediumAquamarine:     { r: 85, g: 255, b: 170 },
  electricBlue:         { r: 85, g: 255, b: 255 },
  darkCandyAppleRed:    { r: 170, g: 0, b: 0 },
  jazzberryJam:         { r: 170, g: 0, b: 85 },
  purple:               { r: 170, g: 0, b: 170 },
  vividViolet:          { r: 170, g: 0, b: 255 },
  windsorTan:           { r: 170, g: 85, b: 0 },
  roseVale:             { r: 170, g: 85, b: 85 },
  purpureus:            { r: 170, g: 85, b: 170 },
  lavenderIndigo:       { r: 170, g: 85, b: 255 },
  limerick:             { r: 170, g: 170, b: 0 },
  brass:                { r: 170, g: 170, b: 85 },
  babyBlueEyes:         { r: 170, g: 170, b: 255 },
  chromeYellow:         { r: 255, g: 170, b: 0 },
  rajah:                { r: 255, g: 170, b: 85 },
  melon:                { r: 255, g: 170, b: 170 },
  richBrilliantLavender: { r: 255, g: 170, b: 255 },
  icterine:             { r: 255, g: 255, b: 85 },
  pastelYellow:         { r: 255, g: 255, b: 170 },
  sunsetOrange:         { r: 255, g: 85, b: 0 },
  brilliantRose:        { r: 255, g: 85, b: 170 },
  shockingPink:         { r: 255, g: 0, b: 170 },
  fashionMagenta:       { r: 255, g: 0, b: 85 },
  followMeToTheOrange:  { r: 255, g: 85, b: 85 },
};

// ---------------------------------------------------------------------------
// Color utility functions
// ---------------------------------------------------------------------------

/** Pebble's valid 2-bit channel values */
const PEBBLE_CHANNEL_VALUES = [0x00, 0x55, 0xAA, 0xFF] as const;

function snapChannel(v: number): number {
  let best = 0;
  let bestDist = 256;
  for (const c of PEBBLE_CHANNEL_VALUES) {
    const d = Math.abs(v - c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

/**
 * Convert a hex color string to the nearest Pebble 64-color RGB value.
 * Accepts "#RRGGBB" or "#RGB" format.
 */
export function colorFromHex(hex: string): RGB {
  let r = 0, g = 0, b = 0;
  const h = hex.replace('#', '');
  if (h.length === 3) {
    r = parseInt(h[0]! + h[0], 16);
    g = parseInt(h[1]! + h[1], 16);
    b = parseInt(h[2]! + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  }
  return { r: snapChannel(r), g: snapChannel(g), b: snapChannel(b) };
}

/**
 * Compute the Euclidean distance between two colors.
 * Useful for finding the closest palette match.
 */
export function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Find the closest named Pebble color for a given RGB value.
 */
export function nearestColorName(color: RGB): string {
  let bestName = 'black';
  let bestDist = Infinity;
  for (const [name, rgb] of Object.entries(COLOR_PALETTE)) {
    if (name === 'clear') continue;
    const d = colorDistance(color, rgb);
    if (d < bestDist) { bestDist = d; bestName = name; }
  }
  return bestName;
}

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
// Custom font registration — allows apps to register additional fonts
// ---------------------------------------------------------------------------

const customFonts: Record<string, FontSpec> = {};

/**
 * Register a custom font for use with the `font` prop on Text components.
 * The family name must match a font available in the Moddable manifest.
 *
 * Usage:
 *   registerFont('myFont', { family: 'MyCustomFont', size: 24 });
 *   // Then use: <Text font="myFont">Hello</Text>
 */
export function registerFont(name: string, spec: FontSpec): void {
  customFonts[name] = spec;
}

/**
 * Look up a font spec by name, checking custom fonts then system fonts.
 */
export function lookupFontSpec(name: string): FontSpec | undefined {
  return customFonts[name] ?? FONT_PALETTE[name];
}

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
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly isRound: boolean;

  constructor(poco: Poco, options?: { screenWidth?: number; screenHeight?: number; isRound?: boolean }) {
    this.poco = poco;
    this.screenWidth = options?.screenWidth ?? poco.width ?? 200;
    this.screenHeight = options?.screenHeight ?? poco.height ?? 228;
    this.isRound = options?.isRound ?? false;
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

    const spec = lookupFontSpec(key) ?? FONT_PALETTE[DEFAULT_FONT_KEY]!;
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
        const brTL = num(p, 'borderRadiusTopLeft');
        const brTR = num(p, 'borderRadiusTopRight');
        const brBL = num(p, 'borderRadiusBottomLeft');
        const brBR = num(p, 'borderRadiusBottomRight');
        const hasPerCorner = brTL > 0 || brTR > 0 || brBL > 0 || brBR > 0;
        const textureSrc = str(p, 'texture');

        // Texture-based rect: draw the bitmap if available, otherwise fall back to fill
        if (textureSrc && p._textureData) {
          this.poco.drawBitmap(p._textureData as never, x, y);
        } else if (hasPerCorner) {
          // Per-corner rounded rectangle: draw each corner individually
          const tl = brTL || br || 0;
          const tr = brTR || br || 0;
          const bl = brBL || br || 0;
          const bRight = brBR || br || 0;
          if (fill) {
            const c = this.getColor(fill);
            this.fillPerCornerRoundRect(c, x, y, w, h, tl, tr, bl, bRight);
          }
          if (stroke) {
            const sw = num(p, 'strokeWidth') || 1;
            const c = this.getColor(stroke);
            // Fall back to simple stroke for per-corner (approximate)
            this.fillPerCornerRoundRect(c, x, y, w, h, tl, tr, bl, bRight);
            if (fill) {
              this.fillPerCornerRoundRect(this.getColor(fill), x + sw, y + sw, w - 2 * sw, h - 2 * sw,
                Math.max(0, tl - sw), Math.max(0, tr - sw), Math.max(0, bl - sw), Math.max(0, bRight - sw));
            }
          }
        } else if (br > 0) {
          // Rounded rectangle (uniform)
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
        const overflow = str(p, 'overflow') ?? 'wordWrap';
        const lineHeight = (font as unknown as { height: number }).height || 16;

        if (overflow === 'fill') {
          // Single line, no wrapping, no truncation — draw as-is
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
        } else if (overflow === 'trailingEllipsis') {
          // Single line, truncate with '...' if too wide
          let display = text;
          const fullWidth = this.poco.getTextWidth(text, font);
          if (fullWidth > boxW) {
            const ellipsis = '...';
            const ellipsisW = this.poco.getTextWidth(ellipsis, font);
            let truncated = '';
            for (let i = 0; i < text.length; i++) {
              const candidate = truncated + text[i];
              if (this.poco.getTextWidth(candidate, font) + ellipsisW > boxW) break;
              truncated = candidate;
            }
            display = truncated + ellipsis;
          }
          let tx = x;
          if (align === 'center' || align === 'right') {
            const tw = this.poco.getTextWidth(display, font);
            if (align === 'center') {
              tx = x + Math.floor((boxW - tw) / 2);
            } else {
              tx = x + boxW - tw;
            }
          }
          this.poco.drawText(display, font, color, tx, y);
        } else {
          // Default: wordWrap
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
          const rotation = num(p, 'rotation');
          const scale = num(p, 'scale');
          if (rotation || (scale && scale !== 1)) {
            // Use Poco's extended drawBitmap with rotation/scale if available.
            // The mock Poco records the intent; the real Poco handles transforms.
            const bmp = bitmap as never;
            const poco = this.poco as Poco & {
              drawBitmapWithTransform?: (
                bmp: never, x: number, y: number, rotation: number, scale: number,
              ) => void;
            };
            if (poco.drawBitmapWithTransform) {
              poco.drawBitmapWithTransform(bmp, x, y, rotation, scale || 1);
            } else {
              // Fallback: draw without transform
              this.poco.drawBitmap(bmp, x, y);
            }
          } else {
            this.poco.drawBitmap(bitmap as never, x, y);
          }
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

      case 'pbl-path': {
        const rawPoints = p.points as Array<[number, number]> | undefined;
        if (!rawPoints || rawPoints.length < 2) break;

        const fill = str(p, 'fill');
        const stroke = str(p, 'stroke');
        const sw = num(p, 'strokeWidth') || 1;
        const rotation = num(p, 'rotation');  // degrees
        const offsetArr = p.offset as [number, number] | undefined;
        const offX = offsetArr?.[0] ?? 0;
        const offY = offsetArr?.[1] ?? 0;

        // Compute centroid for rotation origin
        let cx = 0, cy = 0;
        for (const pt of rawPoints) { cx += pt[0]!; cy += pt[1]!; }
        cx /= rawPoints.length;
        cy /= rawPoints.length;

        // Apply rotation and offset, then translate to absolute position
        const rad = (rotation * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const pts: Array<[number, number]> = rawPoints.map(([px, py]) => {
          const dx = px - cx;
          const dy = py - cy;
          return [
            Math.round(x + offX + cx + dx * cosA - dy * sinA),
            Math.round(y + offY + cy + dx * sinA + dy * cosA),
          ];
        });

        if (fill) {
          this.fillPolygon(this.getColor(fill), pts);
        }
        if (stroke) {
          const c = this.getColor(stroke);
          const closed = p.closed !== false;
          const segCount = closed ? pts.length : pts.length - 1;
          for (let i = 0; i < segCount; i++) {
            const a = pts[i]!;
            const b = pts[(i + 1) % pts.length]!;
            this.drawDiagonalLine(c, a[0], a[1], b[0], b[1], sw);
          }
        }
        break;
      }

      case 'pbl-scrollable': {
        const w = num(p, 'w') || num(p, 'width');
        const h = num(p, 'h') || num(p, 'height');
        const scrollOffset = num(p, 'scrollOffset');

        // Set clip region to the scrollable viewport
        this.poco.clip(x, y, w, h);
        this.renderChildren(node, ox, -scrollOffset);
        // Restore clip
        this.poco.clip();
        break;
      }

      case 'pbl-arc': {
        const r = num(p, 'r') || 40;
        const innerR = num(p, 'innerR') || 0;
        const startAngle = num(p, 'startAngle') ?? 0;
        const endAngle = num(p, 'endAngle') ?? 360;

        // Center of the arc
        const cx = x + r;
        const cy = y + r;

        if (p.fill) {
          const fillColor = this.getColor(str(p, 'fill'));
          this.fillArc(fillColor, cx, cy, r, innerR, startAngle, endAngle);
        }
        if (p.stroke) {
          const strokeColor = this.getColor(str(p, 'stroke'));
          const sw = num(p, 'strokeWidth') || 1;
          // Stroke the outer edge
          this.strokeArc(strokeColor, cx, cy, r, startAngle, endAngle, sw);
          // Stroke the inner edge if it's a donut
          if (innerR > 0) {
            this.strokeArc(strokeColor, cx, cy, innerR, startAngle, endAngle, sw);
          }
        }
        break;
      }

      case 'pbl-textflow': {
        const w = num(p, 'w') || num(p, 'width') || 200;
        const h = num(p, 'h') || num(p, 'height') || 200;
        const font = this.getFont(str(p, 'font'));
        const color = this.getColor(str(p, 'color') ?? 'white');
        const align = str(p, 'align') || 'left';
        const flowAround = p.flowAroundDisplay !== false;
        const text = getTextContent(node);

        if (text) {
          this.renderFlowText(text, x, y, w, h, font, color, align, flowAround);
        }
        break;
      }

      case 'pbl-svg': {
        // SVG / PDC vector image. On real Poco, uses drawDCI with transforms.
        // In mock mode, render a placeholder rectangle with the resource name.
        const src = str(p, 'src') ?? '';
        const w = num(p, 'w') || num(p, 'width') || 40;
        const h = num(p, 'h') || num(p, 'height') || 40;
        const rotation = num(p, 'rotation');
        const scale = num(p, 'scale') || 1;

        const poco = this.poco as Poco & {
          drawDCI?: (pdc: unknown, x: number, y: number) => void;
        };

        if (poco.drawDCI && p._pdcData) {
          // Clone and transform the PDC data before drawing
          let pdc = p._pdcData as { clone?: () => unknown; rotate?: (a: number, px: number, py: number) => void; scale?: (f: number) => void };
          if ((rotation || scale !== 1) && pdc.clone) {
            pdc = pdc.clone() as typeof pdc;
            if (scale !== 1 && pdc.scale) pdc.scale(scale);
            if (rotation && pdc.rotate) pdc.rotate(rotation, w / 2, h / 2);
          }
          poco.drawDCI(pdc, x, y);
        } else {
          // Mock mode: draw a placeholder
          const placeholderColor = this.getColor(str(p, 'color') ?? 'lightGray');
          this.poco.fillRectangle(placeholderColor, x, y, w, h);
          if (src) {
            const label = src.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
            const font = this.getFont('gothic14');
            const textColor = this.getColor('black');
            this.poco.drawText(label, font, textColor, x + 2, y + 2);
          }
        }
        break;
      }

      case 'pbl-canvas': {
        // Custom drawing canvas (Piu Port). Calls the onDraw callback
        // with a simplified drawing context wrapping Poco methods.
        const canvasW = num(p, 'w') || num(p, 'width') || 100;
        const canvasH = num(p, 'h') || num(p, 'height') || 100;
        const onDraw = p.onDraw as ((ctx: Record<string, unknown>) => void) | undefined;

        if (onDraw) {
          // Save clip region
          this.poco.clip(x, y, canvasW, canvasH);

          const renderer = this;
          const ctx = {
            fillRect: (color: string, rx: number, ry: number, rw: number, rh: number) => {
              renderer.poco.fillRectangle(renderer.getColor(color), x + rx, y + ry, rw, rh);
            },
            drawText: (text: string, font: string, color: string, tx: number, ty: number) => {
              renderer.poco.drawText(text, renderer.getFont(font), renderer.getColor(color), x + tx, y + ty);
            },
            drawLine: (color: string, x1: number, y1: number, x2: number, y2: number, thickness?: number) => {
              const sw = thickness ?? 1;
              const c = renderer.getColor(color);
              if (y1 === y2) {
                renderer.poco.fillRectangle(c, x + Math.min(x1, x2), y + y1, Math.abs(x2 - x1) || 1, sw);
              } else if (x1 === x2) {
                renderer.poco.fillRectangle(c, x + x1, y + Math.min(y1, y2), sw, Math.abs(y2 - y1) || 1);
              } else {
                renderer.drawDiagonalLine(c, x + x1, y + y1, x + x2, y + y2, sw);
              }
            },
            drawCircle: (color: string, cx: number, cy: number, radius: number) => {
              renderer.fillCircle(renderer.getColor(color), x + cx, y + cy, radius);
            },
            drawRoundRect: (rx: number, ry: number, rw: number, rh: number, color: string, radius: number) => {
              renderer.fillRoundRect(renderer.getColor(color), x + rx, y + ry, rw, rh, radius);
            },
            getTextWidth: (text: string, font: string) => {
              return renderer.poco.getTextWidth(text, renderer.getFont(font));
            },
            width: canvasW,
            height: canvasH,
          };

          onDraw(ctx);

          // Restore clip region
          this.poco.clip();
        }
        break;
      }

      case 'pbl-root': {
        this.renderChildren(node, ox, oy);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Polygon fill — scanline algorithm
  // -------------------------------------------------------------------------

  private fillPolygon(color: PocoColor, pts: Array<[number, number]>): void {
    const { poco } = this;
    if (pts.length < 3) return;

    // Find bounding box
    let minY = pts[0]![1], maxY = pts[0]![1];
    for (const pt of pts) {
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }

    const n = pts.length;
    // For each scanline row
    for (let scanY = minY; scanY <= maxY; scanY++) {
      const intersections: number[] = [];

      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        const [ax, ay] = a;
        const [bx, by] = b;

        // Check if this edge crosses the scanline
        if ((ay <= scanY && by > scanY) || (by <= scanY && ay > scanY)) {
          // Compute x intersection
          const xInt = ax + ((scanY - ay) * (bx - ax)) / (by - ay);
          intersections.push(Math.round(xInt));
        }
      }

      // Sort intersections and fill spans between pairs
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const xStart = intersections[i]!;
        const xEnd = intersections[i + 1]!;
        if (xEnd > xStart) {
          poco.fillRectangle(color, xStart, scanY, xEnd - xStart, 1);
        }
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

  /** Fill a rounded rectangle with independent per-corner radii. */
  private fillPerCornerRoundRect(
    color: PocoColor, x: number, y: number, w: number, h: number,
    tl: number, tr: number, bl: number, br: number,
  ): void {
    const { poco } = this;
    const maxR = Math.min(Math.floor(w / 2), Math.floor(h / 2));
    const rtl = Math.min(tl, maxR);
    const rtr = Math.min(tr, maxR);
    const rbl = Math.min(bl, maxR);
    const rbr = Math.min(br, maxR);
    const leftR = Math.max(rtl, rbl);
    const rightR = Math.max(rtr, rbr);
    const topR = Math.max(rtl, rtr);
    const botR = Math.max(rbl, rbr);

    // Center body
    poco.fillRectangle(color, x, y + topR, w, h - topR - botR);
    // Top strip between corners
    poco.fillRectangle(color, x + rtl, y, w - rtl - rtr, topR);
    // Bottom strip between corners
    poco.fillRectangle(color, x + rbl, y + h - botR, w - rbl - rbr, botR);

    // Individual corner quarter-circles
    if (rtl > 0) this.fillSingleCorner(color, x + rtl, y + rtl, rtl, 'tl');
    if (rtr > 0) this.fillSingleCorner(color, x + w - rtr - 1, y + rtr, rtr, 'tr');
    if (rbl > 0) this.fillSingleCorner(color, x + rbl, y + h - rbl - 1, rbl, 'bl');
    if (rbr > 0) this.fillSingleCorner(color, x + w - rbr - 1, y + h - rbr - 1, rbr, 'br');
  }

  /** Fill a single quarter-circle corner. */
  private fillSingleCorner(
    color: PocoColor, cx: number, cy: number, r: number,
    corner: 'tl' | 'tr' | 'bl' | 'br',
  ): void {
    const { poco } = this;
    let x0 = r;
    let y0 = 0;
    let err = 1 - r;

    while (x0 >= y0) {
      switch (corner) {
        case 'tl':
          poco.fillRectangle(color, cx - x0, cy - y0, x0, 1);
          poco.fillRectangle(color, cx - y0, cy - x0, y0, 1);
          break;
        case 'tr':
          poco.fillRectangle(color, cx + 1, cy - y0, x0, 1);
          poco.fillRectangle(color, cx + 1, cy - x0, y0, 1);
          break;
        case 'bl':
          poco.fillRectangle(color, cx - x0, cy + y0, x0, 1);
          poco.fillRectangle(color, cx - y0, cy + x0, y0, 1);
          break;
        case 'br':
          poco.fillRectangle(color, cx + 1, cy + y0, x0, 1);
          poco.fillRectangle(color, cx + 1, cy + x0, y0, 1);
          break;
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

  // -------------------------------------------------------------------------
  // Arc rendering — scanline fill with angle bounds
  // -------------------------------------------------------------------------

  /**
   * Normalize an angle to 0-360 range.
   */
  private normalizeAngle(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Check if an angle is within the arc's angular range.
   * Handles wrap-around (e.g., 350° to 30°).
   */
  private angleInRange(angle: number, start: number, end: number): boolean {
    const a = this.normalizeAngle(angle);
    const s = this.normalizeAngle(start);
    const e = this.normalizeAngle(end);
    if (s <= e) return a >= s && a <= e;
    // Wraps around 0°
    return a >= s || a <= e;
  }

  /**
   * Fill an arc/donut sector using scanline rendering.
   * Angles: 0° = north (12 o'clock), clockwise.
   */
  private fillArc(
    color: PocoColor, cx: number, cy: number,
    outerR: number, innerR: number,
    startAngle: number, endAngle: number,
  ): void {
    const { poco } = this;
    const rSq = outerR * outerR;
    const irSq = innerR * innerR;

    for (let dy = -outerR; dy <= outerR; dy++) {
      let spanStart = -1;
      let inSpan = false;

      for (let dx = -outerR; dx <= outerR; dx++) {
        const distSq = dx * dx + dy * dy;
        // Must be within outer circle and outside inner circle
        if (distSq <= rSq && distSq >= irSq) {
          // Compute angle: atan2 with north=0°, clockwise
          const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          if (this.angleInRange(angle, startAngle, endAngle)) {
            if (!inSpan) {
              spanStart = cx + dx;
              inSpan = true;
            }
          } else if (inSpan) {
            poco.fillRectangle(color, spanStart, cy + dy, (cx + dx) - spanStart, 1);
            inSpan = false;
          }
        } else if (inSpan) {
          poco.fillRectangle(color, spanStart, cy + dy, (cx + dx) - spanStart, 1);
          inSpan = false;
        }
      }
      if (inSpan) {
        poco.fillRectangle(color, spanStart, cy + dy, (cx + outerR + 1) - spanStart, 1);
      }
    }
  }

  /**
   * Stroke an arc outline using pixel plotting along the circle at given radius.
   */
  private strokeArc(
    color: PocoColor, cx: number, cy: number,
    r: number, startAngle: number, endAngle: number, sw: number,
  ): void {
    const { poco } = this;
    // Plot points along the arc
    const circumference = 2 * Math.PI * r;
    const steps = Math.max(Math.round(circumference * 2), 60);
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    let totalRad = endRad - startRad;
    if (totalRad <= 0) totalRad += 2 * Math.PI;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rad = startRad + t * totalRad;
      const px = Math.round(cx + r * Math.cos(rad));
      const py = Math.round(cy + r * Math.sin(rad));
      poco.fillRectangle(color, px, py, sw, sw);
    }
  }

  // -------------------------------------------------------------------------
  // Text flow rendering — per-line width for round displays
  // -------------------------------------------------------------------------

  /**
   * Render text that flows around round display edges.
   * Each line's width is adjusted based on the chord length at that y position.
   */
  private renderFlowText(
    text: string, x: number, y: number, w: number, h: number,
    font: PocoFont, color: PocoColor, align: string, flowAround: boolean,
  ): void {
    const { poco } = this;
    const lineHeight = font.height || 18;
    const screenW = this.screenWidth;
    const screenH = this.screenHeight;
    const isRound = this.isRound;

    const words = text.split(' ');
    let curY = y;

    let wordIdx = 0;
    while (wordIdx < words.length && curY + lineHeight <= y + h) {
      // Compute available width at this y position
      let lineWidth = w;
      if (flowAround && isRound) {
        const r = Math.min(screenW, screenH) / 2;
        const centerY = screenH / 2;
        const dy = Math.abs(curY + lineHeight / 2 - centerY);
        if (dy < r) {
          const chordHalf = Math.sqrt(r * r - dy * dy);
          const chordWidth = chordHalf * 2;
          lineWidth = Math.min(w, chordWidth - 4); // 4px margin
        }
      }

      // Build line from words
      let currentLine = '';
      while (wordIdx < words.length) {
        const testLine = currentLine ? `${currentLine} ${words[wordIdx]}` : words[wordIdx]!;
        if (poco.getTextWidth(testLine, font) <= lineWidth) {
          currentLine = testLine;
          wordIdx++;
        } else {
          break;
        }
      }

      if (currentLine) {
        // Center the line horizontally for round displays
        let lineX = x;
        if (flowAround && isRound) {
          const textW = poco.getTextWidth(currentLine, font);
          lineX = Math.round((screenW - textW) / 2);
        } else if (align === 'center') {
          const textW = poco.getTextWidth(currentLine, font);
          lineX = x + Math.round((w - textW) / 2);
        } else if (align === 'right') {
          const textW = poco.getTextWidth(currentLine, font);
          lineX = x + w - textW;
        }
        poco.drawText(currentLine, font, color, lineX, curY);
      }

      curY += lineHeight;
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
  if (color in COLOR_PALETTE) return color;
  // Support hex strings — find nearest palette color
  if (color.startsWith('#')) {
    const rgb = colorFromHex(color);
    return nearestColorName(rgb);
  }
  return 'black';
}

export function resolveFontName(font: string | undefined): string {
  if (!font) return DEFAULT_FONT_KEY;
  if (font in FONT_PALETTE || font in customFonts) return font;
  return DEFAULT_FONT_KEY;
}

/**
 * Measure the rendered width of a text string in a given font.
 *
 * Requires an active PocoRenderer instance. This is a convenience wrapper
 * around `Poco.prototype.getTextWidth` — the same measurement used internally
 * for text alignment and word wrapping.
 *
 * @param renderer - A PocoRenderer instance (from `render()` or created manually).
 * @param text     - The string to measure.
 * @param font     - A font name from the font palette (e.g. 'gothic18', 'bitham42Bold').
 * @returns The width in pixels, or 0 if the font cannot be resolved.
 */
export function getTextWidth(renderer: PocoRenderer, text: string, font: string): number {
  const resolved = renderer.getFont(resolveFontName(font));
  if (!resolved) return 0;
  return renderer.poco.getTextWidth(text, resolved);
}
