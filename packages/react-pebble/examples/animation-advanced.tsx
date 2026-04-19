/**
 * examples/animation-advanced.tsx — Advanced animation with ping-pong and play count.
 *
 * Demonstrates:
 *   - useAnimation with playCount=3 (finite repetition)
 *   - reverse=true for ping-pong bouncing
 *   - Easing.bounceEaseOut for a bounce effect
 *   - lerp() for interpolating animated values
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Rect, Group, Text } from '../src/components/index.js';
import { useAnimation, Easing, lerp } from '../src/hooks/index.js';

function AnimationAdvancedDemo() {
  // Ping-pong bounce that plays 3 full cycles then stops
  const bounce = useAnimation({
    duration: 4000,
    easing: Easing.bounceEaseOut,
    playCount: 3,
    reverse: true,
  });

  // Smooth elastic that loops forever
  const elastic = useAnimation({
    duration: 6000,
    easing: Easing.elasticEaseOut,
    loop: true,
    reverse: true,
  });

  // Cubic ease ping-pong, 5 plays
  const slide = useAnimation({
    duration: 3000,
    easing: Easing.cubicEaseInOut,
    playCount: 5,
    reverse: true,
  });

  const ballY = Math.round(lerp(30, 160, bounce.progress));
  const barX = Math.round(lerp(4, 150, elastic.progress));
  const slideX = Math.round(lerp(4, 160, slide.progress));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title */}
      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Advanced Animation
      </Text>

      {/* Bouncing ball (3 cycles, ping-pong) */}
      <Rect x={20} y={ballY} w={24} h={24} fill="red" borderRadius={12} />
      <Text x={50} y={30} w={140} font="gothic14" color="lightGray">
        {bounce.running ? 'Bouncing (3x)' : 'Bounce done'}
      </Text>

      {/* Elastic bar (infinite loop) */}
      <Rect x={barX} y={100} w={40} h={12} fill="cyan" borderRadius={4} />
      <Text x={4} y={116} w={190} font="gothic14" color="lightGray">
        Elastic (infinite)
      </Text>

      {/* Sliding square (5 cycles) */}
      <Rect x={slideX} y={145} w={30} h={30} fill="green" borderRadius={4} />
      <Text x={4} y={180} w={190} font="gothic14" color="lightGray">
        {slide.running ? 'Sliding (5x)' : 'Slide done'}
      </Text>

      {/* Progress readout */}
      <Text x={0} y={208} w={200} font="gothic14" color="darkGray" align="center">
        bounce={Math.round(bounce.progress * 100).toString()}% slide={Math.round(slide.progress * 100).toString()}%
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<AnimationAdvancedDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('animation-advanced example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
