/**
 * examples/animation.tsx — Animated UI elements with easing.
 *
 * Demonstrates:
 *   - useAnimation hook with easing functions
 *   - lerp() for value interpolation
 *   - Bounce and elastic easing
 *   - Circle and rectangle animation
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Circle, Text } from '../src/index.js';
import { useAnimation, Easing, lerp } from '../src/hooks/index.js';

function AnimationDemo() {
  const bounce = useAnimation({
    duration: 2000,
    easing: Easing.bounceEaseOut,
    loop: true,
  });

  const elastic = useAnimation({
    duration: 1500,
    easing: Easing.elasticEaseOut,
    loop: true,
  });

  const slide = useAnimation({
    duration: 3000,
    easing: Easing.cubicEaseInOut,
    loop: true,
  });

  // Animated positions
  const ballY = lerp(10, 160, bounce.progress);
  const circleR = lerp(5, 30, elastic.progress);
  const barW = lerp(0, 180, slide.progress);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Animation Demo
      </Text>

      {/* Bouncing ball */}
      <Circle x={20} y={Math.round(ballY)} r={12} fill="red" />

      {/* Elastic circle */}
      <Circle x={100} y={100} r={Math.round(circleR)} fill="cyan" />

      {/* Sliding progress bar */}
      <Rect x={10} y={200} w={180} h={8} fill="darkGray" borderRadius={4} />
      <Rect x={10} y={200} w={Math.round(barW)} h={8} fill="green" borderRadius={4} />

      {/* Progress text */}
      <Text x={0} y={212} w={200} font="gothic14" color="lightGray" align="center">
        {Math.round(slide.progress * 100)}%
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
