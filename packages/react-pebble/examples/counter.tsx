/**
 * examples/counter.js — Simple counter app demonstrating react-pebble
 *
 * Shows:
 * - Component composition
 * - useState for state management
 * - useButton for hardware button input
 * - Text rendering with fonts
 * - Rect for backgrounds
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function Counter() {
  const [count, setCount] = useState(0);

  useButton('up', () => setCount(c => c + 1));
  useButton('down', () => setCount(c => c - 1));
  useButton('select', () => setCount(0));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title bar */}
      <Rect x={0} y={0} w={200} h={32} fill="white" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        Counter
      </Text>

      {/* Count display */}
      <Text x={0} y={70} w={200} font="bitham42Bold" color="white" align="center">
        {count.toString()}
      </Text>

      {/* Instructions */}
      <Text x={0} y={170} w={200} font="gothic14" color="lightGray" align="center">
        UP/DOWN to count
      </Text>
      <Text x={0} y={190} w={200} font="gothic14" color="lightGray" align="center">
        SELECT to reset
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<Counter />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('react-pebble counter example (mock mode)');
    console.log('Platform:', app.platform);
    const log = app.drawLog;
    console.log('Draw calls:', log.length);
  }

  return app;
}

export default main;
