/**
 * getTextContentSize — measure text bounding box for a given font and max width.
 *
 * Uses the font palette metrics to compute an approximate bounding box.
 * On Alloy, this would use `graphics_text_layout_get_content_size`.
 * In mock mode, we estimate from font metrics.
 */

import { FONT_PALETTE, lookupFontSpec } from '../pebble-output.js';

export interface TextContentSize {
  width: number;
  height: number;
}

/**
 * Compute the bounding box for `text` rendered in `font` within `maxWidth`.
 *
 * This is a synchronous utility (no hook state) useful for layout calculations.
 * The result is an approximation based on font metrics — character widths are
 * estimated at ~0.6 of the font size.
 */
export function getTextContentSize(
  text: string,
  font: string,
  maxWidth: number,
): TextContentSize {
  const spec = lookupFontSpec(font) ?? FONT_PALETTE['gothic18']!;
  const charWidth = Math.ceil(spec.size * 0.6);
  const lineHeight = spec.size;

  if (!text) return { width: 0, height: 0 };

  // Split into words and wrap lines
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    const candidateWidth = candidate.length * charWidth;
    if (candidateWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);

  const width = Math.min(
    maxWidth,
    Math.max(...lines.map(l => l.length * charWidth)),
  );
  const height = lines.length * lineHeight;

  return { width, height };
}
