/**
 * test/platform.test.ts — Verify usePlatform and PlatformSwitch exports exist.
 *
 * Usage: npx tsx test/platform.test.ts
 */

import { usePlatform } from '../src/hooks/usePlatform.js';
import { PlatformSwitch } from '../src/components/PlatformSwitch.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof usePlatform === 'function', 'usePlatform should be a function');
assert(typeof PlatformSwitch === 'function', 'PlatformSwitch should be a function');

console.log('platform.test.ts: PASS');
