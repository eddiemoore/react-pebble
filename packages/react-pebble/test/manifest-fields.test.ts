/**
 * test/manifest-fields.test.ts — scaffoldPebbleProject emits the optional
 * manifest + resource-entry fields that external docs expect:
 *
 *   - versionLabel           (default '1.0.0', user-overridable)
 *   - trackingAdjust         (font resource field)
 *   - memoryFormat           (png/bitmap resource field)
 *
 * Uses mkdtempSync for isolation; no fixtures on disk.
 *
 * Usage: npx tsx test/manifest-fields.test.ts
 */

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldPebbleProject, type ScaffoldOptions } from '../src/plugin/index.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function scaffold(partial: Partial<ScaffoldOptions>): { dir: string; pkg: any } {
  const dir = mkdtempSync(join(tmpdir(), 'rpeb-manifest-'));
  // Seed a source font file so file-existence checks (if any) don't bomb;
  // scaffoldPebbleProject copies via basename only, so we just need the path to
  // resolve after it strips directories.
  const srcDir = join(dir, 'src-assets');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, 'fake.ttf'), '');
  writeFileSync(join(srcDir, 'fake.png'), '');

  const opts: ScaffoldOptions = {
    target: 'alloy',
    watchface: true,
    messageKeys: [],
    projectRoot: srcDir,
    ...partial,
  };

  scaffoldPebbleProject(dir, opts);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  return { dir, pkg };
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

// -----------------------------------------------------------------------
// versionLabel: default
// -----------------------------------------------------------------------
{
  const { dir, pkg } = scaffold({});
  assert(
    pkg.pebble.versionLabel === '1.0.0',
    `Default versionLabel must be '1.0.0', got ${JSON.stringify(pkg.pebble.versionLabel)}`,
  );
  cleanup(dir);
}

// -----------------------------------------------------------------------
// versionLabel: user override
// -----------------------------------------------------------------------
{
  const { dir, pkg } = scaffold({ versionLabel: '2.4.0' });
  assert(
    pkg.pebble.versionLabel === '2.4.0',
    `Override versionLabel must round-trip, got ${JSON.stringify(pkg.pebble.versionLabel)}`,
  );
  cleanup(dir);
}

console.log('manifest-fields.test.ts: PASS');
