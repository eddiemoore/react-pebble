/**
 * examples/app-glance-countdown.tsx — Dynamic AppGlance subtitles.
 *
 * Demonstrates:
 *   - appGlanceTimeUntil() / appGlanceTimeSince() — template builders that
 *     let the system render live countdowns/elapsed timers without your
 *     app being awake.
 *   - useAppGlance() — push a slice with one of those templates.
 *
 * This app shows a timer and, on SELECT, sets an AppGlance slice that
 * displays "in 5 min" in the launcher. No redraws needed — the system
 * handles the countdown.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Window } from '../src/index.js';
import {
  useState,
  useAppGlance,
  appGlanceTimeUntil,
  appGlanceTimeSince,
} from '../src/hooks/index.js';

function AppGlanceDemo() {
  const glance = useAppGlance();
  const [mode, setMode] = useState<'idle' | 'future' | 'past'>('idle');

  const pushFuture = () => {
    const future = Math.floor(Date.now() / 1000) + 300; // +5 min
    glance.update([{
      subtitle: appGlanceTimeUntil(future, '%aT'),
      expirationTime: future + 60,
    }]);
    setMode('future');
  };

  const pushPast = () => {
    const past = Math.floor(Date.now() / 1000) - 600; // -10 min
    glance.update([{
      subtitle: appGlanceTimeSince(past, '%aT ago'),
    }]);
    setMode('past');
  };

  return (
    <Window onUp={pushFuture} onDown={pushPast}>
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={30} w={200} font="gothic24Bold" color="white" align="center">
          AppGlance
        </Text>
        <Text x={0} y={90} w={200} font="gothic18" color="55FFFF" align="center">
          mode: {mode}
        </Text>
        <Text x={0} y={150} w={200} font="gothic14" color="AAAAAA" align="center">
          UP: "in 5 min"
        </Text>
        <Text x={0} y={175} w={200} font="gothic14" color="AAAAAA" align="center">
          DOWN: "10 min ago"
        </Text>
      </Group>
    </Window>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<AppGlanceDemo />, { poco: PocoCtor });
}

export default main;
