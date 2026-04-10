/**
 * examples/multiview.tsx — String enum state test.
 *
 * Three views controlled by a string state: 'home', 'settings', 'about'.
 * Tests multi-branch conditional rendering beyond boolean true/false.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

type View = 'home' | 'settings' | 'about';

function MultiView() {
  const [view, setView] = useState<View>('home');

  useButton('up', () => setView('settings'));
  useButton('down', () => setView('about'));
  useButton('select', () => setView('home'));

  if (view === 'settings') {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="blue" />
        <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
          Settings
        </Text>
        <Text x={10} y={100} w={180} font="gothic18" color="white">
          Brightness: 80%
        </Text>
        <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
          SELECT for home
        </Text>
      </Group>
    );
  }

  if (view === 'about') {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="darkGray" />
        <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
          About
        </Text>
        <Text x={10} y={100} w={180} font="gothic18" color="white">
          react-pebble v0.1
        </Text>
        <Text x={10} y={130} w={180} font="gothic14" color="lightGray">
          Compiled to piu
        </Text>
        <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
          SELECT for home
        </Text>
      </Group>
    );
  }

  // Default: home
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
        Home
      </Text>
      <Text x={0} y={100} w={200} font="gothic18" color="lightGray" align="center">
        UP=Settings DOWN=About
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<MultiView />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('multiview example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
