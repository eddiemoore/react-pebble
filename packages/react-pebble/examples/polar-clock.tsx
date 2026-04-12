/**
 * examples/polar-clock.tsx — Analog clock using polar coordinate helpers
 *
 * Demonstrates:
 *   - polarPoint for positioning hour markers
 *   - sinLookup / cosLookup / TRIG_MAX_ANGLE for Pebble-style trig
 *   - useTime for clock updates
 *   - Circle, Line, Path for clock elements
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Circle, Line, Path } from '../src/components/index.js';
import { useTime, polarPoint } from '../src/hooks/index.js';

function PolarClock() {
  const time = useTime(1000);
  const hours = time.getHours() % 12;
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const cx = 100;
  const cy = 100;

  // Hour markers at 30-degree intervals
  const markers = Array.from({ length: 12 }, (_, i) => {
    const outer = polarPoint(cx, cy, 85, i * 30);
    const inner = polarPoint(cx, cy, 75, i * 30);
    return { outer, inner, idx: i };
  });

  // Hand angles
  const hourAngle = (hours + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  const secondAngle = seconds * 6;

  // Hand endpoints
  const hourEnd = polarPoint(cx, cy, 45, hourAngle);
  const minuteEnd = polarPoint(cx, cy, 65, minuteAngle);
  const secondEnd = polarPoint(cx, cy, 75, secondAngle);

  // Hour hand as a path (triangular)
  const hourHand: Array<[number, number]> = [
    [0, -45],
    [-4, 0],
    [4, 0],
  ];

  // Minute hand as a path
  const minuteHand: Array<[number, number]> = [
    [0, -65],
    [-3, 0],
    [3, 0],
  ];

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Clock face circle */}
      <Circle x={cx - 90} y={cy - 90} r={90} fill="darkGray" />

      {/* Hour markers */}
      {markers.map((m) => (
        <Line
          x={m.inner.x} y={m.inner.y}
          x2={m.outer.x} y2={m.outer.y}
          color={m.idx === 0 ? 'white' : 'lightGray'}
          strokeWidth={m.idx % 3 === 0 ? 3 : 1}
        />
      ))}

      {/* Hour hand */}
      <Path x={cx} y={cy} points={hourHand} fill="white" rotation={hourAngle} />

      {/* Minute hand */}
      <Path x={cx} y={cy} points={minuteHand} fill="white" rotation={minuteAngle} />

      {/* Second hand */}
      <Line
        x={cx} y={cy}
        x2={secondEnd.x} y2={secondEnd.y}
        color="red" strokeWidth={1}
      />

      {/* Center dot */}
      <Circle x={cx - 4} y={cy - 4} r={4} fill="white" />

      {/* Digital time at bottom */}
      <Text x={0} y={200} w={200} font="gothic18" color="lightGray" align="center">
        {hours === 0 ? 12 : hours}:{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<PolarClock />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('polar-clock example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
