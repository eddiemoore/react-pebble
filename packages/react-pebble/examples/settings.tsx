/**
 * examples/settings.tsx — Settings app with button-driven state.
 *
 * Demonstrates:
 *   - useState with button navigation
 *   - Rounded rectangles for UI cards
 *   - ActionBar component
 *   - Clamped increment/decrement and modular cycling
 *
 * Note: Uses useState (not useLocalStorage) so the piu compiler can
 * track setter→slot mappings for button handler emission.
 * useLocalStorage works at Preact runtime but not in compiled piu mode.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, ActionBar } from '../src/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function Settings() {
  const [themeIdx, setThemeIdx] = useState(0);
  const [fontSize, setFontSize] = useState(18);

  const themes = ['dark', 'light', 'blue'];
  const bgs    = ['black', 'white', 'blue'];
  const fgs    = ['white', 'black', 'white'];
  const accents = ['cyan', 'blue', 'yellow'];

  const idx = Math.abs(themeIdx) % 3;
  const theme = themes[idx] ?? 'dark';
  const bg = bgs[idx] ?? 'black';
  const fg = fgs[idx] ?? 'white';
  const accent = accents[idx] ?? 'cyan';

  useButton('up', () => {
    setFontSize((s) => Math.min(s + 2, 28));
  });
  useButton('down', () => {
    setFontSize((s) => Math.max(s - 2, 14));
  });
  useButton('select', () => {
    setThemeIdx((i) => (i + 1) % 3);
  });

  const fontKey = fontSize <= 14 ? 'gothic14' : fontSize <= 18 ? 'gothic18' : fontSize <= 24 ? 'gothic24' : 'gothic28';

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill={bg} />

      {/* Title */}
      <Text x={0} y={8} w={170} font="gothic24Bold" color={fg} align="center">
        Settings
      </Text>

      {/* Theme card */}
      <Rect x={10} y={44} w={160} h={50} fill="darkGray" borderRadius={8} />
      <Text x={18} y={48} w={144} font="gothic14" color="lightGray">
        Theme (SELECT to cycle)
      </Text>
      <Text x={18} y={66} w={144} font="gothic24Bold" color={accent}>
        {theme}
      </Text>

      {/* Font size card */}
      <Rect x={10} y={102} w={160} h={50} fill="darkGray" borderRadius={8} />
      <Text x={18} y={106} w={144} font="gothic14" color="lightGray">
        Font Size (UP/DOWN)
      </Text>
      <Text x={18} y={124} w={144} font="gothic24Bold" color={accent}>
        {fontSize}px
      </Text>

      {/* Preview card */}
      <Rect x={10} y={160} w={160} h={50} fill="darkGray" borderRadius={8} />
      <Text x={18} y={164} w={144} font="gothic14" color="lightGray">
        Preview
      </Text>
      <Text x={18} y={182} w={144} font={fontKey} color={fg}>
        Hello Pebble!
      </Text>

      {/* Action bar on right edge */}
      <ActionBar backgroundColor="darkGray" />
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<Settings />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('settings example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
