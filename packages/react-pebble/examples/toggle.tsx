/**
 * examples/toggle.tsx — Minimal conditional rendering test.
 *
 * A boolean state toggles between two views on select button press.
 * Used to validate the v4 compiler's branch detection + piu .visible toggling.
 */

import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

export default function Toggle() {
  const [on, setOn] = useState(false);

  useButton('select', () => setOn((v: boolean) => !v));

  if (on) {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="green" />
        <Text x={0} y={90} w={200} font="bitham42Bold" color="white" align="center">
          ON
        </Text>
        <Text x={0} y={180} w={200} font="gothic14" color="white" align="center">
          SELECT to toggle
        </Text>
      </Group>
    );
  }

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="red" />
      <Text x={0} y={90} w={200} font="bitham42Bold" color="white" align="center">
        OFF
      </Text>
      <Text x={0} y={180} w={200} font="gothic14" color="white" align="center">
        SELECT to toggle
      </Text>
    </Group>
  );
}
