/**
 * test/emit-c-appmessage.test.ts — AppMessage buffer sizing in the C emitter.
 *
 * Default: emit app_message_open(app_message_inbox_size_maximum(),
 *                                 app_message_outbox_size_maximum())
 *   — matches Pebble's recommended pattern (pebble.h:2179) and avoids the
 *   silent-drop bug when useMessage payloads exceed 512 bytes.
 *
 * Override: when ir.appMessageSizes is set, emit literal byte counts.
 *
 * Usage: npx tsx test/emit-c-appmessage.test.ts
 */

import { emitC } from '../scripts/emit-c.js';
import type { CompilerIR } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
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
    messageInfo: { key: 'items', mockDataArrayName: null, mockDataSource: null },
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
// Default: max-size calls (Pebble-recommended)
// -----------------------------------------------------------------------
const defaultOut = emitC(makeIR());

assert(
  defaultOut.includes('app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum())'),
  'Default C emitter must call app_message_open with the _maximum() helpers',
);
assert(
  !defaultOut.includes('app_message_open(512, 64)'),
  'Default C emitter must not emit the hardcoded 512/64 sizes',
);

// -----------------------------------------------------------------------
// Override: literal numbers
// -----------------------------------------------------------------------
const overrideOut = emitC(makeIR({ appMessageSizes: { inboxSize: 2048, outboxSize: 256 } }));

assert(
  overrideOut.includes('app_message_open(2048, 256)'),
  'Override emitter must pass the literal sizes straight through',
);
assert(
  !overrideOut.includes('app_message_inbox_size_maximum()'),
  'Override emitter must not fall back to the _maximum() helpers',
);

// -----------------------------------------------------------------------
// No messageInfo: should not emit app_message_open at all (C path)
// -----------------------------------------------------------------------
const noMsgOut = emitC(makeIR({ messageInfo: null }));

assert(
  !noMsgOut.includes('app_message_open('),
  'C emitter must not open AppMessage when no messageInfo (unless hasConfig, handled elsewhere)',
);

console.log('emit-c-appmessage.test.ts: PASS');
