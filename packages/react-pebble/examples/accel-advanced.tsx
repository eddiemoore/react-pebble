/**
 * examples/accel-advanced.tsx — Advanced accelerometer + raw click demo.
 *
 * Demonstrates:
 *   - useAccelerometerRaw(): batched raw samples at a chosen Hz.
 *   - useAccelerometerTap(): axis + direction on tap/shake gestures.
 *   - useRawClick(): independent press/release events for gesture timing.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Window } from '../src/index.js';
import {
  useState,
  useAccelerometerRaw,
  useAccelerometerTap,
  useRawClick,
} from '../src/hooks/index.js';

function AccelAdvanced() {
  const [lastTap, setLastTap] = useState('none');
  const [pressing, setPressing] = useState(false);

  const samples = useAccelerometerRaw({ samplingRateHz: 25, samplesPerUpdate: 5 });

  useAccelerometerTap((event) => {
    setLastTap(`${event.axis}${event.direction > 0 ? '+' : '-'}`);
  });

  useRawClick('select', {
    onDown: () => setPressing(true),
    onUp: () => setPressing(false),
  });

  const last = samples[samples.length - 1] ?? { x: 0, y: 0, z: 0 };

  return (
    <Window>
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={20} w={200} font="gothic24Bold" color="white" align="center">
          Accel Raw
        </Text>
        <Text x={0} y={60} w={200} font="gothic18" color="55FFFF" align="center">
          x: {last.x}
        </Text>
        <Text x={0} y={85} w={200} font="gothic18" color="55FFFF" align="center">
          y: {last.y}
        </Text>
        <Text x={0} y={110} w={200} font="gothic18" color="55FFFF" align="center">
          z: {last.z}
        </Text>
        <Text x={0} y={140} w={200} font="gothic18" color="FFAA00" align="center">
          tap: {lastTap}
        </Text>
        <Text x={0} y={175} w={200} font="gothic18" color={pressing ? '00FF00' : 'AAAAAA'} align="center">
          SELECT {pressing ? 'HELD' : '—'}
        </Text>
      </Group>
    </Window>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<AccelAdvanced />, { poco: PocoCtor });
}

export default main;
