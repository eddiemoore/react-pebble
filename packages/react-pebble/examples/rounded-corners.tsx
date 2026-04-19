/**
 * examples/rounded-corners.tsx — Selective border radius demo.
 *
 * Demonstrates:
 *   - Per-corner borderRadius overrides on Rect
 *   - Tab bar with only top corners rounded
 *   - Speech bubble with one sharp corner
 *   - Pill shapes and card styles
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Rect, Text, Group, Column } from '../src/components/index.js';

function RoundedCornersDemo() {
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title */}
      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Rounded Corners
      </Text>

      <Column x={8} y={30} gap={8}>
        {/* Tab bar — only top corners rounded */}
        <Group h={36}>
          <Rect
            x={0} y={0} w={88} h={36}
            fill="blue"
            borderRadiusTopLeft={8}
            borderRadiusTopRight={8}
            borderRadiusBottomLeft={0}
            borderRadiusBottomRight={0}
          />
          <Text x={4} y={8} w={80} font="gothic14" color="white" align="center">
            Active
          </Text>
          <Rect
            x={92} y={0} w={88} h={36}
            fill="darkGray"
            borderRadiusTopLeft={8}
            borderRadiusTopRight={8}
            borderRadiusBottomLeft={0}
            borderRadiusBottomRight={0}
          />
          <Text x={96} y={8} w={80} font="gothic14" color="lightGray" align="center">
            Inactive
          </Text>
        </Group>

        {/* Speech bubble — bottom-left corner sharp */}
        <Group h={44}>
          <Rect
            x={20} y={0} w={160} h={36}
            fill="white"
            borderRadiusTopLeft={10}
            borderRadiusTopRight={10}
            borderRadiusBottomLeft={0}
            borderRadiusBottomRight={10}
          />
          <Text x={28} y={8} w={144} font="gothic14" color="black">
            Hello there!
          </Text>
        </Group>

        {/* Pill button */}
        <Group h={32}>
          <Rect x={30} y={0} w={120} h={28} fill="green" borderRadius={14} />
          <Text x={30} y={4} w={120} font="gothic14" color="white" align="center">
            Pill Button
          </Text>
        </Group>

        {/* Card with subtle rounding */}
        <Group h={44}>
          <Rect x={0} y={0} w={184} h={40} fill="darkGray" borderRadius={4} />
          <Text x={8} y={4} w={168} font="gothic14" color="white">
            Card Title
          </Text>
          <Text x={8} y={22} w={168} font="gothic14" color="lightGray">
            Subtle 4px radius
          </Text>
        </Group>
      </Column>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<RoundedCornersDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('rounded-corners example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
