/**
 * examples/path.tsx — Polygon/path drawing demo
 *
 * Demonstrates:
 *   - Path component with polygon fill
 *   - Path rotation (clock hand style)
 *   - Path stroke outlines
 *   - useState to rotate interactively
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Circle, Path } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function PathApp() {
  const [angle, setAngle] = useState(0);

  useButton('up', () => setAngle(a => (a + 15) % 360));
  useButton('down', () => setAngle(a => (a - 15 + 360) % 360));
  useButton('select', () => setAngle(0));

  const cx = 100;
  const cy = 100;

  // Clock hand shape (narrow triangle)
  const handPoints: Array<[number, number]> = [
    [0, -50],  // tip
    [-5, 0],   // base left
    [5, 0],    // base right
  ];

  // Diamond shape (static)
  const diamond: Array<[number, number]> = [
    [30, 0],
    [60, 20],
    [30, 40],
    [0, 20],
  ];

  // Arrow shape (static)
  const arrow: Array<[number, number]> = [
    [0, 0],
    [20, 15],
    [10, 15],
    [10, 30],
    [-10, 30],
    [-10, 15],
    [-20, 15],
  ];

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Path / Polygon
      </Text>

      {/* Center circle */}
      <Circle x={cx - 3} y={cy - 3} r={3} fill="white" />

      {/* Rotating clock hand */}
      <Path
        x={cx} y={cy}
        points={handPoints}
        fill="red"
        rotation={angle}
      />

      {/* Static diamond */}
      <Path x={10} y={160} points={diamond} fill="cyan" stroke="white" strokeWidth={1} />

      {/* Static arrow */}
      <Path x={160} y={170} points={arrow} fill="yellow" />

      {/* Angle display */}
      <Text x={0} y={205} w={200} font="gothic18" color="lightGray" align="center">
        {angle}° — UP/DOWN to rotate
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<PathApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('path example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
