/**
 * test/launch-info.test.ts — readLaunchInfo surface.
 *
 * Covers:
 *   - mock mode returns wakeupId: null
 *   - wakeupId field exists on LaunchInfo type
 *
 * Usage: npx tsx test/launch-info.test.ts
 */

import { readLaunchInfo } from '../src/hooks/useLaunchInfo.js';
import type { LaunchInfo } from '../src/hooks/useLaunchInfo.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// ── mock mode (no globals set) ──────────────────────────────────────────

const info: LaunchInfo = readLaunchInfo();

assert(info.reason === 'user', 'mock mode reason should be "user"');
assert(info.args === 0, 'mock mode args should be 0');
assert(info.wakeupId === null, 'mock mode wakeupId should be null');

// ── type-level: wakeupId exists and is number | null ────────────────────

const _typeCheck: number | null = info.wakeupId;
void _typeCheck;

console.log('launch-info.test.ts: all passed');
