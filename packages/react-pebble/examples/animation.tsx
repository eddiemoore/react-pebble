/**
 * examples/animation.tsx — Time-driven animated elements.
 *
 * Demonstrates:
 *   - useTime for animation frames
 *   - Easing functions for interpolation
 *   - lerp() for value interpolation
 *   - Animated text + progress bar
 *   - useButton to restart animation
 *
 * Note: Position-based animations in piu compiled mode are limited to
 * what the compiler can detect via time diffs. Text values animate via
 * onTimeChanged. For full position animation on device, use piu Timeline
 * directly.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Circle, Text } from '../src/index.js';
import { useTime, Easing, lerp } from '../src/hooks/index.js';

function AnimationDemo() {
  const time = useTime(1000);

  // Derive animation from current time.
  // The compiler detects time-dependent text by rendering at two
  // mock times (differing by 1 minute), so we use minutes for the
  // cycle and seconds for the sub-progress.
  const min = time.getMinutes();
  const sec = time.getSeconds();
  const cycleProgress = ((min % 10) * 60 + sec) / 600; // 0..1 over 10 minutes
  const bounced = Easing.bounceEaseOut(cycleProgress);
  const eased = Easing.cubicEaseInOut(cycleProgress);

  // Animated values
  const ballY = Math.round(lerp(30, 160, bounced));
  const barW = Math.round(lerp(0, 180, eased));
  const pct = Math.round(eased * 100);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Animation Demo
      </Text>

      {/* Bouncing ball */}
      <Circle x={20} y={ballY} r={12} fill="red" />

      {/* Elastic circle */}
      <Circle x={130} y={90} r={Math.round(lerp(5, 30, Easing.elasticEaseOut(cycleProgress)))} fill="cyan" />

      {/* Sliding progress bar */}
      <Rect x={10} y={190} w={180} h={10} fill="darkGray" borderRadius={5} />
      <Rect x={10} y={190} w={barW} h={10} fill="green" borderRadius={5} />

      {/* Time display — uses MM:SS format the compiler recognizes */}
      <Text x={0} y={205} w={200} font="gothic18" color="white" align="center">
        {min.toString().padStart(2, '0')}:{sec.toString().padStart(2, '0')}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<AnimationDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('animation example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
