/**
 * examples/animation.tsx — Animated UI using useAnimation hook.
 *
 * Demonstrates:
 *   - useAnimation hook with easing functions
 *   - lerp() for value interpolation
 *   - Bounce and elastic easing
 *   - Animated positions, sizes, and text
 *
 * The animation cycles every 60 seconds. On the emulator, the compiler
 * samples the component at multiple time points to build keyframe tables
 * for animated positions/sizes, and updates them via onTimeChanged.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Circle, Text } from '../src/index.js';
import { useAnimation, useTime, Easing, lerp } from '../src/hooks/index.js';

function AnimationDemo() {
  const time = useTime(1000);
  const bounce = useAnimation({
    duration: 60000,
    easing: Easing.bounceEaseOut,
    loop: true,
  });

  const slide = useAnimation({
    duration: 60000,
    easing: Easing.cubicEaseInOut,
    loop: true,
  });

  // Animated values
  const ballY = Math.round(lerp(30, 160, bounce.progress));
  const barW = Math.round(lerp(0, 180, slide.progress));
  const pct = Math.round(slide.progress * 100);
  const sec = time.getSeconds();

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Animation Demo
      </Text>

      {/* Bouncing ball */}
      <Circle x={20} y={ballY} r={12} fill="red" />

      {/* Pulsing circle */}
      <Circle x={130} y={90} r={Math.round(lerp(8, 25, slide.progress))} fill="cyan" />

      {/* Sliding progress bar */}
      <Rect x={10} y={190} w={180} h={10} fill="darkGray" borderRadius={5} />
      <Rect x={10} y={190} w={barW} h={10} fill="green" borderRadius={5} />

      {/* Progress text — uses MM:SS the compiler recognizes */}
      <Text x={0} y={205} w={200} font="gothic18" color="white" align="center">
        {time.getMinutes().toString().padStart(2, '0')}:{sec.toString().padStart(2, '0')}
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
