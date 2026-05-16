/**
 * test/hook-detection.test.ts — Analyzer's HookUsage detection.
 *
 * Verifies that detectHookUsages walks a TypeScript SourceFile and records
 * every call site of a binding imported from react-pebble / react-pebble/hooks.
 *
 * Usage: npx tsx test/hook-detection.test.ts
 */

import ts from 'typescript';
import { detectHookUsages } from '../scripts/analyze.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('test.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

// ---------------------------------------------------------------------------
// 1. detects a single hook call imported from 'react-pebble/hooks'
// ---------------------------------------------------------------------------

{
  const sf = parse(`
import { useTime } from 'react-pebble/hooks';

export function App() {
  const t = useTime('HHMM');
  return null;
}
`);

  const usages = detectHookUsages(sf);

  assert(usages.length === 1, `expected 1 usage, got ${usages.length}`);
  assert(usages[0]!.name === 'useTime', `expected name "useTime", got "${usages[0]!.name}"`);
  assert(usages[0]!.line === 5, `expected line 5, got ${usages[0]!.line}`);
  assert(typeof usages[0]!.col === 'number', 'expected numeric col');
}

console.log('hook-detection / direct import single call: PASS');

// ---------------------------------------------------------------------------
// 2. ignores locally-defined helpers shaped like hooks (Q2 bug fix)
// ---------------------------------------------------------------------------

{
  const sf = parse(`
function useFoo() {
  return 1;
}

export function App() {
  const x = useFoo();
  return null;
}
`);

  const usages = detectHookUsages(sf);

  assert(
    usages.length === 0,
    `expected 0 usages (useFoo is local, not from react-pebble), got ${usages.length}: ${JSON.stringify(usages)}`,
  );
}

console.log('hook-detection / ignores local use-prefixed helpers: PASS');

// ---------------------------------------------------------------------------
// 3. resolves import aliases to canonical hook name
// ---------------------------------------------------------------------------

{
  const sf = parse(`
import { useTime as clock } from 'react-pebble/hooks';

export function App() {
  const t = clock('HHMM');
  return null;
}
`);

  const usages = detectHookUsages(sf);

  assert(usages.length === 1, `expected 1 usage, got ${usages.length}`);
  assert(
    usages[0]!.name === 'useTime',
    `expected canonical name "useTime" (not local alias "clock"), got "${usages[0]!.name}"`,
  );
}

console.log('hook-detection / resolves alias to canonical name: PASS');

// ---------------------------------------------------------------------------
// 4. accepts caller-supplied additional module specifiers (for in-repo examples)
// ---------------------------------------------------------------------------

{
  const sf = parse(`
import { useButton } from '../src/hooks/index.js';

export function App() {
  useButton('up', () => {});
  return null;
}
`);

  const usages = detectHookUsages(sf, ['react-pebble', 'react-pebble/hooks', '../src/hooks/index.js']);

  assert(usages.length === 1, `expected 1 usage, got ${usages.length}`);
  assert(usages[0]!.name === 'useButton', `expected name "useButton", got "${usages[0]!.name}"`);
}

console.log('hook-detection / honors custom module specifiers: PASS');
