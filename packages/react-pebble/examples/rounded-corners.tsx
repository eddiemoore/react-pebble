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
        {/* Tab bar — only top corners rounded (16px for visibility) */}
        <Group h={40}>
          <Rect
            x={0} y={0} w={88} h={40}
            fill="blue"
            borderRadiusTopLeft={16}
            borderRadiusTopRight={16}
            borderRadiusBottomLeft={0}
            borderRadiusBottomRight={0}
          />
          <Text x={4} y={12} w={80} font="gothic14" color="white" align="center">
            Active
          </Text>
          <Rect
            x={92} y={0} w={88} h={40}
            fill="darkGray"
            borderRadiusTopLeft={16}
            borderRadiusTopRight={16}
            borderRadiusBottomLeft={0}
            borderRadiusBottomRight={0}
          />
          <Text x={96} y={12} w={80} font="gothic14" color="lightGray" align="center">
            Inactive
          </Text>
        </Group>

        {/* Speech bubble — bottom-left corner sharp (14px radius) */}
        <Group h={50}>
          <Rect
            x={10} y={0} w={170} h={44}
            fill="white"
            borderRadiusTopLeft={14}
            borderRadiusTopRight={14}
            borderRadiusBottomLeft={0}
            borderRadiusBottomRight={14}
          />
          <Text x={24} y={12} w={144} font="gothic14" color="black">
            Hello there!
          </Text>
        </Group>

        {/* Pill button (full half-height radius) */}
        <Group h={36}>
          <Rect x={20} y={0} w={144} h={32} fill="green" borderRadius={16} />
          <Text x={20} y={6} w={144} font="gothic14" color="white" align="center">
            Pill Button
          </Text>
        </Group>

        {/* Card with visible rounding (10px) */}
        <Group h={50}>
          <Rect x={0} y={0} w={184} h={46} fill="darkGray" borderRadius={10} />
          <Text x={12} y={6} w={160} font="gothic14" color="white">
            Card Title
          </Text>
          <Text x={12} y={24} w={160} font="gothic14" color="lightGray">
            10px radius
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
