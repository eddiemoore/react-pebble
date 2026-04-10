/**
 * examples/compass.tsx — Digital compass with heading display.
 *
 * Demonstrates:
 *   - useCompass hook
 *   - useAccelerometer hook
 *   - Circle rendering
 *   - Diagonal lines (compass points)
 *   - StatusBar
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Circle, Text, Line, StatusBar } from '../src/index.js';
import { useCompass, useAccelerometer } from '../src/hooks/index.js';

function CompassApp() {
  const { heading } = useCompass();
  const accel = useAccelerometer({ sampleRate: 200 });

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const dirIdx = Math.round(heading / 45) % 8;
  const dirStr = directions[dirIdx]!;

  // Compass face center
  const cx = 100;
  const cy = 100;
  const r = 60;

  // Cardinal direction lines
  const rad = (heading * Math.PI) / 180;
  const nx = cx + Math.round(r * Math.sin(-rad));
  const ny = cy - Math.round(r * Math.cos(-rad));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <StatusBar color="white" backgroundColor="darkGray" separator="line" />

      {/* Compass ring */}
      <Circle x={cx - r} y={cy - r} r={r} stroke="white" strokeWidth={2} />
      <Circle x={cx - 4} y={cy - 4} r={4} fill="white" />

      {/* North indicator line */}
      <Line x={cx} y={cy} x2={nx} y2={ny} color="red" strokeWidth={2} />

      {/* Heading text */}
      <Text x={0} y={170} w={200} font="bitham42Bold" color="white" align="center">
        {Math.round(heading)}°
      </Text>
      <Text x={0} y={200} w={200} font="gothic24" color="cyan" align="center">
        {dirStr}
      </Text>

      {/* Accelerometer tilt indicator */}
      <Text x={0} y={28} w={200} font="gothic14" color="lightGray" align="center">
        tilt: x={accel.x} y={accel.y}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<CompassApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('compass example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
