/**
 * test/one-click-action.test.ts — Verify useOneClickAction export exists.
 *
 * Usage: npx tsx test/one-click-action.test.ts
 */

import { useOneClickAction } from '../src/hooks/useOneClickAction.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof useOneClickAction === 'function', 'useOneClickAction should be a function');

console.log('one-click-action.test.ts: PASS');
