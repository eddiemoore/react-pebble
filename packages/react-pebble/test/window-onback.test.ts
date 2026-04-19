/**
 * test/window-onback.test.ts — Verify WindowStack and Window exports exist.
 *
 * Usage: npx tsx test/window-onback.test.ts
 */

import { WindowStack } from '../src/components/WindowStack.js';
import { Window } from '../src/components/Window.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof WindowStack === 'function', 'WindowStack should be a function');
assert(typeof Window === 'function', 'Window should be a function');

console.log('window-onback.test.ts: PASS');
