/**
 * examples/text-flow.tsx — TextFlow demo for round displays
 *
 * Demonstrates:
 *   - TextFlow component with flowAroundDisplay
 *   - Text that adjusts line width for round screens
 *   - Works on both round and rectangular displays
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, TextFlow } from '../src/components/index.js';

function TextFlowApp() {
  const longText =
    'The Pebble smartwatch was a groundbreaking device that proved ' +
    'wearable technology could be both functional and stylish. With its ' +
    'e-paper display and week-long battery life, it changed how people ' +
    'thought about wrist computers. Now with Alloy, the spirit lives on.';

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      <Rect x={0} y={0} w={200} h={28} fill="white" />
      <Text x={4} y={4} w={192} font="gothic18Bold" color="black">
        Text Flow
      </Text>

      {/* Flowing text that adapts to display shape */}
      <TextFlow
        x={10} y={36} w={180} h={180}
        font="gothic18" color="white"
        flowAroundDisplay
      >
        {longText}
      </TextFlow>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<TextFlowApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('text-flow example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
