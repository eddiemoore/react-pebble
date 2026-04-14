/**
 * examples/launch-lifecycle.tsx — App lifecycle hooks.
 *
 * Demonstrates:
 *   - useLaunchInfo() — read the launch reason + launch_get_args()
 *     (useful when the app was woken from a timeline pin's `launchCode`
 *     or from a wakeup cookie).
 *   - useExitReason() — tell the launcher how the app exited
 *     (e.g. "actionPerformed" → launcher returns to previous screen).
 *   - useNotification() — push a phone-side simple notification.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Window } from '../src/index.js';
import { useLaunchInfo, useExitReason, useNotification } from '../src/hooks/index.js';

function LifecycleApp() {
  const { reason, args } = useLaunchInfo();
  const { setReason } = useExitReason();
  const { show } = useNotification();

  return (
    <Window
      onSelect={() => {
        show({ title: 'Lifecycle', body: 'Exiting cleanly' });
        setReason('actionPerformed');
      }}
      onBack={() => setReason('default')}
    >
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
          Launch Info
        </Text>
        <Text x={0} y={90} w={200} font="gothic18" color="55FFFF" align="center">
          reason: {reason}
        </Text>
        <Text x={0} y={120} w={200} font="gothic18" color="55FFFF" align="center">
          args: {args}
        </Text>
        <Text x={0} y={180} w={200} font="gothic14" color="AAAAAA" align="center">
          SELECT: notify + exit
        </Text>
      </Group>
    </Window>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<LifecycleApp />, { poco: PocoCtor });
}

export default main;
