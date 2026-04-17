/**
 * test/platform-tags.test.ts — discoverPlatformVariants auto-detects
 * `<basename>~<tag>.<ext>` siblings and populates targetPlatforms.
 *
 * Usage: npx tsx test/platform-tags.test.ts
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverPlatformVariants } from '../src/plugin/index.js';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, Object.keys(a as Record<string, unknown>).sort()) ===
         JSON.stringify(b, Object.keys(b as Record<string, unknown>).sort());
}

// ---------------------------------------------------------------------------
// Test 1: discovers tagged siblings
// ---------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'pebble-ptags-'));
  const resDir = join(tmp, 'resources');
  mkdirSync(resDir, { recursive: true });

  // Create base + tagged files (content doesn't matter)
  writeFileSync(join(resDir, 'icon.png'), '');
  writeFileSync(join(resDir, 'icon~chalk.png'), '');
  writeFileSync(join(resDir, 'icon~bw.png'), '');

  const result = discoverPlatformVariants('resources/icon.png', tmp);
  assert(result !== undefined, 'returns a map when variants exist');
  assert(
    deepEqual(result, { chalk: 'icon~chalk.png', bw: 'icon~bw.png' }),
    'maps tag -> filename for known tags',
  );

  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test 2: returns undefined when no variants exist
// ---------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'pebble-ptags-'));
  const resDir = join(tmp, 'resources');
  mkdirSync(resDir, { recursive: true });

  writeFileSync(join(resDir, 'logo.png'), '');

  const result = discoverPlatformVariants('resources/logo.png', tmp);
  assert(result === undefined, 'returns undefined when no variants exist');

  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test 3: ignores unknown tags
// ---------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'pebble-ptags-'));
  const resDir = join(tmp, 'resources');
  mkdirSync(resDir, { recursive: true });

  writeFileSync(join(resDir, 'bg.png'), '');
  writeFileSync(join(resDir, 'bg~unknown.png'), '');

  const result = discoverPlatformVariants('resources/bg.png', tmp);
  assert(result === undefined, 'ignores unknown tags');

  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test 4: ignores different extensions
// ---------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'pebble-ptags-'));
  const resDir = join(tmp, 'resources');
  mkdirSync(resDir, { recursive: true });

  writeFileSync(join(resDir, 'icon.png'), '');
  writeFileSync(join(resDir, 'icon~chalk.jpg'), '');  // wrong ext

  const result = discoverPlatformVariants('resources/icon.png', tmp);
  assert(result === undefined, 'ignores variants with different extension');

  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test 5: handles non-existent directory gracefully
// ---------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'pebble-ptags-'));

  const result = discoverPlatformVariants('nonexistent/icon.png', tmp);
  assert(result === undefined, 'returns undefined for non-existent directory');

  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
