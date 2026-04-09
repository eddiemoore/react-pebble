/**
 * examples/async-list.tsx — Runtime data loading via useMessage hook.
 *
 * At compile time: renders with mockData (via SETTLE_MS).
 * At runtime: phone sends real data, watch updates the list.
 *
 * Deploy: SETTLE_MS=200 ./scripts/deploy.sh async-list
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useMessage, useState } from '../src/hooks/index.js';

interface Issue {
  title: string;
  status: string;
}

const MOCK_ISSUES: Issue[] = [
  { title: 'Deploy hotfix', status: 'HIGH' },
  { title: 'Review PR #42', status: 'MED' },
  { title: 'Update docs', status: 'LOW' },
  { title: 'Fix auth bug', status: 'HIGH' },
];

function AsyncList() {
  const { data, loading } = useMessage<Issue[]>({
    key: 'items',
    mockData: MOCK_ISSUES,
    mockDelay: 100,
  });

  if (loading || !data) {
    return (
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={100} w={200} font="gothic24" color="lightGray" align="center">
          Loading...
        </Text>
      </Group>
    );
  }

  const visible = data.slice(0, 3);

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Live Data
      </Text>
      {visible.map((item, i) => (
        <Group key={item.title} y={32 + i * 60}>
          <Text x={8} y={4} w={184} font="gothic18Bold" color="white">
            {item.title}
          </Text>
          <Text x={8} y={26} w={184} font="gothic14" color="lightGray">
            {item.status}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<AsyncList />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('async-list (mock)', app.drawLog.length, 'draw calls');
  }
  return app;
}

export default main;
