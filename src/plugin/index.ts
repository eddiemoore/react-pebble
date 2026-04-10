/**
 * src/plugin/index.ts — Vite plugin for react-pebble.
 *
 * Compiles JSX components to piu, scaffolds the Pebble project, and
 * optionally builds + deploys to the emulator. Users add this to their
 * vite.config.ts and run `vite build`.
 *
 * Usage:
 *   import { pebblePiu } from 'react-pebble/plugin';
 *
 *   export default defineConfig({
 *     plugins: [
 *       pebblePiu({
 *         entry: 'src/App.tsx',
 *         settleMs: 200,
 *         deploy: true,
 *       }),
 *     ],
 *   });
 */

import type { Plugin } from 'vite';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { compileToPiu } from '../compiler/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PebblePiuOptions {
  /** Path to the entry .tsx file (relative to project root) */
  entry: string;
  /** Milliseconds to wait for async effects before snapshotting */
  settleMs?: number;
  /** Target platform — sets screen dimensions (default: 'emery') */
  platform?: string;
  /** Directory for the generated Pebble project (default: '.pebble-build') */
  buildDir?: string;
  /** Auto-run pebble build + install after compilation */
  deploy?: boolean;
  /** Emulator platform for deploy (default: same as platform) */
  emulator?: string;
}

/**
 * Vite plugin that compiles react-pebble JSX to piu and scaffolds a
 * Pebble project for deployment.
 */
export function pebblePiu(options: PebblePiuOptions): Plugin {
  const buildDir = resolve(options.buildDir ?? '.pebble-build');

  return {
    name: 'react-pebble-piu',
    apply: 'build',

    async closeBundle() {
      const log = (msg: string) => console.log(`[react-pebble] ${msg}`);

      // 1. Compile JSX → piu
      log(`Compiling ${options.entry}...`);
      const result = await compileToPiu({
        entry: options.entry,
        settleMs: options.settleMs,
        platform: options.platform,
        logger: log,
      });

      // 2. Scaffold pebble project
      log(`Scaffolding pebble project in ${buildDir}...`);
      scaffoldPebbleProject(buildDir, {
        watchface: !result.hasButtons,
        messageKeys: result.messageKeys,
      });

      // 3. Write compiled output
      const outputPath = join(buildDir, 'src', 'embeddedjs', 'main.js');
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, result.code);
      log(`Wrote ${result.code.split('\n').length} lines to ${outputPath}`);

      // 4. Optionally build + deploy
      if (options.deploy) {
        const emu = options.emulator ?? options.platform ?? 'emery';
        log('Running pebble build...');
        try {
          execSync('pebble build', { cwd: buildDir, stdio: 'inherit' });
          log(`Installing to ${emu} emulator...`);
          execSync('pebble kill 2>/dev/null; pebble wipe 2>/dev/null; sleep 2', {
            cwd: buildDir,
            stdio: 'ignore',
          });
        execSync(`pebble install --emulator ${emu}`, {
            cwd: buildDir,
            stdio: 'inherit',
            timeout: 30000,
          });
          log(`Deployed to ${emu}. Run 'cd ${buildDir} && pebble logs' for live output.`);
        } catch (err) {
          log('Deploy failed — is the Pebble SDK installed? (pebble --version)');
          throw err;
        }
      } else {
        log(`Done. To deploy:\n  cd ${buildDir} && pebble build && pebble install --emulator emery`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Pebble project scaffolding
// ---------------------------------------------------------------------------

interface ScaffoldOptions {
  watchface: boolean;
  messageKeys: string[];
}

function scaffoldPebbleProject(dir: string, options: ScaffoldOptions): void {
  mkdirSync(join(dir, 'src', 'embeddedjs'), { recursive: true });
  mkdirSync(join(dir, 'src', 'c'), { recursive: true });
  mkdirSync(join(dir, 'src', 'pkjs'), { recursive: true });

  // Preserve UUID across builds (or generate a new one)
  let uuid: string;
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const existing = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      uuid = existing?.pebble?.uuid ?? randomUUID();
    } catch {
      uuid = randomUUID();
    }
  } else {
    uuid = randomUUID();
  }

  // package.json
  const pkg = {
    name: 'react-pebble-app',
    author: 'react-pebble',
    version: '1.0.0',
    keywords: ['pebble-app'],
    private: true,
    dependencies: {},
    pebble: {
      displayName: 'react-pebble-app',
      uuid,
      projectType: 'moddable',
      sdkVersion: '3',
      enableMultiJS: true,
      targetPlatforms: ['emery', 'gabbro'],
      watchapp: { watchface: options.watchface },
      messageKeys: options.messageKeys.length > 0 ? options.messageKeys : ['dummy'],
      resources: { media: [] },
    },
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // wscript (static)
  const wscriptPath = join(dir, 'wscript');
  if (!existsSync(wscriptPath)) {
    // Copy from template directory
    const templateDir = resolve(__dirname, '../../pebble-spike');
    if (existsSync(join(templateDir, 'wscript'))) {
      copyFileSync(join(templateDir, 'wscript'), wscriptPath);
    }
  }

  // C stub (static)
  const cPath = join(dir, 'src', 'c', 'mdbl.c');
  if (!existsSync(cPath)) {
    writeFileSync(
      cPath,
      `#include <pebble.h>

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  moddable_createMachine(NULL);

  window_destroy(w);
}
`,
    );
  }

  // Moddable manifest (static)
  const manifestPath = join(dir, 'src', 'embeddedjs', 'manifest.json');
  if (!existsSync(manifestPath)) {
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          include: ['$(MODDABLE)/examples/manifest_mod.json'],
          modules: { '*': './main.js' },
        },
        null,
        2,
      ) + '\n',
    );
  }

  // Phone-side JS
  const pkjsPath = join(dir, 'src', 'pkjs', 'index.js');
  if (options.messageKeys.length > 0 && options.messageKeys[0] !== 'dummy') {
    writeFileSync(
      pkjsPath,
      `// Phone-side PebbleKit JS — sends data to watch via AppMessage.
// Replace the mock data below with a real API fetch.

Pebble.addEventListener("ready", function () {
  console.log("Phone JS ready.");
  // TODO: fetch real data and send via Pebble.sendAppMessage({ ${options.messageKeys[0]}: jsonString });
});
`,
    );
  } else if (!existsSync(pkjsPath)) {
    writeFileSync(
      pkjsPath,
      `Pebble.addEventListener("ready", function(e) {
  console.log("PebbleKit JS ready.");
});
`,
    );
  }
}

export default pebblePiu;
