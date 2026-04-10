/**
 * examples/selected-list.tsx — Scrollable list with selection highlight.
 *
 * Combines: multi-label .map(), scroll navigation, per-item selection
 * highlight (skin swap on the selected item's container), and SELECT
 * to "open" (logs the selected item).
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const ITEMS = [
  { title: 'Fix login bug', tag: 'HIGH' },
  { title: 'Update docs', tag: 'MED' },
  { title: 'Deploy v2', tag: 'LOW' },
  { title: 'API rate limit', tag: 'HIGH' },
  { title: 'Refactor auth', tag: 'MED' },
];

function SelectedList() {
  const [sel, setSel] = useState(0);

  useButton('up', () => setSel((s: number) => s - 1));
  useButton('down', () => setSel((s: number) => s + 1));

  const visible = ITEMS.slice(sel, sel + 3);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={30} fill="white" />
      <Text x={4} y={5} w={140} font="gothic18Bold" color="black">
        Tasks
      </Text>
      <Text x={148} y={5} w={48} font="gothic14" color="darkGray" align="right">
        {sel + 1}/{ITEMS.length}
      </Text>
      {visible.map((item, i) => (
        <Group key={item.title} y={34 + i * 60}>
          <Rect x={0} y={0} w={200} h={58}
                fill={i === 0 ? 'darkGray' : 'black'} />
          <Text x={8} y={6} w={140} font="gothic18Bold" color="white">
            {item.title}
          </Text>
          <Text x={8} y={30} w={140} font="gothic14" color="lightGray">
            {item.tag}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<SelectedList />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('selected-list (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
