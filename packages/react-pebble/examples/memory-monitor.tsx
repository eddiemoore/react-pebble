/**
 * examples/memory-monitor.tsx — Runtime memory introspection.
 *
 * Demonstrates:
 *   - useMemoryStats(): live heap used / free / largest-free figures.
 *   - useMemoryPressure(): subscribe to Rocky.js `memorypressure` events.
 *
 * Useful for debugging OOMs on constrained platforms (24 kB aplite,
 * 64 kB basalt/chalk).
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import { useState, useMemoryStats, useMemoryPressure } from '../src/hooks/index.js';

function MemoryMonitor() {
  const { used, free, largestFree } = useMemoryStats(500);
  const [lastPressure, setLastPressure] = useState<string>('none');

  useMemoryPressure((level) => setLastPressure(level));

  const total = used + free;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={20} w={200} font="gothic24Bold" color="white" align="center">
        Memory
      </Text>
      <Text x={0} y={65} w={200} font="bitham42Bold" color="55FFFF" align="center">
        {pct}%
      </Text>
      <Text x={0} y={130} w={200} font="gothic18" color="white" align="center">
        used: {used}
      </Text>
      <Text x={0} y={155} w={200} font="gothic18" color="white" align="center">
        free: {free}
      </Text>
      <Text x={0} y={180} w={200} font="gothic18" color="AAAAAA" align="center">
        largest: {largestFree}
      </Text>
      <Text x={0} y={205} w={200} font="gothic14" color="FFAA00" align="center">
        pressure: {lastPressure}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<MemoryMonitor />, { poco: PocoCtor });
}

export default main;
