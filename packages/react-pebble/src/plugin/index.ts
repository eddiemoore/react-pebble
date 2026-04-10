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
  /**
   * Target platforms for multi-platform builds (e.g. ['emery', 'gabbro']).
   * When set, builds once per platform into `{buildDir}-{platform}/`.
   * Overrides the `platform` option.
   */
  targetPlatforms?: string[];
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

      const platforms = options.targetPlatforms ?? [options.platform ?? 'emery'];

      for (const platform of platforms) {
        const platBuildDir = platforms.length > 1
          ? resolve(`${options.buildDir ?? '.pebble-build'}-${platform}`)
          : buildDir;

        // 1. Compile JSX → piu
        log(`Compiling ${options.entry} for ${platform}...`);
        const result = await compileToPiu({
          entry: options.entry,
          settleMs: options.settleMs,
          platform,
          logger: log,
        });

        // 2. Scaffold pebble project
        log(`Scaffolding pebble project in ${platBuildDir}...`);
        scaffoldPebbleProject(platBuildDir, {
          watchface: !result.hasButtons,
          messageKeys: result.messageKeys,
          mockDataSource: result.mockDataSource,
        });

        // 3. Write compiled output
        const outputPath = join(platBuildDir, 'src', 'embeddedjs', 'main.js');
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, result.code);
        log(`Wrote ${result.code.split('\n').length} lines to ${outputPath}`);

        // 4. Optionally build + deploy
        if (options.deploy) {
          const emu = options.emulator ?? platform;
          log(`Running pebble build for ${platform}...`);
          try {
            execSync('pebble build', { cwd: platBuildDir, stdio: 'inherit' });
            log(`Installing to ${emu} emulator...`);
            execSync('pebble kill 2>/dev/null; pebble wipe 2>/dev/null; sleep 2', {
              cwd: platBuildDir,
              stdio: 'ignore',
            });
            execSync(`pebble install --emulator ${emu}`, {
              cwd: platBuildDir,
              stdio: 'inherit',
              timeout: 30000,
            });
            log(`Deployed to ${emu}. Run 'cd ${platBuildDir} && pebble logs' for live output.`);
          } catch (err) {
            log(`Deploy failed for ${platform} — is the Pebble SDK installed? (pebble --version)`);
            throw err;
          }
        } else {
          log(`Done (${platform}). To deploy:\n  cd ${platBuildDir} && pebble build && pebble install --emulator ${platform}`);
        }
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
  /** TypeScript source of mock data (for generating phone-side JS) */
  mockDataSource?: string | null;
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

  // wscript (static — Pebble SDK build config)
  const wscriptPath = join(dir, 'wscript');
  if (!existsSync(wscriptPath)) {
    writeFileSync(wscriptPath, WSCRIPT_TEMPLATE);
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
    const key = options.messageKeys[0]!;
    const mockSrc = options.mockDataSource;
    if (mockSrc) {
      // Generate working phone-side JS that sends the mock data
      // Strip TypeScript type annotations from the mock data source
      const cleanMockSrc = mockSrc
        .replace(/as\s+const/g, '')
        .replace(/:\s*\w+(\[\])?/g, '')
        .replace(/<[^>]+>/g, '');
      writeFileSync(
        pkjsPath,
        `// Phone-side PebbleKit JS — sends mock data to watch via AppMessage.
// Replace the mock data below with a real API fetch.

Pebble.addEventListener("ready", function () {
  console.log("Phone JS ready — sending data to watch...");

  // Mock data (from example). Replace with fetch() for real data.
  var data = ${cleanMockSrc};

  // Send to watch after a short delay (wait for Message subscription)
  setTimeout(function() {
    Pebble.sendAppMessage(
      { "${key}": JSON.stringify(data) },
      function() { console.log("Data sent to watch successfully."); },
      function(e) { console.log("Send failed: " + JSON.stringify(e)); }
    );
  }, 2000);
});
`,
      );
    } else {
      writeFileSync(
        pkjsPath,
        `// Phone-side PebbleKit JS — sends data to watch via AppMessage.
// Replace the placeholder below with a real API fetch.

Pebble.addEventListener("ready", function () {
  console.log("Phone JS ready.");
  // Example: fetch data and send to watch
  // var data = { key: "value" };
  // Pebble.sendAppMessage({ "${key}": JSON.stringify(data) });
});
`,
      );
    }
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

// Named export only — avoids Vite's MIXED_EXPORTS warning.
// Users import as: import { pebblePiu } from 'react-pebble/plugin';

// ---------------------------------------------------------------------------
// Inline templates (no external file dependencies)
// ---------------------------------------------------------------------------

const WSCRIPT_TEMPLATE = `#
# Pebble SDK build configuration (auto-generated by react-pebble plugin)
#
import os.path

top = '.'
out = 'build'

def options(ctx):
    ctx.load('pebble_sdk')

def configure(ctx):
    ctx.load('pebble_sdk')

def build(ctx):
    ctx.load('pebble_sdk')
    build_worker = os.path.exists('worker_src')
    binaries = []
    cached_env = ctx.env
    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        ctx.pbl_build(source=ctx.path.ant_glob('src/c/**/*.c'), target=app_elf, bin_type='app')
        if build_worker:
            worker_elf = '{}/pebble-worker.elf'.format(ctx.env.BUILD_DIR)
            binaries.append({'platform': platform, 'app_elf': app_elf, 'worker_elf': worker_elf})
            ctx.pbl_build(source=ctx.path.ant_glob('worker_src/c/**/*.c'), target=worker_elf, bin_type='worker')
        else:
            binaries.append({'platform': platform, 'app_elf': app_elf})
    ctx.env = cached_env
    ctx.set_group('bundle')
    ctx.pbl_bundle(binaries=binaries,
                   js=ctx.path.ant_glob(['src/pkjs/**/*.js', 'src/pkjs/**/*.json', 'src/common/**/*.js']),
                   js_entry_file='src/pkjs/index.js')
`;
