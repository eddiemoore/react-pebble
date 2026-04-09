/**
 * examples/rich-list.tsx — Multi-label list items with scrolling.
 *
 * Each item has a title (bold) and subtitle (gray). Tests the compiler's
 * ability to handle .map() callbacks that produce multiple Text elements
 * per item.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const ITEMS = [
  { title: 'Fix login bug', status: 'In Progress' },
  { title: 'Update docs', status: 'To Do' },
  { title: 'Deploy v2', status: 'Done' },
  { title: 'API rate limit', status: 'In Progress' },
  { title: 'Refactor auth', status: 'To Do' },
];

function RichList() {
  const [index, setIndex] = useState(0);

  useButton('up', () => setIndex((i: number) => i - 1));
  useButton('down', () => setIndex((i: number) => i + 1));

  const visible = ITEMS.slice(index, index + 3);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Issues
      </Text>
      {visible.map((item, i) => (
        <Group key={item.title} y={32 + i * 60}>
          <Text x={8} y={4} w={184} font="gothic18Bold" color="white">
            {item.title}
          </Text>
          <Text x={8} y={26} w={184} font="gothic14" color="lightGray">
            {item.status}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<RichList />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('rich-list (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
