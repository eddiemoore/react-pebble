/**
 * examples/round-safe.tsx — RoundSafeArea and display bounds demo
 *
 * Demonstrates:
 *   - RoundSafeArea component for auto-inset on round displays
 *   - useDisplayBounds hook
 *   - Content that adapts to display shape
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Circle, RoundSafeArea } from '../src/components/index.js';
import { useDisplayBounds } from '../src/hooks/index.js';

function RoundSafeApp() {
  const bounds = useDisplayBounds(4);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Show the safe area boundary */}
      <Rect
        x={bounds.x} y={bounds.y}
        w={bounds.w} h={bounds.h}
        stroke="darkGray" strokeWidth={1}
      />

      {/* Content inside the safe area */}
      <RoundSafeArea padding={8}>
        <Rect x={0} y={0} w={200} h={28} fill="white" />
        <Text x={4} y={4} w={180} font="gothic18Bold" color="black">
          Round Safe
        </Text>

        <Text x={0} y={40} w={180} font="gothic18" color="white">
          This content is
        </Text>
        <Text x={0} y={60} w={180} font="gothic18" color="white">
          inset to avoid
        </Text>
        <Text x={0} y={80} w={180} font="gothic18" color="white">
          round edges.
        </Text>

        <Rect x={0} y={110} w={180} h={36} fill="darkGray" borderRadius={6} />
        <Text x={4} y={118} w={172} font="gothic14" color="cyan">
          Display: {bounds.w}x{bounds.h} {bounds.isRound ? '(round)' : '(rect)'}
        </Text>

        <Rect x={0} y={152} w={180} h={36} fill="darkGray" borderRadius={6} />
        <Text x={4} y={160} w={172} font="gothic14" color="cyan">
          Offset: x={bounds.x} y={bounds.y}
        </Text>
      </RoundSafeArea>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<RoundSafeApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('round-safe example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
