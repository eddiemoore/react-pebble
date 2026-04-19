/**
 * examples/text-overflow.tsx — Text overflow modes demo.
 *
 * Demonstrates the three Text overflow modes:
 *   - 'wordWrap' (default): wraps text at word boundaries
 *   - 'trailingEllipsis': truncates with "..." at the end
 *   - 'fill': clips text without any indicator
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Group, Rect, Column } from '../src/components/index.js';

const LONG_TEXT = 'The quick brown fox jumps over the lazy dog repeatedly until it runs out of screen space';

function TextOverflowDemo() {
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title */}
      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Text Overflow
      </Text>

      <Column x={8} y={32} gap={6}>
        {/* Word Wrap */}
        <Group h={56}>
          <Text x={0} y={0} w={184} font="gothic14" color="cyan">
            overflow: wordWrap
          </Text>
          <Rect x={0} y={16} w={184} h={38} fill="darkGray" />
          <Text x={2} y={18} w={180} h={34} font="gothic14" color="white" overflow="wordWrap">
            {LONG_TEXT}
          </Text>
        </Group>

        {/* Trailing Ellipsis */}
        <Group h={56}>
          <Text x={0} y={0} w={184} font="gothic14" color="cyan">
            overflow: trailingEllipsis
          </Text>
          <Rect x={0} y={16} w={184} h={38} fill="darkGray" />
          <Text x={2} y={18} w={180} h={34} font="gothic14" color="white" overflow="trailingEllipsis">
            {LONG_TEXT}
          </Text>
        </Group>

        {/* Fill */}
        <Group h={56}>
          <Text x={0} y={0} w={184} font="gothic14" color="cyan">
            overflow: fill
          </Text>
          <Rect x={0} y={16} w={184} h={38} fill="darkGray" />
          <Text x={2} y={18} w={180} h={34} font="gothic14" color="white" overflow="fill">
            {LONG_TEXT}
          </Text>
        </Group>
      </Column>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<TextOverflowDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('text-overflow example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
