/**
 * examples/tasks.tsx — Task list app using all compiler features.
 *
 * Demonstrates: string enum state (view switching), numeric state
 * (selected index), boolean state (task completion), button handlers,
 * structural branching, skin reactivity, and text mutation — all
 * compiled to piu with zero runtime allocation.
 *
 * Simplified from jira-list: no async loading, no .map(), explicit
 * items so the compiler can handle everything statically.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

type View = 'list' | 'detail';

function TaskApp() {
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState(0);

  useButton('up', () => setSelected((s: number) => s - 1));
  useButton('down', () => setSelected((s: number) => s + 1));
  useButton('select', () => setView('detail'));
  useButton('back', () => setView('list'));

  if (view === 'detail') {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="blue" />
        <Text x={0} y={16} w={200} font="gothic18Bold" color="white" align="center">
          Task Detail
        </Text>
        <Text x={10} y={60} w={180} font="gothic18" color="white">
          Task #{selected.toString()}
        </Text>
        <Text x={10} y={90} w={180} font="gothic14" color="lightGray">
          Status: In Progress
        </Text>
        <Text x={10} y={120} w={180} font="gothic14" color="lightGray">
          Priority: High
        </Text>
        <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
          BACK to return
        </Text>
      </Group>
    );
  }

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Header */}
      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={140} font="gothic18Bold" color="black">
        My Tasks
      </Text>
      <Text x={148} y={4} w={48} font="gothic14" color="darkGray" align="right">
        {selected + 1}/3
      </Text>

      {/* Task items — explicit, not .map() */}
      <Rect x={0} y={30} w={200} h={60}
            fill={selected === 0 ? 'darkGray' : 'black'} />
      <Text x={8} y={34} w={184} font="gothic14Bold" color="white">
        Fix login bug
      </Text>
      <Text x={8} y={52} w={184} font="gothic14" color="lightGray">
        In Progress
      </Text>

      <Rect x={0} y={92} w={200} h={60}
            fill={selected === 1 ? 'darkGray' : 'black'} />
      <Text x={8} y={96} w={184} font="gothic14Bold" color="white">
        Update docs
      </Text>
      <Text x={8} y={114} w={184} font="gothic14" color="lightGray">
        To Do
      </Text>

      <Rect x={0} y={154} w={200} h={60}
            fill={selected === 2 ? 'darkGray' : 'black'} />
      <Text x={8} y={158} w={184} font="gothic14Bold" color="white">
        Deploy v2
      </Text>
      <Text x={8} y={176} w={184} font="gothic14" color="lightGray">
        Done
      </Text>

      <Text x={0} y={216} w={200} font="gothic14" color="darkGray" align="center">
        UP/DOWN nav, SELECT detail
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<TaskApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('tasks example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
