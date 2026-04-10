/**
 * examples/weather.tsx — Weather watchface combining all features.
 *
 * Demonstrates: useTime (clock), circles (weather icons),
 * multi-label layout, and a polished visual design.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Circle, Group } from '../src/components/index.js';
import { useTime } from '../src/hooks/index.js';

function Weather() {
  const time = useTime();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ] as const;
  const dateStr = `${days[time.getDay()]} ${months[time.getMonth()]} ${time.getDate()}`;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Time */}
      <Text x={0} y={8} w={200} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>

      {/* Date */}
      <Text x={0} y={55} w={200} font="gothic18" color="lightGray" align="center">
        {dateStr}
      </Text>

      {/* Divider */}
      <Rect x={20} y={80} w={160} h={1} fill="darkGray" />

      {/* Current weather */}
      <Circle x={20} y={90} r={20} fill="yellow" />
      <Text x={70} y={90} w={120} font="gothic28Bold" color="white">
        72°F
      </Text>
      <Text x={70} y={118} w={120} font="gothic14" color="lightGray">
        Sunny
      </Text>

      {/* Divider */}
      <Rect x={20} y={142} w={160} h={1} fill="darkGray" />

      {/* 3-day forecast */}
      <Group y={150}>
        <Circle x={10} y={6} r={8} fill="yellow" />
        <Text x={32} y={2} w={40} font="gothic14Bold" color="white">
          Thu
        </Text>
        <Text x={80} y={2} w={50} font="gothic14" color="lightGray">
          75°/58°
        </Text>
      </Group>

      <Group y={174}>
        <Circle x={10} y={6} r={8} fill="lightGray" />
        <Text x={32} y={2} w={40} font="gothic14Bold" color="white">
          Fri
        </Text>
        <Text x={80} y={2} w={50} font="gothic14" color="lightGray">
          68°/52°
        </Text>
      </Group>

      <Group y={198}>
        <Circle x={10} y={6} r={8} fill="cyan" />
        <Text x={32} y={2} w={40} font="gothic14Bold" color="white">
          Sat
        </Text>
        <Text x={80} y={2} w={50} font="gothic14" color="lightGray">
          62°/48°
        </Text>
      </Group>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<Weather />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('weather (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
