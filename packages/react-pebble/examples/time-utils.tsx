/**
 * examples/time-utils.tsx — Wall-time utilities.
 *
 * Demonstrates:
 *   - useFormattedTime('auto') — auto 24h/12h detection
 *   - clockIs24HourStyle() — read the user preference directly
 *   - startOfToday() — seconds at local midnight
 *   - clockToTimestamp() — Date → Unix seconds
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import {
  useFormattedTime,
  clockIs24HourStyle,
  startOfToday,
  clockToTimestamp,
} from '../src/hooks/index.js';

function TimeUtilsDemo() {
  // Re-renders with the tick service
  const auto = useFormattedTime('auto');
  const hhmm = useFormattedTime('HH:mm');
  const hh12 = useFormattedTime('hh:mm a');

  const is24h = clockIs24HourStyle();
  const midnight = startOfToday();
  const nowSec = clockToTimestamp(new Date());
  const secondsIntoDay = nowSec - midnight;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={20} w={200} font="bitham42Bold" color="white" align="center">
        {auto}
      </Text>
      <Text x={0} y={85} w={200} font="gothic18" color="AAAAAA" align="center">
        24h style: {is24h ? 'yes' : 'no'}
      </Text>
      <Text x={0} y={115} w={200} font="gothic14" color="55FFFF" align="center">
        HH:mm → {hhmm}
      </Text>
      <Text x={0} y={140} w={200} font="gothic14" color="55FFFF" align="center">
        hh:mm a → {hh12}
      </Text>
      <Text x={0} y={175} w={200} font="gothic14" color="FFAA00" align="center">
        elapsed today: {secondsIntoDay}s
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<TimeUtilsDemo />, { poco: PocoCtor });
}

export default main;
