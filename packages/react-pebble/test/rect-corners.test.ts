/**
 * test/rect-corners.test.ts — Per-corner border radius in the C emitter.
 *
 * Verifies that borderRadiusTL: 8 (with others undefined) emits
 * GCornerTopLeft in the corner mask.
 *
 * Usage: npx tsx test/rect-corners.test.ts
 */

import { emitC } from '../scripts/emit-c.js';
import type { CompilerIR } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

function makeIR(overrides: Partial<CompilerIR> = {}): CompilerIR {
  return {
    tree: [],
    platform: { name: 'basalt', width: 144, height: 168 },
    stateSlots: [],
    timeDeps: [],
    stateDeps: new Map(),
    skinDeps: new Map(),
    branches: new Map(),
    conditionalChildren: [],
    listInfo: null,
    listSlotLabels: new Set(),
    timeReactiveGraphics: [],
    animatedElements: [],
    messageInfo: null,
    configInfo: null,
    hasButtons: false,
    hasTimeDeps: false,
    hasStateDeps: false,
    hasBranches: false,
    hasConditionals: false,
    hasSkinDeps: false,
    hasList: false,
    hasAnimatedElements: false,
    hasImages: false,
    imageResources: [],
    ...overrides,
  } as unknown as CompilerIR;
}

// -----------------------------------------------------------------------
// Single corner: borderRadiusTL only
// -----------------------------------------------------------------------
const ir = makeIR({
  tree: [{
    type: 'rect',
    x: 0, y: 0, w: 50, h: 50,
    fill: '#FF0000',
    borderRadiusTL: 8,
  }],
});

const out = emitC(ir);

assert(
  out.includes('GCornerTopLeft'),
  'borderRadiusTL: 8 should emit GCornerTopLeft in corner mask',
);

assert(
  !out.includes('GCornersAll'),
  'Single corner radius should not emit GCornersAll',
);

assert(
  out.includes('8'),
  'Output should contain the radius value 8',
);

console.log('rect-corners.test.ts: PASS');
