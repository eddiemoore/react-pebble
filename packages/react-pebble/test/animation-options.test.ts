/**
 * test/animation-options.test.ts — Verify useAnimation export exists.
 *
 * Usage: npx tsx test/animation-options.test.ts
 */

import { useAnimation } from '../src/hooks/useAnimation.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof useAnimation === 'function', 'useAnimation should be a function');

console.log('animation-options.test.ts: PASS');
