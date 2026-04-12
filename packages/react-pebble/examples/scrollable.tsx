/**
 * examples/scrollable.tsx — Scrollable content demo
 *
 * Demonstrates:
 *   - Scrolling through content taller than the screen
 *   - useButton for UP/DOWN scroll navigation
 *   - .map() list rendering with scroll offset
 *
 * Note: Uses manual scroll offset + primitives rather than the Scrollable
 * composite, so the piu compiler can detect button bindings.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const ITEMS = [
  'Introduction',
  'Getting Started',
  'Installation',
  'Configuration',
  'Components',
  'Hooks',
  'Animation',
  'Sensors',
  'Networking',
  'Storage',
  'Deployment',
  'Troubleshooting',
];

const ROW_H = 32;
const HEADER_H = 28;
const VIEW_H = 228 - HEADER_H;
const VISIBLE = Math.floor(VIEW_H / ROW_H);

function ScrollApp() {
  const [topIdx, setTopIdx] = useState(0);

  useButton('down', () => setTopIdx(i => Math.min(i + 1, ITEMS.length - VISIBLE)));
  useButton('up', () => setTopIdx(i => Math.max(i - 1, 0)));

  const visible = ITEMS.slice(topIdx, topIdx + VISIBLE);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={HEADER_H} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Docs ({topIdx + 1}-{Math.min(topIdx + VISIBLE, ITEMS.length)}/{ITEMS.length})
      </Text>

      {visible.map((item, i) => (
        <Group key={i}>
          <Rect x={0} y={HEADER_H + i * ROW_H} w={200} h={ROW_H - 2} fill={i % 2 === 0 ? 'darkGray' : 'black'} />
          <Text x={10} y={HEADER_H + i * ROW_H + 6} w={180} font="gothic18" color="white">
            {`${topIdx + i + 1}. ${item}`}
          </Text>
        </Group>
      ))}

      {/* Scroll indicators */}
      {topIdx > 0 ? <Rect x={90} y={HEADER_H + 1} w={20} h={3} fill="cyan" /> : null}
      {topIdx + VISIBLE < ITEMS.length ? <Rect x={90} y={225} w={20} h={3} fill="cyan" /> : null}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<ScrollApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('scrollable example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
