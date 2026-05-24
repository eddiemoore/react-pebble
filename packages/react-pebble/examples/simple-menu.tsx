/**
 * examples/simple-menu.tsx — SimpleMenu flat list demo
 *
 * Demonstrates:
 *   - SimpleMenu component for quick selection
 *   - Flat item list without manual section setup
 *   - Subtitle support
 *   - onSelect callbacks
 */

import { Text, Rect, Group, SimpleMenu } from '../src/components/index.js';
import { useState } from '../src/hooks/index.js';

export default function SimpleMenuApp() {
  const [selected, setSelected] = useState('None');

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Simple Menu
      </Text>

      <SimpleMenu
        items={[
          { title: 'Inbox', subtitle: '3 new messages', onSelect: () => setSelected('Inbox') },
          { title: 'Sent', subtitle: '12 items', onSelect: () => setSelected('Sent') },
          { title: 'Drafts', subtitle: '1 draft', onSelect: () => setSelected('Drafts') },
          { title: 'Trash', onSelect: () => setSelected('Trash') },
          { title: 'Settings', onSelect: () => setSelected('Settings') },
        ]}
        highlightColor="cyan"
      />

      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        Selected: {selected}
      </Text>
    </Group>
  );
}
