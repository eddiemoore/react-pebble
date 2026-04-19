/**
 * test/scrollable-paging.test.ts — Verify Scrollable export exists.
 *
 * Usage: npx tsx test/scrollable-paging.test.ts
 */

import { Scrollable } from '../src/components/Scrollable.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof Scrollable === 'function', 'Scrollable should be a function');

console.log('scrollable-paging.test.ts: PASS');
