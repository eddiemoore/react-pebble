/**
 * test/pkjs-appglance.test.ts — Unit test for PKJS appGlanceReload fallback.
 *
 * Verifies that when useAppGlance is in hooksUsed, the emitted PKJS contains
 * the _rpGlanceUpdate handler calling Pebble.appGlanceReload, and that it is
 * absent when useAppGlance is not used.
 *
 * Usage: npx tsx test/pkjs-appglance.test.ts
 */

import { emitPKJS } from '../scripts/emit-pkjs.js';
import type { CompilerIR } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// Minimal IR — no messageInfo, no configInfo
const ir: CompilerIR = {} as unknown as CompilerIR;

// -----------------------------------------------------------------------
// With useAppGlance: should emit _rpGlanceUpdate + appGlanceReload
// -----------------------------------------------------------------------
const withGlance = emitPKJS({ ir, hooksUsed: ['useAppGlance'] });

assert(
  withGlance.includes('_rpGlanceUpdate'),
  'PKJS with useAppGlance must contain _rpGlanceUpdate handler',
);
assert(
  withGlance.includes('appGlanceReload'),
  'PKJS with useAppGlance must contain appGlanceReload call',
);
assert(
  withGlance.includes('appmessage'),
  'PKJS with useAppGlance must register an appmessage listener',
);

// -----------------------------------------------------------------------
// Without useAppGlance: should NOT emit _rpGlanceUpdate
// -----------------------------------------------------------------------
const withoutGlance = emitPKJS({ ir });

assert(
  !withoutGlance.includes('_rpGlanceUpdate'),
  'PKJS without useAppGlance must not contain _rpGlanceUpdate',
);
assert(
  !withoutGlance.includes('appGlanceReload'),
  'PKJS without useAppGlance must not contain appGlanceReload',
);

console.log('pkjs-appglance.test.ts: PASS');
