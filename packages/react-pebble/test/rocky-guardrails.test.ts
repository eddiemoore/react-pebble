/**
 * test/rocky-guardrails.test.ts — Rocky compile-time guardrails.
 *
 * Verifies that the compiler rejects hooks unsupported on the Rocky.js
 * target and accepts safe examples.
 *
 * Usage: npx tsx test/rocky-guardrails.test.ts
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const opts = { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'] };

// ---------------------------------------------------------------------------
// 1. counter.tsx uses useButton — must fail under COMPILE_TARGET=rocky
// ---------------------------------------------------------------------------

let counterFailed = false;
let counterStderr = '';
try {
  execSync('EXAMPLE=counter COMPILE_TARGET=rocky npx tsx scripts/compile-to-piu.ts', opts);
} catch (e: any) {
  counterFailed = true;
  counterStderr = e.stderr?.toString() ?? '';
}

assert(counterFailed, 'counter.tsx should exit non-zero under Rocky target');
assert(
  counterStderr.includes('useButton'),
  'stderr should mention useButton',
);
assert(
  counterStderr.includes('not supported on the Rocky.js target'),
  'stderr should include "not supported on the Rocky.js target"',
);

console.log('rocky-guardrails / blocked hook rejected: PASS');

// ---------------------------------------------------------------------------
// 2. watchface.tsx uses only useTime — must succeed under COMPILE_TARGET=rocky
// ---------------------------------------------------------------------------

let watchfaceFailed = false;
let watchfaceError = '';
try {
  execSync('EXAMPLE=watchface COMPILE_TARGET=rocky npx tsx scripts/compile-to-piu.ts', opts);
} catch (e: any) {
  watchfaceFailed = true;
  watchfaceError = e.stderr?.toString() ?? '';
}

assert(
  !watchfaceFailed,
  `watchface.tsx should compile successfully under Rocky target, but failed: ${watchfaceError}`,
);

console.log('rocky-guardrails / safe example accepted: PASS');
