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
import { readFileSync } from 'node:fs';
import { analyze } from './analyze.js';
import { emitPiu } from './emit-piu.js';
import { emitPKJS } from './emit-pkjs.js';

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

// Scan the entry source for hook names that imply Pebble app capabilities.
// This lets the plugin auto-set `pebble.capabilities` in package.json.
let hooksUsedList: string[] = [];
try {
  const entrySrc = readFileSync(entryPath, 'utf-8');
  const hookRe = /\b(use\w+)\b/g;
  const hooksUsed = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = hookRe.exec(entrySrc)) !== null) {
    hooksUsed.add(m[1]!);
  }
  hooksUsedList = [...hooksUsed];
  if (hooksUsed.size > 0) {
    process.stderr.write('hooksUsed=' + JSON.stringify(hooksUsedList) + '\n');
  }
} catch {
  // entry unreadable — skip
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

// Generate PebbleKit JS companion if the app uses phone communication, config,
// identity tokens, or timeline features.
const pkjsHooks = [
  'useAccountToken',
  'useWatchToken',
  'useTimelineToken',
  'useTimeline',
  'useTimelineSubscriptions',
];
const needsPKJS = ir.messageInfo || ir.configInfo || hooksUsedList.some(h => pkjsHooks.includes(h));
if (needsPKJS) {
  // For config apps, extract the config page URL
  let configUrl: string | undefined;
  if (ir.configInfo?.url) {
    // The URL might be a variable reference like `configUrl` — we need the actual data URI.
    // For C target, generate the config page HTML inline and pass as data URI.
    try {
      const { renderConfigPage, ConfigPage, ConfigSection, ConfigColor, ConfigToggle, ConfigText, ConfigSelect, configPageToDataUri } = await import('../src/config/index.js');
      // Group keys into sections based on the original ConfigSection titles
      const sectionTitles = ir.configInfo.sectionTitles.length > 0
        ? ir.configInfo.sectionTitles
        : ['Settings'];

      // If we have multiple section titles, distribute keys across them
      // by type: color keys go to first section, boolean/string to second, etc.
      const colorKeys = ir.configInfo.keys.filter(k => k.type === 'color');
      const otherKeys = ir.configInfo.keys.filter(k => k.type !== 'color');

      const makeItem = (k: typeof ir.configInfo.keys[0]) => {
        switch (k.type) {
          case 'color': return ConfigColor(k.key, k.label, String(k.default));
          case 'boolean': return ConfigToggle(k.key, k.label, k.default as boolean);
          case 'string': return ConfigText(k.key, k.label, String(k.default));
          default: return ConfigText(k.key, k.label, String(k.default));
        }
      };

      let sections;
      if (sectionTitles.length >= 2 && colorKeys.length > 0 && otherKeys.length > 0) {
        sections = [
          ConfigSection(sectionTitles[0]!, colorKeys.map(makeItem)),
          ConfigSection(sectionTitles[1]!, otherKeys.map(makeItem)),
        ];
      } else {
        sections = [ConfigSection(sectionTitles[0]!, ir.configInfo.keys.map(makeItem))];
      }

      const spec = ConfigPage(sections, {
        appName: ir.configInfo.appName ?? undefined,
      });
      configUrl = configPageToDataUri(spec);
    } catch {
      // Config module not available — skip
    }
  }

  const pkjsCode = emitPKJS({ ir, configUrl, hooksUsed: hooksUsedList });
  process.stderr.write('\n--- PebbleKit JS (src/pkjs/index.js) ---\n');
  process.stderr.write(pkjsCode);
  process.stderr.write('--- End PebbleKit JS ---\n');
}
