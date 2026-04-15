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

// -----------------------------------------------------------------------
// Font trackingAdjust flows through to resources.media entry
// -----------------------------------------------------------------------
{
  const { dir, pkg } = scaffold({
    resources: [
      { type: 'font', name: 'PIXEL_24', file: 'fake.ttf', trackingAdjust: 2 },
    ],
  });
  const entry = pkg.pebble.resources.media.find((m: any) => m.name === 'PIXEL_24');
  assert(!!entry, 'PIXEL_24 font entry must be emitted');
  assert(
    entry.trackingAdjust === 2,
    `Font trackingAdjust must round-trip, got ${JSON.stringify(entry.trackingAdjust)}`,
  );
  cleanup(dir);
}

// Absent by default
{
  const { dir, pkg } = scaffold({
    resources: [{ type: 'font', name: 'BASIC', file: 'fake.ttf' }],
  });
  const entry = pkg.pebble.resources.media.find((m: any) => m.name === 'BASIC');
  assert(!!entry, 'BASIC font entry must be emitted');
  assert(
    !('trackingAdjust' in entry),
    'Font without trackingAdjust must not emit the field',
  );
  cleanup(dir);
}

// -----------------------------------------------------------------------
// Bitmap memoryFormat flows through to resources.media entry
// -----------------------------------------------------------------------
{
  const { dir, pkg } = scaffold({
    resources: [
      { type: 'png', name: 'ICON', file: 'fake.png', memoryFormat: 'SmallestPalette' },
    ],
  });
  const entry = pkg.pebble.resources.media.find((m: any) => m.name === 'ICON');
  assert(!!entry, 'ICON png entry must be emitted');
  assert(
    entry.memoryFormat === 'SmallestPalette',
    `memoryFormat must round-trip, got ${JSON.stringify(entry.memoryFormat)}`,
  );
  cleanup(dir);
}

// Absent by default
{
  const { dir, pkg } = scaffold({
    resources: [{ type: 'png', name: 'PLAIN', file: 'fake.png' }],
  });
  const entry = pkg.pebble.resources.media.find((m: any) => m.name === 'PLAIN');
  assert(!!entry, 'PLAIN png entry must be emitted');
  assert(
    !('memoryFormat' in entry),
    'png without memoryFormat must not emit the field',
  );
  cleanup(dir);
}

console.log('manifest-fields.test.ts: PASS');
