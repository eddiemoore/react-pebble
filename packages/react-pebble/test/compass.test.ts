/**
 * test/compass.test.ts — useCompass hook surface check.
 *
 * The hook requires a Preact render context, so we verify that:
 *   - useCompass is exported and is a function
 *   - CompassResult and CompassStatus types are importable
 *   - The barrel re-export includes the new types
 *
 * Usage: npx tsx test/compass.test.ts
 */

import { useCompass } from '../src/hooks/useCompass.js';
import type { CompassStatus, CompassResult } from '../src/hooks/useCompass.js';

// Also verify barrel re-exports work
import type {
  CompassResult as BarrelCompassResult,
  CompassStatus as BarrelCompassStatus,
} from '../src/hooks/index.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// useCompass is a callable function
assert(typeof useCompass === 'function', 'useCompass should be a function');

// Type-level assertions — these verify at compile time that the types exist
// and have the expected shape. If the types are wrong, tsc will catch it.
type _AssertStatus = CompassStatus extends 'dataInvalid' | 'calibrating' | 'calibrated'
  ? true
  : never;

type _AssertResult = CompassResult extends {
  heading: number;
  magneticHeading: number;
  status: CompassStatus;
  setHeadingFilter: (degrees: number) => void;
}
  ? true
  : never;

// Barrel re-exports match direct exports
type _AssertBarrelResult = BarrelCompassResult extends CompassResult ? true : never;
type _AssertBarrelStatus = BarrelCompassStatus extends CompassStatus ? true : never;

// Compile-time checks that the type aliases resolve to `true`
const _r: _AssertStatus = true;
const _s: _AssertResult = true;
const _t: _AssertBarrelResult = true;
const _u: _AssertBarrelStatus = true;

// Suppress unused-variable warnings
void _r; void _s; void _t; void _u;

console.log('compass.test.ts: PASS');
