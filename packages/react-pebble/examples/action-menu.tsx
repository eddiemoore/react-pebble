/**
 * examples/action-menu.tsx — Action menu with selection
 *
 * Demonstrates:
 *   - Action list with UP/DOWN navigation
 *   - SELECT to pick an action
 *   - BACK to return from result view
 *
 * Note: Uses primitives + useButton directly rather than the ActionMenu
 * composite, so the piu compiler can detect button bindings.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const ACTIONS = ['Reply', 'Dismiss', 'Mute', 'Open on Phone'];

function ActionMenuApp() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [result, setResult] = useState('');

  useButton('down', () => setSelectedIdx(i => Math.min(i + 1, ACTIONS.length - 1)));
  useButton('up', () => setSelectedIdx(i => Math.max(i - 1, 0)));
  useButton('select', () => setResult(ACTIONS[selectedIdx] ?? ''));
  useButton('back', () => { setResult(''); setSelectedIdx(0); });

  if (result) {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={70} w={200} font="gothic18" color="lightGray" align="center">
          Action performed:
        </Text>
        <Text x={0} y={95} w={200} font="gothic24Bold" color="cyan" align="center">
          {result}
        </Text>
        <Text x={0} y={180} w={200} font="gothic14" color="lightGray" align="center">
          BACK to return
        </Text>
      </Group>
    );
  }

  const rowH = 44;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Actions
      </Text>

      {ACTIONS.map((action, i) => (
        <Group key={i}>
          <Rect x={0} y={30 + i * rowH} w={200} h={rowH - 2} fill={i === selectedIdx ? 'white' : 'black'} />
          <Text x={12} y={30 + i * rowH + 10} w={176} font="gothic24Bold" color={i === selectedIdx ? 'black' : 'white'}>
            {action}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<ActionMenuApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('action-menu example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
