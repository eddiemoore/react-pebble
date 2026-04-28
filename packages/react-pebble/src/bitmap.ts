/**
 * bitmap.ts — Create bitmaps from raw PNG data.
 *
 * Enables apps that receive images from the phone over Bluetooth
 * to display them using the Image component's `bitmap` prop.
 *
 * Pebble C equivalent: gbitmap_create_from_png_data()
 */

export interface PebbleBitmap {
  /** Bitmap width in pixels. */
  width: number;
  /** Bitmap height in pixels. */
  height: number;
  /** Raw RGBA pixel data (4 bytes per pixel). */
  pixels: Uint8Array;
  /** @internal Type tag for renderer identification. */
  _type: 'pebble-bitmap';
}

/**
 * Create a PebbleBitmap from raw PNG data (e.g. received via AppMessage).
 *
 * On Alloy: uses the Moddable PNG decoder if available.
 * In Node/mock mode: performs minimal PNG header parsing for dimensions
 * and stores the raw data for the renderer.
 *
 * The returned bitmap can be passed to `<Image bitmap={...} />`.
 */
export function createBitmapFromPNG(data: Uint8Array): PebbleBitmap {
  // Check for Moddable's commodetto PNG decoder
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (g.parsePNG && typeof g.parsePNG === 'function') {
      const result = (g.parsePNG as (d: Uint8Array) => { width: number; height: number; pixels: Uint8Array })(data);
      return { ...result, _type: 'pebble-bitmap' };
    }
  }

  // Minimal PNG header parsing for dimensions
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk starts at byte 8: length(4) + "IHDR"(4) + width(4) + height(4)
  if (data.length < 24 ||
      data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4E || data[3] !== 0x47) {
    throw new Error('createBitmapFromPNG: invalid PNG data');
  }

  const width = (data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!;
  const height = (data[20]! << 24) | (data[21]! << 16) | (data[22]! << 8) | data[23]!;

  // In mock mode, create a placeholder pixel buffer
  // (actual PNG decompression requires zlib which is heavy for the watch)
  const pixels = new Uint8Array(width * height * 4);
  // Fill with a checkerboard pattern to indicate "bitmap loaded but not decoded"
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const checker = ((x >> 2) + (y >> 2)) % 2;
      pixels[i] = checker ? 180 : 120;     // R
      pixels[i + 1] = checker ? 180 : 120; // G
      pixels[i + 2] = checker ? 180 : 120; // B
      pixels[i + 3] = 255;                 // A
    }
  }

  return { width, height, pixels, _type: 'pebble-bitmap' };
}
