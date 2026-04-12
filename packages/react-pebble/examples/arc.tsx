/**
 * examples/arc.tsx — Arc/radial drawing demo
 *
 * Demonstrates:
 *   - Arc component for progress rings and pie slices
 *   - Filled arcs and stroked arcs
 *   - Donut shapes with innerR
 *   - useState to animate arc endAngle
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Arc } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function ArcApp() {
  const [progress, setProgress] = useState(65);

  useButton('up', () => setProgress(p => Math.min(p + 10, 100)));
  useButton('down', () => setProgress(p => Math.max(p - 10, 0)));
  useButton('select', () => setProgress(0));

  const endAngle = (progress / 100) * 360;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Arc / Radial
      </Text>

      {/* Background ring (full circle, dark) */}
      <Arc x={55} y={40} r={45} innerR={32} startAngle={0} endAngle={360} fill="darkGray" />
      {/* Progress ring */}
      <Arc x={55} y={40} r={45} innerR={32} startAngle={0} endAngle={endAngle} fill="cyan" />
      {/* Percentage text */}
      <Text x={55} y={68} w={90} font="gothic24Bold" color="white" align="center">
        {progress}%
      </Text>

      {/* Filled pie slice */}
      <Arc x={10} y={150} r={30} startAngle={0} endAngle={120} fill="red" />
      <Text x={10} y={212} w={60} font="gothic14" color="lightGray" align="center">
        Pie
      </Text>

      {/* Stroked arc */}
      <Arc x={80} y={150} r={30} startAngle={45} endAngle={315} stroke="yellow" strokeWidth={2} />
      <Text x={80} y={212} w={60} font="gothic14" color="lightGray" align="center">
        Stroke
      </Text>

      {/* Small donut */}
      <Arc x={145} y={155} r={25} innerR={15} startAngle={0} endAngle={270} fill="green" />
      <Text x={145} y={212} w={50} font="gothic14" color="lightGray" align="center">
        Donut
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<ArcApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('arc example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
