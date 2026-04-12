/**
 * examples/menu-layer.tsx — Menu-style list with sections and selection
 *
 * Demonstrates:
 *   - Sectioned list layout with headers
 *   - Selection highlighting
 *   - useButton for UP/DOWN/SELECT navigation
 *   - Conditional view switching
 *
 * Note: Uses primitives directly (Rect/Text/Group) rather than the
 * MenuLayer composite, so the piu compiler can detect button bindings.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

interface MenuItem { title: string; subtitle?: string }
interface MenuSection { title: string; items: MenuItem[] }

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

// Flatten items for linear navigation
const ALL_ITEMS = SECTIONS.flatMap(s => s.items);

function MenuApp() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detail, setDetail] = useState('');

  useButton('down', () => setSelectedIdx(i => Math.min(i + 1, ALL_ITEMS.length - 1)));
  useButton('up', () => setSelectedIdx(i => Math.max(i - 1, 0)));
  useButton('select', () => setDetail(ALL_ITEMS[selectedIdx]?.title ?? ''));
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

  // Build the menu rows
  const rowH = 40;
  const headerH = 26;
  let y = 0;
  let itemIdx = 0;

  const rows: Array<{ kind: 'header' | 'item'; y: number; title: string; subtitle?: string; isSelected: boolean }> = [];

  for (const section of SECTIONS) {
    rows.push({ kind: 'header', y, title: section.title, isSelected: false });
    y += headerH;
    for (const item of section.items) {
      rows.push({ kind: 'item', y, title: item.title, subtitle: item.subtitle, isSelected: itemIdx === selectedIdx });
      y += rowH;
      itemIdx++;
    }
  }

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      {rows.map((row, i) =>
        row.kind === 'header' ? (
          <Group key={`h${i}`}>
            <Rect x={0} y={row.y} w={200} h={headerH} fill="darkGray" />
            <Text x={4} y={row.y + 4} w={192} font="gothic14Bold" color="white">
              {row.title}
            </Text>
          </Group>
        ) : (
          <Group key={`i${i}`}>
            <Rect x={0} y={row.y} w={200} h={rowH} fill={row.isSelected ? 'cyan' : 'black'} />
            <Text x={8} y={row.y + 2} w={184} font="gothic18Bold" color={row.isSelected ? 'black' : 'white'}>
              {row.title}
            </Text>
            {row.subtitle ? (
              <Text x={8} y={row.y + 22} w={184} font="gothic14" color={row.isSelected ? 'black' : 'lightGray'}>
                {row.subtitle}
              </Text>
            ) : null}
          </Group>
        )
      )}
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
