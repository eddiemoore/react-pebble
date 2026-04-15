/**
 * test/config-checkboxgroup.test.ts — ConfigCheckboxGroup wire format.
 *
 *   1. emit-c ClaySettings adds `bool <key>[N];`
 *   2. emit-c prv_default_settings initializes slots per default membership
 *   3. emit-c prv_inbox_received reads N slots via pointer arithmetic
 *   4. emit-pkjs emits __configOptions table + array-to-int[] conversion
 *
 * Usage: npx tsx test/config-checkboxgroup.test.ts
 */

import { emitC } from '../scripts/emit-c.js';
import { emitPKJS } from '../scripts/emit-pkjs.js';
import type { CompilerIR, IRConfigKey } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function makeIR(overrides: Partial<CompilerIR> = {}): CompilerIR {
  const key: IRConfigKey = {
    key: 'metrics',
    label: 'Show metrics',
    type: 'checkboxgroup',
    options: ['pace', 'hr', 'cal'],
    default: ['pace', 'hr'],
  };
  return {
    tree: [],
    platform: { name: 'basalt', width: 144, height: 168 },
    stateSlots: [],
    timeDeps: new Map(),
    stateDeps: new Map(),
    skinDeps: new Map(),
    branches: new Map(),
    conditionalChildren: [],
    listInfo: null,
    listSlotLabels: new Set(),
    timeReactiveGraphics: [],
    animatedElements: [],
    messageInfo: null,
    configInfo: {
      keys: [key],
      url: 'data:fake',
      appName: null,
      sectionTitles: [],
    },
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
    timeGranularity: null,
    ...overrides,
  } as unknown as CompilerIR;
}

// C emitter
const cOut = emitC(makeIR());

assert(
  cOut.includes('bool metrics[3];'),
  'ClaySettings must declare bool metrics[3]',
);
assert(
  cOut.includes('settings.metrics[0] = true;'),
  "Default for 'pace' (included) must be true",
);
assert(
  cOut.includes('settings.metrics[1] = true;'),
  "Default for 'hr' (included) must be true",
);
assert(
  cOut.includes('settings.metrics[2] = false;'),
  "Default for 'cal' (not included) must be false",
);
assert(
  /dict_find\(iter,\s*MESSAGE_KEY_metrics\s*\+\s*i\)/.test(cOut),
  'prv_inbox_received must use pointer-arithmetic dict_find(iter, MESSAGE_KEY_metrics + i)',
);
assert(
  cOut.includes('for (int i = 0; i < 3; i++)'),
  'prv_inbox_received must loop i from 0 to N-1',
);

// PKJS emitter
const pkjsOut = emitPKJS({
  ir: makeIR(),
  configUrl: 'data:fake',
});

assert(
  pkjsOut.includes('var __configOptions'),
  'PKJS must emit __configOptions lookup table',
);
assert(
  pkjsOut.includes('"metrics":'),
  'PKJS __configOptions must list "metrics"',
);
assert(
  /\["pace",\s*"hr",\s*"cal"\]/.test(pkjsOut),
  'PKJS __configOptions["metrics"] must equal ["pace","hr","cal"]',
);
assert(
  pkjsOut.includes('Array.isArray(val)'),
  'PKJS must branch on Array.isArray(val) before the generic else',
);
assert(
  /msg\[key\]\s*=\s*out/.test(pkjsOut),
  'PKJS must emit msg[key] = out (single-key array value, not per-slot expansion)',
);

console.log('config-checkboxgroup.test.ts: PASS');
