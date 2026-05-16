/**
 * scripts/compile-to-piu.ts — Compiler orchestrator.
 *
 * Analyzes a react-pebble component and emits target-specific code by
 * dispatching to a Target Adapter from the registry. The orchestrator
 * never branches on target — adding a fourth Target only touches the
 * registry (scripts/targets/index.ts).
 *
 * Usage:
 *   EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts
 *   EXAMPLE=counter COMPILE_TARGET=rocky PEBBLE_PLATFORM=basalt npx tsx scripts/compile-to-piu.ts
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyze, DEFAULT_HOOK_MODULE_SPECIFIERS } from './analyze.js';
import { getTarget } from './targets/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const exampleInput = process.env.EXAMPLE ?? 'watchface';
const settleMs = Number(process.env.SETTLE_MS ?? '0');
const platform = process.env.PEBBLE_PLATFORM ?? 'emery';
const targetName = process.env.COMPILE_TARGET ?? 'alloy';

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
// Analyze
// ---------------------------------------------------------------------------

// In-repo examples import hooks via relative paths rather than the published
// `react-pebble` specifier. Extend the detector's accepted specifier list so
// the Analyzer recognises both forms.
const hookModuleSpecifiers = [
  ...DEFAULT_HOOK_MODULE_SPECIFIERS,
  '../src/hooks/index.js',
  '../src/index.js',
];

const ir = await analyze({ entryPath, platform, settleMs, hookModuleSpecifiers });

// AppMessage buffer-size override (C target only; no-op otherwise).
const inboxEnv = process.env.APPMSG_INBOX_SIZE;
const outboxEnv = process.env.APPMSG_OUTBOX_SIZE;
if (inboxEnv !== undefined || outboxEnv !== undefined) {
  ir.appMessageSizes = {
    inboxSize: inboxEnv !== undefined ? Number(inboxEnv) : NaN,
    outboxSize: outboxEnv !== undefined ? Number(outboxEnv) : NaN,
  };
}

if (ir.imageResources.length > 0) {
  process.stderr.write('imageResources=' + JSON.stringify(ir.imageResources) + '\n');
}

if (ir.configInfo && ir.configInfo.keys.length > 0) {
  const exported = ir.configInfo.keys.map(k => ({
    key: k.key,
    type: k.type,
    ...(k.type === 'checkboxgroup' ? { size: (k.options ?? []).length } : {}),
  }));
  process.stderr.write('configKeys=' + JSON.stringify(exported) + '\n');
}

// Project CompilerIR.hooksUsed (HookUsage[]) down to a name list for the
// plugin's capability-inference + legacy public CompileResult shape.
const hooksUsedList: string[] = [...new Set(ir.hooksUsed.map((u) => u.name))];
if (hooksUsedList.length > 0) {
  process.stderr.write('hooksUsed=' + JSON.stringify(hooksUsedList) + '\n');
}

// ---------------------------------------------------------------------------
// Dispatch to Target Adapter
// ---------------------------------------------------------------------------

const target = getTarget(targetName);

const validationDiagnostics = target.validate(ir);
const errors = validationDiagnostics.filter((d) => d.severity === 'error');
if (errors.length > 0) {
  for (const d of errors) {
    process.stderr.write(`[react-pebble] ERROR: ${d.message}\n`);
  }
  process.exit(1);
}

const result = target.emit(ir, { appName: exampleName });

process.stdout.write(result.code);

if (result.pkjsCode) {
  process.stderr.write('\n--- PebbleKit JS (src/pkjs/index.js) ---\n');
  process.stderr.write(result.pkjsCode);
  process.stderr.write('--- End PebbleKit JS ---\n');
}

for (const d of result.diagnostics) {
  const tag = d.severity === 'error' ? 'ERROR' : 'WARN';
  process.stderr.write(`[react-pebble] ${tag}: ${d.message}\n`);
}
