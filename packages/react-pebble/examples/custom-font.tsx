/**
 * examples/custom-font.tsx — Custom TTF fonts in Text components.
 *
 * Declare the font resource via the Vite plugin:
 *
 *   pebblePiu({
 *     entry: 'examples/custom-font.tsx',
 *     resources: [
 *       { type: 'font', name: 'ROBOTO_24', file: 'examples/assets/fonts/roboto-regular.ttf',
 *         characterRegex: '[A-Za-z0-9 :]' },
 *     ],
 *   });
 *
 * Reference the font by its resource name in `font="ROBOTO_24"`. On the C
 * target the emitter loads it with `fonts_load_custom_font(resource_get_handle(
 * RESOURCE_ID_ROBOTO_24))` at window_load and unloads at window_unload.
 * On Alloy (Moddable), the Moddable manifest must expose a font family
 * whose name matches the resource name so `"18px ROBOTO_24"` resolves.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';

function CustomFontDemo() {
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={20} w={200} font="gothic14" color="AAAAAA" align="center">
        System Gothic 14
      </Text>
      <Text x={0} y={60} w={200} font="ROBOTO_24" color="FFAA55" align="center">
        ROBOTO_24
      </Text>
      <Text x={0} y={100} w={200} font="ROBOTO_24" color="white" align="center">
        HELLO WORLD
      </Text>
      <Text x={0} y={160} w={200} font="gothic18Bold" color="AAAAAA" align="center">
        System Gothic 18 Bold
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<CustomFontDemo />, { poco: PocoCtor });
}

export default main;
