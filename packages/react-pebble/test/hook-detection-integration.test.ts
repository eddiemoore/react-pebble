/**
 * test/hook-detection-integration.test.ts — end-to-end hook detection.
 *
 * Drives the orchestrator (compile-to-piu.ts) on a fixture that contains
 * both a real react-pebble hook (useTime) and a locally-defined helper
 * named like a hook (useMyHelper). The hooksUsed list emitted on stderr
 * must include useTime and must NOT include useMyHelper.
 *
 * Until detection moves into the Analyzer (CompilerIR.hooksUsed populated
 * via detectHookUsages), the orchestrator's regex scan picks up both and
 * this test fails. See docs/adr/0003-hook-detection-in-analyzer.md.
 *
 * Usage: npx tsx test/hook-detection-integration.test.ts
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

let stderr = '';
try {
  execSync('EXAMPLE=hook-detection-fixture npx tsx scripts/compile-to-piu.ts', {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
} catch (e: unknown) {
  const err = e as { stderr?: { toString(): string } };
  stderr = err.stderr?.toString() ?? '';
  console.error(`compile-to-piu exited non-zero. stderr:\n${stderr}`);
  process.exit(1);
}

// The orchestrator (or analyze) emits `hooksUsed=[...]` to stderr — capture it
// via a re-run that pipes stderr.
const out = execSync(
  'EXAMPLE=hook-detection-fixture npx tsx scripts/compile-to-piu.ts 2>&1 >/dev/null',
  { cwd: root, encoding: 'utf-8', shell: '/bin/bash' },
);

const match = out.match(/hooksUsed=(\[[^\]]*\])/);
assert(match !== null, `expected stderr to include a hooksUsed=[...] line, got:\n${out}`);

const hooks = JSON.parse(match![1]!) as string[];

assert(
  hooks.includes('useTime'),
  `expected hooksUsed to include "useTime", got: ${JSON.stringify(hooks)}`,
);
assert(
  !hooks.includes('useMyHelper'),
  `expected hooksUsed to NOT include local "useMyHelper" (Q2 false positive), got: ${JSON.stringify(hooks)}`,
);

console.log('hook-detection-integration / useTime detected, useMyHelper ignored: PASS');
