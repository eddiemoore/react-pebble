/**
 * examples/layout-demo.tsx — Demonstrates Column and Row layout components.
 *
 * Demonstrates:
 *   - Column (vertical stacking with gap)
 *   - Row (horizontal stacking with gap)
 *   - Rounded rectangles
 *   - Diagonal lines
 *   - Circle (filled + stroked)
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Circle, Line, Row, Column } from '../src/index.js';

function LayoutDemo() {
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Layout Demo
      </Text>

      {/* Row of colored circles */}
      <Row x={20} y={28} gap={8}>
        <Circle x={0} y={0} r={16} fill="red" />
        <Circle x={0} y={0} r={16} fill="green" />
        <Circle x={0} y={0} r={16} fill="blue" />
        <Circle x={0} y={0} r={16} fill="yellow" />
      </Row>

      {/* Column of rounded cards */}
      <Column x={10} y={68} gap={6}>
        <Rect x={0} y={0} w={180} h={30} fill="darkGray" borderRadius={6} />
        <Group x={0} y={0} h={30}>
          <Text x={8} y={6} w={164} font="gothic18" color="white">
            First Card
          </Text>
        </Group>

        <Rect x={0} y={0} w={180} h={30} fill="darkGray" borderRadius={6} />
        <Group x={0} y={0} h={30}>
          <Text x={8} y={6} w={164} font="gothic18" color="cyan">
            Second Card
          </Text>
        </Group>

        <Rect x={0} y={0} w={180} h={30} fill="darkGray" borderRadius={6} />
        <Group x={0} y={0} h={30}>
          <Text x={8} y={6} w={164} font="gothic18" color="orange">
            Third Card
          </Text>
        </Group>
      </Column>

      {/* Diagonal line demo */}
      <Line x={10} y={200} x2={60} y2={220} color="magenta" strokeWidth={2} />
      <Line x={60} y={220} x2={110} y2={200} color="cyan" strokeWidth={2} />
      <Line x={110} y={200} x2={160} y2={220} color="yellow" strokeWidth={2} />

      {/* Stroked circle */}
      <Circle x={160} y={192} r={14} stroke="white" strokeWidth={2} />
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<LayoutDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('layout-demo example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
