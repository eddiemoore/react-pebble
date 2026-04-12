/**
 * examples/multi-click.tsx — Multi-click and repeat click demo
 *
 * Demonstrates:
 *   - useMultiClick for double-click detection
 *   - useRepeatClick for auto-repeating button press
 *   - useTimer for one-shot delayed callback
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useState, useMultiClick, useRepeatClick, useTimer } from '../src/hooks/index.js';

function MultiClickApp() {
  const [doubleClicks, setDoubleClicks] = useState(0);
  const [repeatCount, setRepeatCount] = useState(0);
  const [timerMsg, setTimerMsg] = useState('idle');

  // Double-click on SELECT
  useMultiClick('select', () => {
    setDoubleClicks(c => c + 1);
  }, { count: 2, maxInterval: 400 });

  // Auto-repeat on UP
  useRepeatClick('up', () => {
    setRepeatCount(c => c + 1);
  }, { initialDelay: 300, repeatInterval: 80 });

  // One-shot timer on DOWN
  const timer = useTimer(() => {
    setTimerMsg('fired!');
  });

  useMultiClick('down', () => {
    setTimerMsg('waiting...');
    timer.start(2000);
  }, { count: 1, maxInterval: 500 });

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Multi-Click
      </Text>

      {/* Double click counter */}
      <Text x={0} y={40} w={200} font="gothic14" color="lightGray" align="center">
        Double-click SELECT:
      </Text>
      <Text x={0} y={58} w={200} font="gothic24Bold" color="cyan" align="center">
        {doubleClicks.toString()}
      </Text>

      {/* Repeat counter */}
      <Text x={0} y={95} w={200} font="gothic14" color="lightGray" align="center">
        Hold UP (repeat):
      </Text>
      <Text x={0} y={113} w={200} font="gothic24Bold" color="green" align="center">
        {repeatCount.toString()}
      </Text>

      {/* Timer */}
      <Text x={0} y={155} w={200} font="gothic14" color="lightGray" align="center">
        DOWN = 2s timer:
      </Text>
      <Text x={0} y={173} w={200} font="gothic24Bold" color="yellow" align="center">
        {timerMsg}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<MultiClickApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('multi-click example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
