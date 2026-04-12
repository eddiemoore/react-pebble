/**
 * test/snapshot-test.ts — Compiler output snapshot tests.
 *
 * For each example, runs the compiler and compares the output to a
 * saved snapshot file. Fails if any output differs, showing the diff.
 *
 * Usage:
 *   npx tsx test/snapshot-test.ts              # test all examples (piu)
 *   npx tsx test/snapshot-test.ts --update     # regenerate snapshots
 *   npx tsx test/snapshot-test.ts counter      # test one example
 *   npx tsx test/snapshot-test.ts --target rocky         # test Rocky.js snapshots
 *   npx tsx test/snapshot-test.ts --target rocky --update # regenerate Rocky.js snapshots
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const updateMode = args.includes('--update');
const targetIdx = args.indexOf('--target');
const target = targetIdx >= 0 ? args[targetIdx + 1] ?? 'alloy' : 'alloy';
const filterExample = args.find((a) => !a.startsWith('--') && (targetIdx < 0 || args.indexOf(a) !== targetIdx + 1));

const snapshotDir = target === 'c'
  ? resolve(__dirname, 'snapshots-c')
  : target === 'rocky'
    ? resolve(__dirname, 'snapshots-rocky')
    : resolve(__dirname, 'snapshots');

if (!existsSync(snapshotDir)) {
  mkdirSync(snapshotDir, { recursive: true });
}

const snapshotExt = target === 'c' ? '.c' : '.js';
const EXAMPLES = readdirSync(snapshotDir)
  .filter((f) => f.endsWith(snapshotExt))
  .map((f) => f.replace(snapshotExt, ''));

let passed = 0;
let failed = 0;
let updated = 0;

for (const example of EXAMPLES) {
  if (filterExample && example !== filterExample) continue;

  const snapshotPath = resolve(snapshotDir, `${example}${snapshotExt}`);

  try {
    const envVars = target === 'rocky'
      ? `EXAMPLE=${example} COMPILE_TARGET=rocky PEBBLE_PLATFORM=basalt`
      : target === 'c'
        ? `EXAMPLE=${example} COMPILE_TARGET=c PEBBLE_PLATFORM=basalt`
        : `EXAMPLE=${example}`;
    const actual = execSync(
      `${envVars} npx tsx scripts/compile-to-piu.ts 2>/dev/null`,
      { cwd: resolve(__dirname, '..'), encoding: 'utf-8', timeout: 30000 },
    );

    if (updateMode) {
      writeFileSync(snapshotPath, actual);
      updated++;
      console.log(`  \x1b[33m⟳\x1b[0m ${example} (updated)`);
      continue;
    }

    const expected = readFileSync(snapshotPath, 'utf-8');

    if (actual === expected) {
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${example}`);
    } else {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${example}`);

      // Show first difference
      const actualLines = actual.split('\n');
      const expectedLines = expected.split('\n');
      for (let i = 0; i < Math.max(actualLines.length, expectedLines.length); i++) {
        if (actualLines[i] !== expectedLines[i]) {
          console.log(`    Line ${i + 1}:`);
          console.log(`    \x1b[31m- ${expectedLines[i] ?? '(missing)'}\x1b[0m`);
          console.log(`    \x1b[32m+ ${actualLines[i] ?? '(missing)'}\x1b[0m`);
          if (i < Math.max(actualLines.length, expectedLines.length) - 3) {
            console.log(`    ... (${Math.abs(actualLines.length - expectedLines.length)} more lines differ)`);
          }
          break;
        }
      }
    }
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${example} (compilation error)`);
    console.log(`    ${(err as Error).message?.slice(0, 200)}`);
  }
}

console.log('');
if (updateMode) {
  console.log(`Updated ${updated} snapshot(s).`);
} else {
  console.log(`${passed} passed, ${failed} failed out of ${passed + failed} examples.`);
  if (failed > 0) process.exit(1);
}
