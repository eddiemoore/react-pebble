/**
 * examples/dashboard.tsx — Watchface dashboard showcasing new features.
 *
 * Demonstrates:
 *   - useBattery / useConnection hooks
 *   - StatusBar component
 *   - Rounded rectangles (borderRadius)
 *   - Column layout
 *   - Text wrapping
 *   - Circle (filled)
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Circle, StatusBar, Column } from '../src/index.js';
import { useTime, useBattery, useConnection } from '../src/hooks/index.js';

function Dashboard() {
  const time = useTime(60000); // minute-level updates for battery efficiency
  const battery = useBattery();
  const conn = useConnection();

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const dateStr = `${days[time.getDay()]} ${time.getDate()}`;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Status bar with separator */}
      <StatusBar color="white" backgroundColor="darkGray" separator="line" />

      {/* Time display in rounded card */}
      <Rect x={10} y={24} w={180} h={64} fill="darkGray" borderRadius={8} />
      <Text x={10} y={32} w={180} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>
      <Text x={10} y={72} w={180} font="gothic14" color="lightGray" align="center">
        {dateStr}
      </Text>

      {/* Status indicators in a column layout */}
      <Column x={10} y={100} gap={4}>
        {/* Battery card */}
        <Rect x={0} y={0} w={180} h={36} fill="darkGray" borderRadius={6} />
        <Group x={0} y={0} h={36}>
          <Circle x={8} y={8} r={10} fill={battery.percent > 20 ? 'green' : 'red'} />
          <Text x={32} y={10} w={140} font="gothic18" color="white">
            Battery: {battery.percent}%{battery.charging ? ' (charging)' : ''}
          </Text>
        </Group>

        {/* Connection card */}
        <Rect x={0} y={0} w={180} h={36} fill="darkGray" borderRadius={6} />
        <Group x={0} y={0} h={36}>
          <Circle x={8} y={8} r={10} fill={conn.app ? 'blue' : 'red'} />
          <Text x={32} y={10} w={140} font="gothic18" color="white">
            {conn.app ? 'Connected' : 'Disconnected'}
          </Text>
        </Group>
      </Column>

      {/* Footer with wrapped text */}
      <Text x={10} y={195} w={180} h={30} font="gothic14" color="lightGray" align="center">
        Pebble Dashboard — react-pebble
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<Dashboard />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('dashboard example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
