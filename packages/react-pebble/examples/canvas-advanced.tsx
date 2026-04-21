/**
 * examples/canvas-advanced.tsx — Advanced Canvas drawing primitives.
 *
 * Demonstrates the extended CanvasDrawContext operations:
 *   - drawPixel, strokeRect, strokeCircle, drawArc
 *   - setStrokeWidth, setAntialiased
 *   - drawPath, fillPath
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Canvas } from '../src/index.js';
import type { CanvasDrawContext } from '../src/components/index.js';

function CanvasAdvancedApp() {
  const drawDemo = (ctx: CanvasDrawContext) => {
    // 1. Draw pixel grid pattern
    for (let px = 5; px < 30; px += 3) {
      for (let py = 5; py < 30; py += 3) {
        ctx.drawPixel('cyan', px, py);
      }
    }

    // 2. Stroke rectangles with different stroke widths
    ctx.setStrokeWidth(1);
    ctx.strokeRect('white', 35, 5, 30, 20);
    ctx.setStrokeWidth(3);
    ctx.strokeRect('yellow', 70, 5, 30, 20);

    // 3. Stroke circles
    ctx.setStrokeWidth(1);
    ctx.strokeCircle('green', 20, 50, 12);
    ctx.setStrokeWidth(3);
    ctx.strokeCircle('red', 55, 50, 12);

    // 4. Draw arcs (clock-style: 0 = north, clockwise)
    ctx.setStrokeWidth(3);
    ctx.drawArc('orange', 95, 50, 15, 0, 90);   // quarter arc top-right
    ctx.drawArc('cyan', 95, 50, 15, 90, 270);    // half arc bottom

    // 5. Draw path (open triangle outline)
    ctx.setStrokeWidth(1);
    ctx.drawPath([
      { x: 10, y: 80 },
      { x: 30, y: 100 },
      { x: 50, y: 80 },
    ], 'white', true);

    // 6. Fill path (solid polygon)
    ctx.fillPath([
      { x: 60, y: 80 },
      { x: 80, y: 100 },
      { x: 100, y: 80 },
    ], 'magenta');

    // 7. Combined: filled circle with stroked outline
    ctx.drawCircle('blue', 140, 90, 15);
    ctx.strokeCircle('white', 140, 90, 15);

    // 8. Anti-aliased toggle (visual difference on real hardware)
    ctx.setAntialiased(false);
    ctx.drawLine('yellow', 110, 110, 170, 130, 2);
    ctx.setAntialiased(true);
    ctx.drawLine('green', 110, 115, 170, 135, 2);
  };

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={4} w={200} font="gothic18Bold" color="white" align="center">
        Canvas Advanced
      </Text>
      <Canvas x={5} y={28} w={190} h={150} onDraw={drawDemo} />
      <Text x={0} y={185} w={200} font="gothic14" color="lightGray" align="center">
        Pixel, stroke, arc, path ops
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<CanvasAdvancedApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('canvas-advanced example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
