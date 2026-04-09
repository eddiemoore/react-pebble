/**
 * examples/watchface.tsx — Simple digital watchface for Pebble Alloy.
 *
 * Exports a `main(Poco)` function rather than calling render() at module
 * top level, so:
 *
 *   - The Alloy entry (`pebble-spike/src/embeddedjs/main.js`) can import
 *     Poco from `commodetto/Poco` and hand it in.
 *   - Node mock tests can call main() with `undefined`, triggering the
 *     render()'s built-in mock path.
 */

import type Poco from 'commodetto/Poco';
import { render, Text, Rect, Group } from '../src/index.js';
import { useTime } from '../src/hooks/index.js';

function WatchFace() {
  const time = useTime();

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ] as const;
  const dateStr = `${days[time.getDay()]} ${months[time.getMonth()]} ${time.getDate()}`;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={8} y={24} w={184} h={1} fill="white" />

      <Text x={0} y={50} w={200} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>

      <Text x={0} y={110} w={200} font="gothic24" color="lightGray" align="center">
        {seconds}
      </Text>

      <Rect x={8} y={150} w={184} h={1} fill="white" />

      <Text x={0} y={160} w={200} font="gothic24" color="white" align="center">
        {dateStr}
      </Text>
    </Group>
  );
}

/**
 * Entry function. Called by the Alloy-side main.js with the imported Poco
 * constructor, or without arguments in Node mock mode.
 */
export function main(PocoCtor?: typeof Poco) {
  const app = render(<WatchFace />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('react-pebble watchface example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
    for (const call of app.drawLog) {
      if (call.op === 'drawText') {
        console.log(`  drawText("${String(call.text)}", x=${String(call.x)}, y=${String(call.y)})`);
      }
    }
  }

  return app;
}

// Default export so the Alloy entry can import as either named or default.
export default main;
