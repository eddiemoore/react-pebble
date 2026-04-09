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
import { Text, Rect, Group, StatusBar } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function Counter() {
  const [count, setCount] = useState(0);

  useButton('up', () => setCount(c => c + 1));
  useButton('down', () => setCount(c => c - 1));
  useButton('select', () => setCount(0));

  return (
    <Group>
      <StatusBar />

      {/* Title bar */}
      <Rect x={0} y={16} w={144} h={28} fill="white" />
      <Text x={4} y={18} w={136} h={24}
            font="gothic18Bold" color="black">
        Counter
      </Text>

      {/* Count display */}
      <Text x={0} y={55} w={144} h={60}
            font="bitham42Bold" color="white" align="center">
        {count.toString()}
      </Text>

      {/* Instructions */}
      <Text x={4} y={130} w={136} h={20}
            font="gothic14" color="lightGray" align="center">
        UP/DOWN to count
      </Text>
      <Text x={4} y={148} w={136} h={20}
            font="gothic14" color="lightGray" align="center">
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
