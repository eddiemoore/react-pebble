/**
 * scripts/compile-to-piu.ts — Compiler orchestrator.
 *
 * Analyzes a react-pebble component and emits target-specific code.
 * Delegates to analyze.ts for analysis and emit-piu.ts / emit-rocky.ts
 * for code generation.
 *
 * Usage:
 *   EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts
 *   EXAMPLE=counter COMPILE_TARGET=rocky PEBBLE_PLATFORM=basalt npx tsx scripts/compile-to-piu.ts
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyze } from './analyze.js';
import { emitPiu } from './emit-piu.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const exampleInput = process.env.EXAMPLE ?? 'watchface';
const settleMs = Number(process.env.SETTLE_MS ?? '0');
const platform = process.env.PEBBLE_PLATFORM ?? 'emery';
const target = process.env.COMPILE_TARGET ?? 'alloy';

// Resolve entry path
let entryPath: string;
let exampleName: string;
if (exampleInput.includes('/') || exampleInput.includes('\\')) {
  entryPath = resolve(exampleInput);
  exampleName = entryPath.replace(/\.[jt]sx?$/, '').split('/').pop()!;
} else {
  entryPath = resolve(__dirname, '..', 'examples', `${exampleInput}.tsx`);
  exampleName = exampleInput;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const ir = await analyze({ entryPath, platform, settleMs });

if (ir.imageResources.length > 0) {
  process.stderr.write('imageResources=' + JSON.stringify(ir.imageResources) + '\n');
}

let code: string;
if (target === 'rocky') {
  const { emitRocky } = await import('./emit-rocky.js');
  code = emitRocky(ir);
} else if (target === 'c') {
  const { emitC } = await import('./emit-c.js');
  code = emitC(ir);
} else {
  code = emitPiu(ir, exampleName);
}

process.stdout.write(code);
