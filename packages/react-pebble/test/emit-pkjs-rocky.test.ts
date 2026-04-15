/**
 * test/emit-pkjs-rocky.test.ts — Unit test for Rocky-target PKJS emission.
 *
 * Verifies that when compile target is 'rocky', the useMessage path emits
 * Pebble.postMessage (native JS objects) instead of Pebble.sendAppMessage +
 * JSON.stringify wrapping (AppMessage dictionary protocol).
 *
 * Usage: npx tsx test/emit-pkjs-rocky.test.ts
 */

import { emitPKJS } from '../scripts/emit-pkjs.js';
import type { CompilerIR } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// Minimal IR with a useMessage call (no mock URL — simpler non-proxy path)
const ir: CompilerIR = {
  messageInfo: { key: 'items', mockDataArrayName: null, mockDataSource: null },
} as unknown as CompilerIR;

// -----------------------------------------------------------------------
// Rocky target: should emit postMessage, no sendAppMessage/stringify
// -----------------------------------------------------------------------
const rockyOut = emitPKJS({ ir, target: 'rocky' });

assert(
  rockyOut.includes('Pebble.postMessage({ "items": '),
  'Rocky PKJS must emit Pebble.postMessage({ "items": ... })'
);
assert(
  !rockyOut.includes('JSON.stringify(yourData)'),
  'Rocky PKJS must not JSON.stringify the useMessage payload'
);
assert(
  !/Pebble\.sendAppMessage\(\s*\{\s*"items"/.test(rockyOut),
  'Rocky PKJS must not call sendAppMessage for the useMessage key'
);

// -----------------------------------------------------------------------
// Alloy target: must keep sendAppMessage + JSON.stringify (regression guard)
// -----------------------------------------------------------------------
const alloyOut = emitPKJS({ ir, target: 'alloy' });

assert(
  alloyOut.includes('Pebble.sendAppMessage'),
  'Alloy PKJS must still use sendAppMessage (not regressed)'
);
assert(
  alloyOut.includes('JSON.stringify(yourData)'),
  'Alloy PKJS must still JSON.stringify the useMessage payload'
);
assert(
  !alloyOut.includes('Pebble.postMessage('),
  'Alloy PKJS must not use postMessage'
);

// -----------------------------------------------------------------------
// Default (no target): treat as alloy (back-compat with existing callers)
// -----------------------------------------------------------------------
const defaultOut = emitPKJS({ ir });
assert(
  defaultOut.includes('Pebble.sendAppMessage'),
  'Default PKJS (no target) must behave like Alloy'
);

console.log('emit-pkjs-rocky.test.ts: PASS');
