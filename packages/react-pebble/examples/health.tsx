/**
 * examples/health.tsx — Fitness watchface using health data
 *
 * Demonstrates:
 *   - useHealth hook (steps, distance, heart rate, calories)
 *   - useTime for clock display
 *   - Badge component for heart rate
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Badge } from '../src/components/index.js';
import { useHealth, useFormattedTime } from '../src/hooks/index.js';

function HealthFace() {
  const time = useFormattedTime('HH:mm');
  const { data: health } = useHealth(30000);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Time */}
      <Text x={0} y={10} w={200} font="bitham42Bold" color="white" align="center">
        {time}
      </Text>

      {/* Steps */}
      <Rect x={10} y={70} w={85} h={50} fill="darkGray" borderRadius={4} />
      <Text x={10} y={72} w={85} font="gothic14" color="lightGray" align="center">
        Steps
      </Text>
      <Text x={10} y={88} w={85} font="gothic24Bold" color="cyan" align="center">
        {health.steps.toString()}
      </Text>

      {/* Distance */}
      <Rect x={105} y={70} w={85} h={50} fill="darkGray" borderRadius={4} />
      <Text x={105} y={72} w={85} font="gothic14" color="lightGray" align="center">
        Distance
      </Text>
      <Text x={105} y={88} w={85} font="gothic24Bold" color="green" align="center">
        {(health.distance / 1000).toFixed(1)}km
      </Text>

      {/* Calories */}
      <Rect x={10} y={130} w={85} h={50} fill="darkGray" borderRadius={4} />
      <Text x={10} y={132} w={85} font="gothic14" color="lightGray" align="center">
        Calories
      </Text>
      <Text x={10} y={148} w={85} font="gothic24Bold" color="orange" align="center">
        {health.calories.toString()}
      </Text>

      {/* Heart rate */}
      <Rect x={105} y={130} w={85} h={50} fill="darkGray" borderRadius={4} />
      <Text x={105} y={132} w={85} font="gothic14" color="lightGray" align="center">
        Heart
      </Text>
      <Text x={105} y={148} w={85} font="gothic24Bold" color="red" align="center">
        {health.heartRate !== null ? health.heartRate.toString() : '--'}
      </Text>

      {/* Sleep */}
      <Text x={0} y={195} w={200} font="gothic14" color="lightGray" align="center">
        Sleep: {Math.round(health.sleepSeconds / 3600)}h {Math.round((health.sleepSeconds % 3600) / 60)}m
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<HealthFace />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('health example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
