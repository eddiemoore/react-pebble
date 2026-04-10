/**
 * examples/nested-cond.tsx — Independent conditional subtrees.
 *
 * Two booleans control visibility of header and footer independently.
 * UP toggles header, DOWN toggles footer.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function NestedCond() {
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);

  useButton('up', () => setShowHeader((v: boolean) => !v));
  useButton('down', () => setShowFooter((v: boolean) => !v));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {showHeader && (
        <Group>
          <Rect x={0} y={0} w={200} h={40} fill="blue" />
          <Text x={0} y={8} w={200} font="gothic24Bold" color="white" align="center">
            Header
          </Text>
        </Group>
      )}

      <Text x={0} y={100} w={200} font="gothic18" color="white" align="center">
        Main Content
      </Text>

      {showFooter && (
        <Group>
          <Rect x={0} y={188} w={200} h={40} fill="green" />
          <Text x={0} y={196} w={200} font="gothic18" color="white" align="center">
            Footer
          </Text>
        </Group>
      )}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<NestedCond />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('nested-cond (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
