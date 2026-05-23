/**
 * examples/vibration.tsx — Haptic feedback demo
 *
 * Demonstrates:
 *   - useVibration hook (short, long, double pulse)
 *   - Button-triggered haptic patterns
 */

import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useVibration, useState } from '../src/hooks/index.js';

export default function VibrationApp() {
  const vib = useVibration();
  const [lastPulse, setLastPulse] = useState('none');

  useButton('up', () => {
    vib.shortPulse();
    setLastPulse('short');
  });
  useButton('down', () => {
    vib.longPulse();
    setLastPulse('long');
  });
  useButton('select', () => {
    vib.doublePulse();
    setLastPulse('double');
  });

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={32} fill="white" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        Vibration
      </Text>

      <Text x={0} y={60} w={200} font="gothic24Bold" color="white" align="center">
        Last: {lastPulse}
      </Text>

      <Text x={0} y={120} w={200} font="gothic14" color="lightGray" align="center">
        UP = short pulse
      </Text>
      <Text x={0} y={140} w={200} font="gothic14" color="lightGray" align="center">
        DOWN = long pulse
      </Text>
      <Text x={0} y={160} w={200} font="gothic14" color="lightGray" align="center">
        SELECT = double pulse
      </Text>
    </Group>
  );
}
