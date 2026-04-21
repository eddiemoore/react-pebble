/**
 * examples/layout-advanced.tsx — Advanced layout features.
 *
 * Demonstrates:
 *   - Column/Row with padding prop
 *   - Group with zIndex child ordering
 *   - Scrollable with arrow indicators and custom colors
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Column, Row, Scrollable } from '../src/index.js';

function LayoutAdvancedApp() {
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Column with padding */}
      <Column x={5} y={5} padding={8} gap={4}>
        <Text w={180} h={18} font="gothic14Bold" color="white">
          Padded Column
        </Text>
        <Rect w={164} h={20} fill="darkGray" />
        <Rect w={164} h={20} fill="darkGray" />
      </Column>

      {/* Row with padding */}
      <Row x={5} y={85} padding={{ top: 4, left: 8, right: 8 }} gap={4}>
        <Rect w={40} h={30} fill="blue" />
        <Rect w={40} h={30} fill="green" />
        <Rect w={40} h={30} fill="red" />
      </Row>

      {/* Scrollable with arrow-style indicators and custom colors */}
      <Scrollable
        x={5} y={125}
        w={190} h={95}
        contentHeight={300}
        indicatorStyle="arrow"
        indicatorColors={{ up: 'cyan', down: 'cyan' }}
      >
        <Rect x={0} y={0} w={190} h={40} fill="darkGray" />
        <Text x={5} y={10} w={180} font="gothic18" color="white">
          Scroll me (arrows)
        </Text>
        <Rect x={0} y={50} w={190} h={40} fill="darkGray" />
        <Text x={5} y={60} w={180} font="gothic18" color="white">
          More content...
        </Text>
        <Rect x={0} y={100} w={190} h={40} fill="darkGray" />
        <Rect x={0} y={150} w={190} h={40} fill="darkGray" />
        <Rect x={0} y={200} w={190} h={40} fill="darkGray" />
        <Rect x={0} y={250} w={190} h={40} fill="darkGray" />
      </Scrollable>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<LayoutAdvancedApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('layout-advanced example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
