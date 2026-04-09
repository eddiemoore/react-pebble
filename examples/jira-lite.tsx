/**
 * examples/jira-lite.tsx — Flagship demo combining all compiler features.
 *
 * A simplified JIRA-style issue tracker with:
 * - String enum state (list/detail view switching)
 * - Numeric state (selected index / scroll position)
 * - Multi-label list items (key + summary per issue)
 * - Selection highlight (first visible item)
 * - Structural branching (list ↔ detail views)
 * - Counter text ("1/5" updates on scroll)
 * - 4-button navigation (UP/DOWN/SELECT/BACK)
 * - Circle for priority indicator
 *
 * All compiled to piu with zero runtime allocation.
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Circle, Group } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

type View = 'list' | 'detail';

const ISSUES = [
  { key: 'PROJ-1', summary: 'Fix login timeout', status: 'In Progress' },
  { key: 'PROJ-2', summary: 'Update dependencies', status: 'To Do' },
  { key: 'PROJ-3', summary: 'Add dark mode', status: 'In Review' },
  { key: 'PROJ-4', summary: 'API rate limiting', status: 'In Progress' },
  { key: 'PROJ-5', summary: 'Refactor auth', status: 'To Do' },
];

function JiraLite() {
  const [view, setView] = useState<View>('list');
  const [sel, setSel] = useState(0);

  useButton('up', () => setSel((s: number) => s - 1));
  useButton('down', () => setSel((s: number) => s + 1));
  useButton('select', () => setView('detail'));
  useButton('back', () => setView('list'));

  if (view === 'detail') {
    const issue = ISSUES[sel] ?? ISSUES[0]!;
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="blue" />
        <Text x={0} y={8} w={200} font="gothic18Bold" color="white" align="center">
          {issue.key}
        </Text>
        <Text x={10} y={50} w={180} font="gothic24Bold" color="white">
          {issue.summary}
        </Text>
        <Circle x={10} y={110} r={8} fill="green" />
        <Text x={30} y={106} w={160} font="gothic18" color="white">
          {issue.status}
        </Text>
        <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
          BACK to return
        </Text>
      </Group>
    );
  }

  const visible = ISSUES.slice(sel, sel + 3);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={140} font="gothic18Bold" color="black">
        JIRA Issues
      </Text>
      <Text x={144} y={4} w={52} font="gothic14" color="darkGray" align="right">
        {sel + 1}/{ISSUES.length}
      </Text>
      {visible.map((issue, i) => (
        <Group key={issue.key} y={32 + i * 62}>
          <Rect x={0} y={0} w={200} h={60}
                fill={i === 0 ? 'darkGray' : 'black'} />
          <Text x={8} y={4} w={184} font="gothic18Bold" color="white">
            {issue.key}
          </Text>
          <Text x={8} y={26} w={184} font="gothic14" color="lightGray">
            {issue.summary}
          </Text>
          <Text x={8} y={42} w={184} font="gothic14" color="cyan">
            {issue.status}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<JiraLite />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('jira-lite (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
