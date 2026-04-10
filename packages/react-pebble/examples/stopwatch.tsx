/**
 * examples/stopwatch.tsx — Stopwatch with start/stop/reset.
 *
 * SELECT starts/stops, DOWN resets.
 * Demonstrates: useButton, useState (boolean + number), useTime,
 * conditional text, skin reactivity (green when running, black when stopped).
 *
 * Note: In piu compiled mode, the "elapsed" display shows wall-clock
 * MM:SS (ticking via onTimeChanged) rather than true elapsed time,
 * since the compiler can't track persistent state between ticks.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Circle, Group } from '../src/components/index.js';
import { useButton, useState, useTime } from '../src/hooks/index.js';

function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [frozenTime, setFrozenTime] = useState('00:00');
  const time = useTime(1000);

  useButton('select', () => setRunning((r: boolean) => !r));
  useButton('down', () => setFrozenTime('00:00'));

  // When running, show ticking clock. When stopped, show frozen value.
  const mm = time.getMinutes().toString().padStart(2, '0');
  const ss = time.getSeconds().toString().padStart(2, '0');
  const display = running ? `${mm}:${ss}` : frozenTime;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill={running ? 'green' : 'black'} />

      {/* Ring */}
      <Circle x={40} y={24} r={60} fill="darkGray" />
      <Circle x={44} y={28} r={56} fill={running ? 'green' : 'black'} />

      {/* Time display */}
      <Text x={0} y={55} w={200} font="bitham42Bold" color="white" align="center">
        {display}
      </Text>

      {/* Status */}
      <Text x={0} y={160} w={200} font="gothic24Bold" color="white" align="center">
        {running ? 'RUNNING' : 'STOPPED'}
      </Text>

      {/* Controls */}
      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        SELECT start/stop · DOWN reset
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<Stopwatch />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('stopwatch (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
