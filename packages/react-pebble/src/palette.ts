/**
 * palette.ts — Shared compile-time spec for Pebble's color and font catalog.
 *
 * Three callers (see docs/adr/0005):
 *  - scripts/analyze.ts (Analyzer): name → hex normalization for IR fields.
 *  - scripts/analyzer/mock/poco.ts (Mock Renderer): Poco color/font construction.
 *  - src/hooks/getTextContentSize.ts: text-metric layout baked into the IR.
 *
 * Not re-exported from the public entry — importers reach this module directly.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const COLOR_PALETTE: Readonly<Record<string, RGB>> = {
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

export function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

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

export function legibleOver(backgroundColor: string): 'white' | 'black' {
  let rgb: RGB;
  if (backgroundColor.startsWith('#')) {
    rgb = colorFromHex(backgroundColor);
  } else {
    rgb = COLOR_PALETTE[backgroundColor] ?? { r: 0, g: 0, b: 0 };
  }
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance < 128 ? 'white' : 'black';
}

export interface FontSpec {
  family: string;
  size: number;
}

export const FONT_PALETTE: Readonly<Record<string, FontSpec>> = {
  gothic14:     { family: 'Gothic', size: 14 },
  gothic14Bold: { family: 'Gothic-Bold', size: 14 },
  gothic18:     { family: 'Gothic', size: 18 },
  gothic18Bold: { family: 'Gothic-Bold', size: 18 },
  gothic24:     { family: 'Gothic', size: 24 },
  gothic24Bold: { family: 'Gothic-Bold', size: 24 },
  gothic28:     { family: 'Gothic', size: 28 },
  gothic28Bold: { family: 'Gothic-Bold', size: 28 },

  bitham30Black:         { family: 'Bitham-Black', size: 30 },
  bitham42Bold:          { family: 'Bitham-Bold', size: 42 },
  bitham42Light:         { family: 'Bitham-Light', size: 42 },
  bitham34MediumNumbers: { family: 'Bitham', size: 34 },
  bitham42MediumNumbers: { family: 'Bitham', size: 42 },

  robotoCondensed21: { family: 'Roboto-Condensed', size: 21 },
  roboto21:          { family: 'Roboto', size: 21 },

  droid28: { family: 'Droid-Serif', size: 28 },

  leco20: { family: 'LECO', size: 20 },
  leco26: { family: 'LECO', size: 26 },
  leco28: { family: 'LECO', size: 28 },
  leco32: { family: 'LECO', size: 32 },
  leco36: { family: 'LECO', size: 36 },
  leco38: { family: 'LECO', size: 38 },
  leco42: { family: 'LECO', size: 42 },
};

export const DEFAULT_FONT_KEY = 'gothic18';

const customFonts: Record<string, FontSpec> = {};

export function registerFont(name: string, spec: FontSpec): void {
  customFonts[name] = spec;
}

export function lookupFontSpec(name: string): FontSpec | undefined {
  return customFonts[name] ?? FONT_PALETTE[name];
}

export function resolveColorName(color: string | undefined): string {
  if (!color) return 'black';
  if (color in COLOR_PALETTE) return color;
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
