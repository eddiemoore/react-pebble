/**
 * test/dialog.test.ts — Verify Dialog export exists.
 *
 * Usage: npx tsx test/dialog.test.ts
 */

import { Dialog } from '../src/components/Dialog.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof Dialog === 'function', 'Dialog should be a function');

console.log('dialog.test.ts: PASS');
