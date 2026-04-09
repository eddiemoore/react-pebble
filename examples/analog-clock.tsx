/**
 * examples/analog-clock.tsx — Analog-style clock face with circles.
 *
 * Uses Circle components for hour markers and a center dot,
 * plus Text for the digital time. Demonstrates circles + useTime
 * together for a visually polished watchface.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Circle, Group } from '../src/components/index.js';
import { useTime } from '../src/hooks/index.js';

function AnalogClock() {
  const time = useTime();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const dateStr = `${days[time.getDay()]} ${time.getDate()}`;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Hour markers as circles — 12, 3, 6, 9 o'clock positions */}
      <Circle x={92} y={10} r={8} fill="white" />
      <Circle x={174} y={98} r={8} fill="white" />
      <Circle x={92} y={186} r={8} fill="white" />
      <Circle x={10} y={98} r={8} fill="white" />

      {/* Small markers for other hours */}
      <Circle x={134} y={22} r={4} fill="lightGray" />
      <Circle x={164} y={54} r={4} fill="lightGray" />
      <Circle x={164} y={150} r={4} fill="lightGray" />
      <Circle x={134} y={182} r={4} fill="lightGray" />
      <Circle x={50} y={182} r={4} fill="lightGray" />
      <Circle x={20} y={150} r={4} fill="lightGray" />
      <Circle x={20} y={54} r={4} fill="lightGray" />
      <Circle x={50} y={22} r={4} fill="lightGray" />

      {/* Center dot */}
      <Circle x={90} y={100} r={12} fill="red" />

      {/* Digital time */}
      <Text x={0} y={68} w={200} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>

      {/* Seconds */}
      <Text x={0} y={120} w={200} font="gothic24" color="lightGray" align="center">
        {seconds}
      </Text>

      {/* Date */}
      <Text x={0} y={155} w={200} font="gothic18" color="white" align="center">
        {dateStr}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<AnalogClock />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('analog-clock (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
