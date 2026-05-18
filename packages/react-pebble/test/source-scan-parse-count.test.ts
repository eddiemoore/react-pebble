/**
 * test/source-scan-parse-count.test.ts — Behavioural invariant for the
 * SourceScan deepening.
 *
 * Runs `analyze()` on a representative example (counter.tsx) and asserts
 * the entry source is parsed exactly once. The pre-SourceScan code parsed
 * it seven times (one createSourceFile per legacy detector). See
 * CONTEXT.md (SourceScan) and docs/adr/0003-hook-detection-in-analyzer.md.
 *
 * Usage: npx tsx test/source-scan-parse-count.test.ts
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../scripts/analyze.js';
import { _entryBuildCount } from '../scripts/analyzer/parse-entry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const exampleEntry = resolve(__dirname, '../examples/counter.tsx');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

_entryBuildCount.value = 0;

await analyze({
  entryPath: exampleEntry,
  platform: 'emery',
  settleMs: 0,
});

assert(
  _entryBuildCount.value === 1,
  `expected exactly 1 entry SourceFile build per analyze() run, got ${_entryBuildCount.value}`,
);

console.log(`source-scan / parse-count == 1: PASS (observed ${_entryBuildCount.value})`);
