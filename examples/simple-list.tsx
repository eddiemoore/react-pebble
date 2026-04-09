/**
 * examples/simple-list.tsx — Minimal dynamic list with scrolling.
 *
 * Demonstrates .map() rendering: 5 items, 3 visible at a time,
 * UP/DOWN buttons scroll through the list.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const ITEMS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

function SimpleList() {
  const [index, setIndex] = useState(0);

  useButton('up', () => setIndex((i: number) => Math.max(0, i - 1)));
  useButton('down', () => setIndex((i: number) => Math.min(ITEMS.length - 3, i + 1)));

  const visible = ITEMS.slice(index, index + 3);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Items
      </Text>
      {visible.map((item, i) => (
        <Text key={item} x={10} y={40 + i * 50} w={180} font="gothic24" color="white">
          {item}
        </Text>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<SimpleList />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('simple-list (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
