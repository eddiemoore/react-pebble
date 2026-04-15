/**
 * examples/layered-cards.tsx — Nesting & layering showcase.
 *
 * Demonstrates the rule that makes react-pebble UIs work:
 *   Within a Group, children paint in source order (later paints over earlier).
 *   Column/Row apply an offset to every direct child, so when you want a card
 *   with a background, wrap the background + foreground content in a single
 *   nested Group — that Group is the stackable unit.
 *
 * Layers used here (top → bottom):
 *   Root Group
 *   ├─ full-screen background Rect
 *   ├─ header Group (bg Rect + title Text)
 *   ├─ Column of 3 stat cards — each card is a Group containing:
 *   │     bg Rect + Row[icon Circle, label Text] + progress Group[track + fill]
 *   ├─ Card (uses the new `children` prop) holding a nested Text
 *   └─ footer Group (bg Rect + Text)
 */

import type Poco from 'commodetto/Poco';
import {
  render,
  Group,
  Rect,
  Circle,
  Text,
  Row,
  Column,
  Card,
} from '../src/index.js';

interface Stat {
  label: string;
  iconColor: 'red' | 'green' | 'blue';
  percent: number;
}

const stats: Stat[] = [
  { label: 'CPU', iconColor: 'green', percent: 42 },
  { label: 'Memory', iconColor: 'blue', percent: 71 },
  { label: 'Disk', iconColor: 'red', percent: 88 },
];

const CARD_W = 180;
const CARD_H = 36;

// Inlined instead of a <StatCard /> component because Column inspects each
// child's declared `h` prop to compute offsets. A custom component's vnode
// props don't expose its inner Group's h, so Column would fall back to the
// 20px default and cards would overlap. Keeping the Group literal in-place
// lets Column see `h={CARD_H}` directly.
function statCard(stat: Stat) {
  const trackW = CARD_W - 16;
  const fillW = Math.round((trackW * stat.percent) / 100);
  return (
    <Group key={stat.label} h={CARD_H}>
      {/* Background (paints first — lowest in the stack). */}
      <Rect x={0} y={0} w={CARD_W} h={CARD_H} fill="darkGray" borderRadius={6} />

      {/* Icon + label row sits above the background.
          Circle has no `w`, so Row's 40px default governs its slot width. */}
      <Row x={8} y={6} gap={8}>
        <Circle x={0} y={0} r={8} fill={stat.iconColor} />
        <Text x={0} y={0} w={100} h={16} font="gothic18Bold" color="white">
          {stat.label}
        </Text>
        <Text x={0} y={0} w={40} h={16} font="gothic18" color="lightGray" align="right">
          {stat.percent}%
        </Text>
      </Row>

      {/* Progress bar — track, then overlay fill on top. */}
      <Group x={8} y={24} h={8}>
        <Rect x={0} y={0} w={trackW} h={8} fill="black" borderRadius={3} />
        <Rect x={0} y={0} w={fillW} h={8} fill={stat.iconColor} borderRadius={3} />
      </Group>
    </Group>
  );
}

function LayeredCards() {
  return (
    <Group>
      {/* Full-screen backdrop. */}
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Header with its own background. */}
      <Group>
        <Rect x={0} y={0} w={200} h={22} fill="oxfordBlue" />
        <Text x={0} y={2} w={200} font="gothic18Bold" color="white" align="center">
          System Stats
        </Text>
      </Group>

      {/* Stacked cards — each is a single Group, so Column offsets them as units. */}
      <Column x={10} y={28} gap={4}>
        {stats.map(statCard)}
      </Column>

      {/* Card with the new children prop — content nested inside the card's group. */}
      <Card x={10} y={146} w={180} title="Notes">
        <Text x={4} y={0} w={172} h={20} font="gothic14" color="white">
          Nested via Card children.
        </Text>
      </Card>

      {/* Footer. */}
      <Group>
        <Rect x={0} y={206} w={200} h={22} fill="darkGreen" />
        <Text x={0} y={208} w={200} font="gothic14" color="white" align="center">
          layered-cards demo
        </Text>
      </Group>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<LayeredCards />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('layered-cards (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
