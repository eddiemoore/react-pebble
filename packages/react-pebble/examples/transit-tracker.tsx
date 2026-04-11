/**
 * examples/transit-tracker.tsx — Transit departure tracker.
 *
 * Exercises: useButton (4-button nav), useState (view + selection),
 * list/detail branching, multi-label list items, circles, skin reactivity.
 *
 * Deploy: ./scripts/deploy.sh transit-tracker
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Circle, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

const ROUTES = [
  { id: 'F', name: 'F-Line', color: 'red', dir: 'West to Beach', mins: 2 },
  { id: 'L', name: 'L-Train', color: 'blue', dir: 'South to Airport', mins: 5 },
  { id: 'N', name: 'N-Bus', color: 'green', dir: 'North to Park', mins: 1 },
  { id: '7', name: '7-Express', color: 'orange', dir: 'East to Downtown', mins: 8 },
  { id: 'K', name: 'K-Rail', color: 'cyan', dir: 'West to Coast', mins: 3 },
];

function TransitTracker() {
  const [sel, setSel] = useState(0);
  const [view, setView] = useState('list');

  useButton('up', () => setSel((s: number) => Math.max(0, s - 1)));
  useButton('down', () => setSel((s: number) => Math.min(4, s + 1)));
  useButton('select', () => setView('detail'));
  useButton('back', () => setView('list'));

  const route = ROUTES[sel] ?? ROUTES[0]!;

  if (view === 'detail') {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="blue" />
        <Text x={0} y={10} w={200} font="gothic28Bold" color="white" align="center">
          {route.name}
        </Text>
        <Text x={0} y={44} w={200} font="gothic14" color="lightGray" align="center">
          {route.dir}
        </Text>
        <Rect x={20} y={64} w={160} h={1} fill="white" />
        <Text x={10} y={74} w={180} font="gothic14" color="lightGray">
          Next departure:
        </Text>
        <Text x={20} y={96} w={160} font="bitham42Bold" color="white">
          {route.mins} min
        </Text>
        <Rect x={20} y={160} w={160} h={1} fill="white" />
        <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
          BACK to return
        </Text>
      </Group>
    );
  }

  const start = Math.max(0, Math.min(sel, ROUTES.length - 3));
  const visible = ROUTES.slice(start, start + 3);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={28} fill="darkGray" />
      <Text x={8} y={4} w={130} font="gothic18Bold" color="white">
        Central Stn
      </Text>
      <Text x={138} y={6} w={54} font="gothic14" color="lightGray" align="right">
        {sel + 1}/{ROUTES.length}
      </Text>
      {visible.map((r, i) => (
        <Group key={r.id} y={32 + i * 64}>
          <Rect x={4} y={2} w={192} h={58} fill={i === 0 ? 'darkGray' : 'black'} />
          <Circle x={10} y={15} r={12} fill={r.color} />
          <Text x={40} y={8} w={100} font="gothic18Bold" color="white">
            {r.name}
          </Text>
          <Text x={40} y={30} w={100} font="gothic14" color="lightGray">
            {r.dir}
          </Text>
          <Text x={142} y={12} w={50} font="gothic18Bold" color="cyan" align="right">
            {r.mins} min
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<TransitTracker />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('transit-tracker (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
