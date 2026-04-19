/**
 * examples/scrollable.tsx — Scrollable content demo
 *
 * Demonstrates:
 *   - The Scrollable composite component
 *   - `paging` prop for page-at-a-time scrolling
 *   - .map() list rendering inside a scrollable viewport
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Scrollable } from '../src/components/index.js';
import { useScreen, getScreen } from '../src/hooks/index.js';

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
// Module-level uses the sync getScreen() since it runs before any component renders.
const VIEW_H = getScreen().height - HEADER_H;
const CONTENT_H = ITEMS.length * ROW_H;

function ScrollApp() {
  const { width, height } = useScreen();

  return (
    <Group>
      <Rect x={0} y={0} w={width} h={height} fill="black" />

      <Rect x={0} y={0} w={width} h={HEADER_H} fill="white" />
      <Text x={4} y={4} w={width - 8} font="gothic18Bold" color="black">
        Docs (paging mode)
      </Text>

      {/* paging — scrolls by one full viewport height per button press */}
      <Scrollable x={0} y={HEADER_H} w={width} h={VIEW_H} contentHeight={CONTENT_H} paging>
        {ITEMS.map((item, i) => (
          <Group key={i}>
            <Rect x={0} y={i * ROW_H} w={width} h={ROW_H - 2} fill={i % 2 === 0 ? 'darkGray' : 'black'} />
            <Text x={10} y={i * ROW_H + 6} w={width - 20} font="gothic18" color="white">
              {`${i + 1}. ${item}`}
            </Text>
          </Group>
        ))}
      </Scrollable>
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
