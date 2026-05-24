/**
 * examples/hook-detection-fixture.tsx — fixture for hook-detection integration test.
 *
 * Imports a real react-pebble hook (useTime) and defines a local helper
 * named `useMyHelper` that is shaped like a hook. The new detector must
 * record useTime but ignore useMyHelper. See test/hook-detection-integration.test.ts
 * and docs/adr/0003-hook-detection-in-analyzer.md.
 */

import { Text } from '../src/components/index.js';
import { useTime } from '../src/hooks/index.js';

function useMyHelper(): number {
  return 42;
}

export default function Face() {
  useMyHelper();
  const t = useTime('minute');
  return (
    <Text x={0} y={0} w={200} font="gothic18Bold" color="white">
      {String(t.getHours())}
    </Text>
  );
}
