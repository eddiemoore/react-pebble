/**
 * examples/circles.tsx — Circle rendering test via piu RoundRect.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Circle, Group } from '../src/components/index.js';
import { useTime } from '../src/hooks/index.js';

function CircleDemo() {
  const time = useTime();
  const seconds = time.getSeconds().toString().padStart(2, '0');

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Circle x={50} y={30} r={40} fill="red" />
      <Circle x={110} y={30} r={40} fill="blue" />

      <Circle x={80} y={100} r={30} fill="green" />

      <Text x={0} y={180} w={200} font="gothic24" color="white" align="center">
        {seconds}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<CircleDemo />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('circles (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
