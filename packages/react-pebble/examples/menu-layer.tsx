/**
 * examples/menu-layer.tsx — Menu-style list with sections and selection
 *
 * Demonstrates:
 *   - The MenuLayer composite component
 *   - `centerFocused` to vertically center the selected row
 *   - `padBottom` to allow the last item to scroll up from the bottom
 *   - `onSelect` callback for item selection
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, MenuLayer } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';
import type { MenuSection } from '../src/components/index.js';

const SECTIONS: MenuSection[] = [
  {
    title: 'Settings',
    items: [
      { title: 'Notifications', subtitle: 'Manage alerts' },
      { title: 'Display', subtitle: 'Brightness & theme' },
      { title: 'Bluetooth', subtitle: 'Connected' },
    ],
  },
  {
    title: 'About',
    items: [
      { title: 'Version', subtitle: 'v2.1.0' },
      { title: 'Model', subtitle: 'Pebble Time 2' },
    ],
  },
];

function MenuApp() {
  const [detail, setDetail] = useState('');

  useButton('back', () => setDetail(''));

  if (detail) {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Rect x={0} y={0} w={200} h={32} fill="white" />
        <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
          Selected
        </Text>
        <Text x={0} y={90} w={200} font="gothic24Bold" color="cyan" align="center">
          {detail}
        </Text>
        <Text x={0} y={180} w={200} font="gothic14" color="lightGray" align="center">
          BACK to return
        </Text>
      </Group>
    );
  }

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      {/* centerFocused keeps the highlighted row in the vertical center;
          padBottom adds extra space so the last item can scroll up. */}
      <MenuLayer
        x={0}
        y={0}
        w={200}
        h={228}
        sections={SECTIONS}
        centerFocused
        padBottom
        highlightColor="cyan"
        highlightTextColor="black"
        onSelect={(section, item) => {
          const selected = SECTIONS[section]?.items[item];
          if (selected) setDetail(selected.title);
        }}
      />
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<MenuApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('menu-layer example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
