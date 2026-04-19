/**
 * examples/platform-switch.tsx — PlatformSwitch conditional rendering demo.
 *
 * Demonstrates:
 *   - PlatformSwitch component for platform-specific UI
 *   - usePlatform hook for querying device capabilities
 *   - Different layouts for color vs BW and round vs rect screens
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Group, Rect, PlatformSwitch } from '../src/components/index.js';
import { usePlatform } from '../src/hooks/index.js';

function PlatformSwitchDemo() {
  const { width, height, platform, isColor, isRound } = usePlatform();

  return (
    <Group>
      <Rect x={0} y={0} w={width} h={height} fill="black" />

      {/* Title */}
      <Text x={0} y={4} w={width} font="gothic18Bold" color="white" align="center">
        Platform: {platform}
      </Text>

      {/* Platform info */}
      <Text x={8} y={30} w={width - 16} font="gothic14" color="lightGray">
        {width}x{height} {isColor ? 'color' : 'BW'} {isRound ? 'round' : 'rect'}
      </Text>

      {/* Shape-specific content */}
      <PlatformSwitch
        round={
          <Group>
            <Rect x={30} y={60} w={width - 60} h={40} fill="blue" borderRadius={8} />
            <Text x={30} y={68} w={width - 60} font="gothic18" color="white" align="center">
              Round layout
            </Text>
            <Text x={30} y={110} w={width - 60} font="gothic14" color="lightGray" align="center">
              Centered for Chalk
            </Text>
          </Group>
        }
        rect={
          <Group>
            <Rect x={4} y={60} w={width - 8} h={40} fill="darkGreen" />
            <Text x={8} y={68} w={width - 16} font="gothic18" color="white">
              Rectangular layout
            </Text>
            <Text x={8} y={110} w={width - 16} font="gothic14" color="lightGray">
              Full-width for Basalt/Diorite
            </Text>
          </Group>
        }
      />

      {/* Color-specific content */}
      <PlatformSwitch
        color={
          <Group>
            <Rect x={8} y={140} w={40} h={20} fill="red" borderRadius={4} />
            <Rect x={56} y={140} w={40} h={20} fill="green" borderRadius={4} />
            <Rect x={104} y={140} w={40} h={20} fill="blue" borderRadius={4} />
            <Text x={8} y={168} w={width - 16} font="gothic14" color="white">
              Color display: full palette
            </Text>
          </Group>
        }
        bw={
          <Group>
            <Rect x={8} y={140} w={40} h={20} fill="white" />
            <Rect x={56} y={140} w={40} h={20} fill="lightGray" />
            <Rect x={104} y={140} w={40} h={20} fill="darkGray" />
            <Text x={8} y={168} w={width - 16} font="gothic14" color="white">
              BW display: grayscale only
            </Text>
          </Group>
        }
      />
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<PlatformSwitchDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('platform-switch example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
