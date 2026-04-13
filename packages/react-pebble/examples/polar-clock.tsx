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
import { render, SCREEN } from '../src/index.js';
import { Text, Rect, Group, Circle, Line, Path } from '../src/components/index.js';
import { useTime, polarPoint } from '../src/hooks/index.js';

function PolarClock() {
  const time = useTime(1000);
  const hours = time.getHours() % 12;
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const sw = SCREEN.width;
  const sh = SCREEN.height;
  const cx = Math.floor(sw / 2);
  const cy = Math.floor(Math.min(sw, sh) / 2);
  const faceR = Math.floor(Math.min(sw, sh) / 2 - 4);
  const markerOuter = faceR - 5;
  const markerInner = markerOuter - 10;
  const hourLen = Math.floor(faceR * 0.5);
  const minLen = Math.floor(faceR * 0.72);
  const secLen = Math.floor(faceR * 0.83);

  // Hour markers at 30-degree intervals
  const markers = Array.from({ length: 12 }, (_, i) => {
    const outer = polarPoint(cx, cy, markerOuter, i * 30);
    const inner = polarPoint(cx, cy, markerInner, i * 30);
    return { outer, inner, idx: i };
  });

  // Hand angles
  const hourAngle = (hours + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  const secondAngle = seconds * 6;

  // Hand endpoints
  const secondEnd = polarPoint(cx, cy, secLen, secondAngle);

  // Hour hand as a path (triangular)
  const hourHand: Array<[number, number]> = [
    [0, -hourLen],
    [-4, 0],
    [4, 0],
  ];

  // Minute hand as a path
  const minuteHand: Array<[number, number]> = [
    [0, -minLen],
    [-3, 0],
    [3, 0],
  ];

  return (
    <Group>
      <Rect x={0} y={0} w={sw} h={sh} fill="black" />

      {/* Clock face circle */}
      <Circle x={cx - faceR} y={cy - faceR} r={faceR} fill="darkGray" />

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
      <Text x={0} y={sh - 28} w={sw} font="gothic18" color="lightGray" align="center">
        {time.getHours().toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}
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
