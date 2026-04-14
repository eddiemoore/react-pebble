/**
 * examples/smartstrap-demo.tsx — Smartstrap UART accessory communication.
 *
 * useSmartstrap({ service, attribute }) mirrors the Pebble C Smartstrap API:
 * attribute-oriented reads and writes with `onNotify` for responses and
 * unsolicited events. The Vite plugin auto-adds the "smartstrap"
 * capability when this hook is referenced.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import { useSmartstrap, useButton, useState } from '../src/hooks/index.js';

function SmartstrapDemo() {
  const strap = useSmartstrap({ service: 0x1001, attribute: 0x0001, length: 16 });
  const [lastByte, setLastByte] = useState(0);

  useButton('up', () => strap.read());
  useButton('down', () => strap.write(new Uint8Array([0x42])));

  // Subscribe to responses once.
  useState(() => {
    strap.onNotify((buf) => {
      if (buf.byteLength > 0) setLastByte(buf[0] ?? 0);
    });
    return 0;
  });

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={12} w={200} font="gothic18Bold" color="white" align="center">
        Smartstrap
      </Text>
      <Text x={4} y={50} w={192} font="gothic14" color="AAFFAA">
        Available: {strap.available ? 'yes' : 'no'}
      </Text>
      <Text x={4} y={80} w={192} font="gothic14" color="white">
        Last byte: 0x{lastByte.toString(16)}
      </Text>
      <Text x={4} y={130} w={192} font="gothic14" color="FFAA55">
        UP: read
      </Text>
      <Text x={4} y={154} w={192} font="gothic14" color="FFAA55">
        DOWN: write 0x42
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<SmartstrapDemo />, { poco: PocoCtor });
}

export default main;
