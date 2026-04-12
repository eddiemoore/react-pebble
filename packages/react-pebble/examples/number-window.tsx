/**
 * examples/number-window.tsx — Numeric input demo
 *
 * Demonstrates:
 *   - Numeric value adjustment with UP/DOWN buttons
 *   - SELECT to confirm, view switching
 *   - Min/max/step constraints
 *
 * Note: Uses primitives + useButton directly rather than the NumberWindow
 * composite, so the piu compiler can detect button bindings.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const MIN = 1;
const MAX = 60;
const STEP = 5;

function NumberWindowApp() {
  const [value, setValue] = useState(15);
  const [confirmed, setConfirmed] = useState(false);

  useButton('up', () => setValue(v => Math.min(v + STEP, MAX)));
  useButton('down', () => setValue(v => Math.max(v - STEP, MIN)));
  useButton('select', () => setConfirmed(true));
  useButton('back', () => { setConfirmed(false); setValue(15); });

  if (confirmed) {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={60} w={200} font="gothic24Bold" color="white" align="center">
          Timer set to
        </Text>
        <Text x={0} y={90} w={200} font="bitham42Bold" color="cyan" align="center">
          {value.toString()}
        </Text>
        <Text x={0} y={140} w={200} font="gothic18" color="white" align="center">
          minutes
        </Text>
        <Text x={0} y={190} w={200} font="gothic14" color="lightGray" align="center">
          BACK to reset
        </Text>
      </Group>
    );
  }

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
        Set Timer (min)
      </Text>
      <Text x={0} y={85} w={200} font="bitham42Bold" color="white" align="center">
        {value.toString()}
      </Text>
      <Text x={0} y={150} w={200} font="gothic18" color="darkGray" align="center">
        UP/DOWN to adjust
      </Text>
      <Text x={0} y={180} w={200} font="gothic14" color="lightGray" align="center">
        SELECT to confirm
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<NumberWindowApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('number-window example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
