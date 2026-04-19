/**
 * test/window-bg.test.ts — Verify Window export exists.
 *
 * Usage: npx tsx test/window-bg.test.ts
 */

import { Window } from '../src/components/Window.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof Window === 'function', 'Window should be a function');

console.log('window-bg.test.ts: PASS');
