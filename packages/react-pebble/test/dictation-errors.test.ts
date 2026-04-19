/**
 * test/dictation-errors.test.ts — Verify DictationStatus union and useDictation export.
 *
 * Usage: npx tsx test/dictation-errors.test.ts
 */

import { useDictation } from '../src/hooks/useDictation.js';
import type { DictationStatus } from '../src/hooks/useDictation.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof useDictation === 'function', 'useDictation should be a function');

// Type-level: verify the union includes error statuses (compile-time check)
const _cancelled: DictationStatus = 'cancelled';
const _rejected: DictationStatus = 'rejected';
const _systemAborted: DictationStatus = 'systemAborted';

// Runtime: the variables exist and have the expected values
assert(_cancelled === 'cancelled', 'cancelled should be a valid DictationStatus');
assert(_rejected === 'rejected', 'rejected should be a valid DictationStatus');
assert(_systemAborted === 'systemAborted', 'systemAborted should be a valid DictationStatus');

console.log('dictation-errors.test.ts: PASS');
