/**
 * examples/canvas-demo.tsx — Custom drawing with the Canvas component.
 *
 * Demonstrates:
 *   - Canvas component (Piu Port with custom Poco drawing)
 *   - Drawing a speedometer/gauge with arcs, lines, and text
 *   - useButton to change the value
 *   - Combining Canvas with standard components
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Canvas } from '../src/index.js';
import type { CanvasDrawContext } from '../src/components/index.js';
import { useState, useButton } from '../src/hooks/index.js';

function GaugeApp() {
  const [speed, setSpeed] = useState(45);

  useButton('up', () => setSpeed((s) => Math.min(s + 5, 120)));
  useButton('down', () => setSpeed((s) => Math.max(s - 5, 0)));

  const drawGauge = (ctx: CanvasDrawContext) => {
    const cx = ctx.width / 2;
    const cy = ctx.height / 2 + 10;
    const outerR = 65;
    const innerR = 55;

    // Background arc (dark gray track)
    for (let angle = 135; angle <= 405; angle += 2) {
      const rad = (angle * Math.PI) / 180;
      const x1 = Math.round(cx + innerR * Math.cos(rad));
      const y1 = Math.round(cy + innerR * Math.sin(rad));
      const x2 = Math.round(cx + outerR * Math.cos(rad));
      const y2 = Math.round(cy + outerR * Math.sin(rad));
      ctx.drawLine('darkGray', x1, y1, x2, y2);
    }

    // Filled arc based on speed (green → yellow → red)
    const pct = speed / 120;
    const endAngle = 135 + Math.round(pct * 270);
    const color = pct < 0.5 ? 'green' : pct < 0.8 ? 'yellow' : 'red';
    for (let angle = 135; angle <= endAngle; angle += 2) {
      const rad = (angle * Math.PI) / 180;
      const x1 = Math.round(cx + innerR * Math.cos(rad));
      const y1 = Math.round(cy + innerR * Math.sin(rad));
      const x2 = Math.round(cx + outerR * Math.cos(rad));
      const y2 = Math.round(cy + outerR * Math.sin(rad));
      ctx.drawLine(color, x1, y1, x2, y2);
    }

    // Needle
    const needleAngle = 135 + Math.round(pct * 270);
    const needleRad = (needleAngle * Math.PI) / 180;
    const nx = Math.round(cx + (outerR - 5) * Math.cos(needleRad));
    const ny = Math.round(cy + (outerR - 5) * Math.sin(needleRad));
    ctx.drawLine('white', Math.round(cx), Math.round(cy), nx, ny, 2);

    // Center dot
    ctx.drawCircle('white', Math.round(cx), Math.round(cy), 4);

    // Speed text
    const speedStr = speed.toString();
    const tw = ctx.getTextWidth(speedStr, 'bitham42Bold');
    ctx.drawText(speedStr, 'bitham42Bold', 'white', Math.round(cx - tw / 2), Math.round(cy - 28));

    // Unit label
    const unitStr = 'km/h';
    const uw = ctx.getTextWidth(unitStr, 'gothic14');
    ctx.drawText(unitStr, 'gothic14', 'lightGray', Math.round(cx - uw / 2), Math.round(cy + 18));

    // Scale labels
    ctx.drawText('0', 'gothic14', 'lightGray', 14, Math.round(cy + 30));
    ctx.drawText('120', 'gothic14', 'lightGray', ctx.width - 38, Math.round(cy + 30));
  };

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title */}
      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Speedometer
      </Text>

      {/* Gauge canvas */}
      <Canvas x={5} y={22} w={190} h={170} onDraw={drawGauge} />

      {/* Controls hint */}
      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        UP/DOWN to change speed
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<GaugeApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('canvas-demo example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
