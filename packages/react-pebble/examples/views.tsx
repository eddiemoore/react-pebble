/**
 * examples/views.tsx — Structural conditional rendering test.
 *
 * Two completely different views toggled by a boolean state.
 * The "detail" view has more elements than the "list" view,
 * testing the compiler's ability to detect and handle structural
 * tree shape changes.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function Views() {
  const [detail, setDetail] = useState(false);

  useButton('select', () => setDetail((v: boolean) => !v));

  if (detail) {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="blue" />
        <Text x={0} y={20} w={200} font="gothic18Bold" color="white" align="center">
          Detail View
        </Text>
        <Text x={10} y={60} w={180} font="gothic18" color="white">
          Name: Widget A
        </Text>
        <Text x={10} y={90} w={180} font="gothic18" color="white">
          Status: Active
        </Text>
        <Text x={10} y={120} w={180} font="gothic14" color="lightGray">
          Created: 2026-01-15
        </Text>
        <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
          SELECT to go back
        </Text>
      </Group>
    );
  }

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={20} w={200} font="gothic18Bold" color="white" align="center">
        List View
      </Text>
      <Text x={10} y={60} w={180} font="gothic18" color="white">
        Item 1
      </Text>
      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        SELECT for detail
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<Views />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('views example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
