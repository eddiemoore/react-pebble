/**
 * examples/one-click.tsx — One-click action app demo.
 *
 * Demonstrates:
 *   - useOneClickAction hook for quick-action pattern
 *   - WindowStack for navigation context
 *   - useButton for triggering the action
 *   - Shows "Done!" briefly then exits
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Group, Rect, WindowStack } from '../src/components/index.js';
import { useButton, useState, useOneClickAction } from '../src/hooks/index.js';

function OneClickApp() {
  const [done, setDone] = useState(false);
  const oneClick = useOneClickAction();

  useButton('select', () => {
    setDone(true);
    oneClick(() => {
      // Perform the action (e.g. toggle a setting, send a command)
    });
  });

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill={done ? 'darkGreen' : 'black'} />

      {/* Title bar */}
      <Rect x={0} y={0} w={200} h={32} fill="white" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        One-Click
      </Text>

      {/* Status */}
      <Text x={0} y={80} w={200} font="bitham30Black" color="white" align="center">
        {done ? 'Done!' : 'Ready'}
      </Text>

      {/* Instructions */}
      <Text x={0} y={170} w={200} font="gothic14" color="lightGray" align="center">
        {done ? 'Action performed' : 'Press SELECT to act'}
      </Text>
    </Group>
  );
}

function OneClickWrapper() {
  return <WindowStack initial={<OneClickApp />} />;
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<OneClickWrapper />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('one-click example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
