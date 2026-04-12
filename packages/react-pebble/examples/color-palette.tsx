/**
 * examples/color-palette.tsx — Full 64-color palette display
 *
 * Demonstrates:
 *   - All named Pebble GColor values
 *   - Hex color support via colorFromHex
 *   - Scrollable grid of color swatches
 *   - useState for page navigation
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const COLORS = [
  // Row 1 — blacks to blues
  'black', 'oxfordBlue', 'dukeBlue', 'blue',
  // Row 2 — dark greens
  'darkGreen', 'midnightGreen', 'cobaltBlue', 'blueMoon',
  // Row 3 — greens
  'islamicGreen', 'jaegerGreen', 'tiffanyBlue', 'vividCerulean',
  // Row 4 — bright greens
  'green', 'springBud', 'mintGreen', 'cyan',
  // Row 5 — dark reds/purples
  'bulgarianRose', 'imperialPurple', 'indigo', 'electricUltramarine',
  // Row 6 — army/liberty
  'armyGreen', 'darkGray', 'liberty', 'veryLightBlue',
  // Row 7 — mid greens/blues
  'kellyGreen', 'mayGreen', 'cadetBlue', 'pictonBlue',
  // Row 8 — bright greens/blues
  'brightGreen', 'screaminGreen', 'mediumAquamarine', 'electricBlue',
  // Row 9 — reds
  'darkCandyAppleRed', 'jazzberryJam', 'purple', 'vividViolet',
  // Row 10 — oranges/pinks
  'windsorTan', 'roseVale', 'purpureus', 'lavenderIndigo',
  // Row 11 — yellows
  'limerick', 'brass', 'lightGray', 'babyBlueEyes',
  // Row 12 — oranges
  'orange', 'chromeYellow', 'rajah', 'melon',
  // Row 13 — reds/pinks
  'red', 'sunsetOrange', 'followMeToTheOrange', 'fashionMagenta',
  // Row 14 — pinks/magentas
  'magenta', 'shockingPink', 'brilliantRose', 'richBrilliantLavender',
  // Row 15 — yellows/whites
  'yellow', 'icterine', 'pastelYellow', 'white',
];

const COLS = 4;
const SW = 44; // swatch width
const SH = 28; // swatch height
const PAD = 4;
const ROWS_PER_PAGE = 6;

function ColorPaletteApp() {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(COLORS.length / (COLS * ROWS_PER_PAGE));

  useButton('down', () => setPage(p => Math.min(p + 1, totalPages - 1)));
  useButton('up', () => setPage(p => Math.max(p - 1, 0)));

  const startIdx = page * COLS * ROWS_PER_PAGE;
  const pageColors = COLORS.slice(startIdx, startIdx + COLS * ROWS_PER_PAGE);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={140} font="gothic18Bold" color="black">
        64 Colors
      </Text>
      <Text x={140} y={6} w={56} font="gothic14" color="darkGray" align="right">
        {page + 1}/{totalPages}
      </Text>

      {/* Color grid */}
      {pageColors.map((color, idx) => {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const sx = PAD + col * (SW + PAD);
        const sy = 32 + row * (SH + PAD);
        return (
          <Group>
            <Rect x={sx} y={sy} w={SW} h={SH} fill={color} />
          </Group>
        );
      })}

      <Text x={0} y={210} w={200} font="gothic14" color="lightGray" align="center">
        UP/DOWN to scroll
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<ColorPaletteApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('color-palette example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
