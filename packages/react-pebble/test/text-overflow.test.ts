/**
 * test/text-overflow.test.ts — Text overflow modes in the C emitter.
 *
 * Verifies that overflow: 'trailingEllipsis' → GTextOverflowModeTrailingEllipsis
 * and overflow: 'fill' → GTextOverflowModeFill.
 *
 * Usage: npx tsx test/text-overflow.test.ts
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
// trailingEllipsis
// -----------------------------------------------------------------------
const ellipsisIR = makeIR({
  tree: [{
    type: 'text',
    x: 0, y: 0, w: 100, h: 20,
    text: 'Hello',
    font: 'gothic18',
    color: '#000000',
    align: 'left',
    overflow: 'trailingEllipsis',
  }],
});

const ellipsisOut = emitC(ellipsisIR);
assert(
  ellipsisOut.includes('GTextOverflowModeTrailingEllipsis'),
  'trailingEllipsis overflow should emit GTextOverflowModeTrailingEllipsis',
);

// -----------------------------------------------------------------------
// fill
// -----------------------------------------------------------------------
const fillIR = makeIR({
  tree: [{
    type: 'text',
    x: 0, y: 0, w: 100, h: 20,
    text: 'Hello',
    font: 'gothic18',
    color: '#000000',
    align: 'left',
    overflow: 'fill',
  }],
});

const fillOut = emitC(fillIR);
assert(
  fillOut.includes('GTextOverflowModeFill'),
  'fill overflow should emit GTextOverflowModeFill',
);

console.log('text-overflow.test.ts: PASS');
