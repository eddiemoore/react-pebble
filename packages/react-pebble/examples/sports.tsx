/**
 * examples/sports.tsx — PebbleKit Sports protocol companion.
 *
 * Demonstrates useSports() — the phone-side helper for running/cycling apps.
 * Opens a simple "run tracker" UI on the watch and pipes time, distance,
 * pace, and heart rate from the phone via the standard Sports AppMessage
 * keys. The watch shows play/pause state driven by the Sports watchapp.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Window } from '../src/index.js';
import { useEffect } from 'preact/hooks';
import { useState, useSports } from '../src/hooks/index.js';

function SportsTracker() {
  const [elapsed, setElapsed] = useState(0);
  const { update, state } = useSports({
    units: 'metric',
    onStateChange: (newState) => {
      // Pebble sent us a play/pause — mirror it locally.
      console.log('sports state →', newState);
    },
  });

  // Tick elapsed time when playing, stream into the Sports protocol.
  useEffect(() => {
    if (state !== 'playing') return;
    const id = setInterval(() => {
      setElapsed((t) => {
        const next = t + 1;
        // Pretend we're running at 10 km/h
        const distance = (next / 3600) * 10;
        update({
          time: next,
          distance,
          pace: 360, // 6:00 /km
          heartRate: 142,
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, update]);

  return (
    <Window
      onSelect={() => update({ state: state === 'playing' ? 'paused' : 'playing' })}
    >
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={30} w={200} font="gothic24Bold" color="white" align="center">
          Sports
        </Text>
        <Text x={0} y={80} w={200} font="bitham42Bold" color="00FF00" align="center">
          {elapsed}s
        </Text>
        <Text x={0} y={150} w={200} font="gothic18" color="55FFFF" align="center">
          state: {state}
        </Text>
        <Text x={0} y={190} w={200} font="gothic14" color="AAAAAA" align="center">
          SELECT toggles play/pause
        </Text>
      </Group>
    </Window>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<SportsTracker />, { poco: PocoCtor });
}

export default main;
