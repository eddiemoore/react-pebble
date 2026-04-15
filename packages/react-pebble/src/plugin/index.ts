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
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
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
  /** Compilation target: 'alloy' for piu/Moddable, 'rocky' for classic Pebble (default: 'alloy') */
  target?: 'alloy' | 'rocky' | 'c';
  /** Directory for the generated Pebble project (default: '.pebble-build') */
  buildDir?: string;
  /** Auto-run pebble build + install after compilation */
  deploy?: boolean;
  /** Emulator platform for deploy (default: same as platform) */
  emulator?: string;
  /** Override the UUID (otherwise one is generated and preserved across builds). */
  uuid?: string;
  /** Override the app display name in `package.json` `pebble.displayName`. */
  displayName?: string;
  /**
   * Override `pebble.versionLabel` (default: `'1.0.0'`, matching the emitted
   * npm `version`). Shown in the Pebble mobile app / app store listing.
   */
  versionLabel?: string;
  /** `pebble.watchapp.hiddenApp` — hides app from menu; useful for companions. */
  hiddenApp?: boolean;
  /** `pebble.watchapp.onlyShownOnCommunication` — only shown when phone sends AppMessage. */
  onlyShownOnCommunication?: boolean;
  /**
   * `pebble.capabilities` — auto-inferred from detected hook usage
   * (useLocation → 'location', useHealth → 'health', useConfiguration → 'configurable').
   * Any values you pass here are merged in addition to the inferred set.
   */
  capabilities?: Array<'location' | 'configurable' | 'health' | 'timeline' | 'smartstrap'>;
  /**
   * Disable capability auto-inference. Pass only the capabilities in `capabilities`.
   * Default: false (auto-inference is on).
   */
  noCapabilityAutoInfer?: boolean;
  /** `pebble.enableMultiJS` — default true (enables the richer PebbleKit JS runtime). */
  enableMultiJS?: boolean;
  /**
   * Override the AppMessage `inbox`/`outbox` buffer sizes (C target only).
   * Default: `app_message_open(app_message_inbox_size_maximum(),
   * app_message_outbox_size_maximum())` — Pebble's recommended maximum
   * pattern. Set explicit numbers to bound heap usage.
   */
  appMessage?: { inboxSize?: number; outboxSize?: number };
  /**
   * Additional resources (beyond auto-detected images). Use this to add
   * custom fonts, raw data files, PDC vector files, or APNG animated images.
   * See the `ResourceDeclaration` type for all fields.
   */
  resources?: ResourceDeclaration[];
  /**
   * `pebble.resources.publishedMedia` — entries that map resources to
   * timeline / AppGlance icon slots. Each entry must reference a `name` that
   * exists in your auto-detected images or `resources` array.
   */
  publishedMedia?: PublishedMediaEntry[];
  /**
   * Path to a background worker source file. Workers run in plain C (the
   * Pebble worker runtime does not host Alloy/Moddable/Rocky), so this
   * should be a handwritten `.c` file. The file is copied into
   * `worker_src/c/worker.c` in the generated project, and
   * `pebble.watchapp.workerName` + the wscript worker build are wired up
   * automatically.
   *
   * See `/docs/c/Worker/` and the `app_worker_*` C APIs.
   */
  worker?: string;
  /**
   * Override `pebble.workerName` (default: derived from `displayName`).
   * Must match the worker's symbol expected by the bundled watchapp.
   */
  workerName?: string;
}

/**
 * Declarative Pebble app resource. Each declaration becomes one entry in
 * `pebble.resources.media` in the generated `package.json`. Source files are
 * copied verbatim to the generated project's `resources/` directory.
 */
export type ResourceDeclaration =
  | {
      type: 'png' | 'bitmap';
      name: string;
      /** Path to the source .png file, relative to the project root. */
      file: string;
      /** Per-platform source file overrides. */
      targetPlatforms?: Record<string, string>;
      /** `menuIcon: true` marks the app's launcher icon. */
      menuIcon?: boolean;
      /**
       * Pebble bitmap `memoryFormat`. `Circular` / `8BitCircular` cut RAM on
       * round displays by storing only the visible pixels. `SmallestPalette`
       * compresses to the minimum viable bit depth. Leave unset for the
       * default (SDK picks based on source).
       */
      memoryFormat?: 'Smallest' | 'SmallestPalette' | '1Bit' | '8Bit' | '8BitCircular' | 'Circular';
    }
  | {
      type: 'font';
      name: string;
      /** Path to the source .ttf file. */
      file: string;
      /**
       * Regex matching the Unicode characters to include in the compiled
       * font (controls final resource size). e.g. `"[A-Za-z0-9 ]"`.
       */
      characterRegex?: string;
      /** Alternate compatibility for older firmwares. */
      compatibility?: string;
      /**
       * Pebble font `trackingAdjust` — positive/negative integer that tweaks
       * vertical placement, in pixels. Useful when a TTF renders too high or
       * too low for the target bitmap grid.
       */
      trackingAdjust?: number;
      targetPlatforms?: Record<string, string>;
    }
  | {
      type: 'raw';
      name: string;
      /** Path to any binary or JSON blob to bundle verbatim. */
      file: string;
      targetPlatforms?: Record<string, string>;
    }
  | {
      type: 'pdc';
      name: string;
      /** Path to the .pdc (Pebble Draw Command) file. */
      file: string;
      targetPlatforms?: Record<string, string>;
    }
  | {
      type: 'apng' | 'pdc-sequence';
      name: string;
      /** Path to the .apng or .pdcs file. */
      file: string;
      targetPlatforms?: Record<string, string>;
    };

export interface PublishedMediaEntry {
  /** Monotonic integer id used by the timeline / AppGlance APIs. */
  id: number;
  /** Must match a `name` in your resources (or an auto-inferred image). */
  name: string;
  /** 25×25 glance icon. */
  glance?: string;
  /** Icon shown in timeline pins that reference this id. */
  timeline?: { tiny?: string; small?: string; large?: string };
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
        const target = options.target ?? 'alloy';
        const result = await compileToPiu({
          entry: options.entry,
          settleMs: options.settleMs,
          platform,
          target,
          logger: log,
          appMessageSizes: options.appMessage
            ? {
                inboxSize: options.appMessage.inboxSize,
                outboxSize: options.appMessage.outboxSize,
              }
            : undefined,
        });

        // 2. Scaffold pebble project
        log(`Scaffolding pebble project in ${platBuildDir}...`);
        const capabilities = computeCapabilities(options, result.hooksUsed);
        scaffoldPebbleProject(platBuildDir, {
          target,
          watchface: !result.hasButtons,
          messageKeys: result.messageKeys,
          configKeys: result.configKeys,
          mockDataSource: result.mockDataSource,
          imageResources: result.imageResources,
          platform,
          projectRoot: resolve(options.entry, '..'),
          uuid: options.uuid,
          displayName: options.displayName,
          versionLabel: options.versionLabel,
          hiddenApp: options.hiddenApp,
          onlyShownOnCommunication: options.onlyShownOnCommunication,
          capabilities,
          enableMultiJS: options.enableMultiJS,
          resources: options.resources,
          publishedMedia: options.publishedMedia,
          worker: options.worker,
          workerName: options.workerName,
        });

        // 3. Write compiled output
        const outputPath = target === 'rocky'
          ? join(platBuildDir, 'src', 'rocky', 'index.js')
          : target === 'c'
            ? join(platBuildDir, 'src', 'c', 'main.c')
            : join(platBuildDir, 'src', 'embeddedjs', 'main.js');
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

export interface ScaffoldOptions {
  target: 'alloy' | 'rocky' | 'c';
  watchface: boolean;
  messageKeys: string[];
  /** Config keys extracted from useConfiguration — used for messageKeys emission. */
  configKeys?: Array<{ key: string; type: string; size?: number }>;
  /** TypeScript source of mock data (for generating phone-side JS) */
  mockDataSource?: string | null;
  /** Image resource paths referenced in the component */
  imageResources?: string[];
  /** Target platform name for Rocky.js targetPlatforms */
  platform?: string;
  /** Project root directory (for resolving relative image paths) */
  projectRoot?: string;
  /** Override the UUID (preserved across builds if unset) */
  uuid?: string;
  /** Override package.json `pebble.displayName` */
  displayName?: string;
  /** Override `pebble.versionLabel` (default: '1.0.0') */
  versionLabel?: string;
  /** `pebble.watchapp.hiddenApp` */
  hiddenApp?: boolean;
  /** `pebble.watchapp.onlyShownOnCommunication` */
  onlyShownOnCommunication?: boolean;
  /** Final list of capabilities (after auto-inference + user additions) */
  capabilities?: Array<'location' | 'configurable' | 'health' | 'timeline' | 'smartstrap'>;
  /** Override `pebble.enableMultiJS` (default true) */
  enableMultiJS?: boolean;
  /** Additional declared resources (fonts, raw, pdc, apng, etc.) */
  resources?: ResourceDeclaration[];
  /** `pebble.resources.publishedMedia` entries */
  publishedMedia?: PublishedMediaEntry[];
  /** Path to a background worker C source file. */
  worker?: string;
  /** Override `pebble.workerName`. */
  workerName?: string;
}

/**
 * Derive the `pebble.capabilities` array from detected hook usage + explicit
 * user additions. Hooks that imply capabilities:
 *
 *   - useLocation      → 'location'
 *   - useHealth, useHealthAlert, useHeartRateMonitor, useHealthHistory,
 *     useMeasurementSystem → 'health'
 *   - useConfiguration → 'configurable'
 */
/**
 * Build the final `pebble.resources.media` array: auto-detected images
 * plus any declared resources. Names are uppercased to match Pebble SDK
 * conventions. Image resources already present in `resources` are skipped
 * (user declaration wins).
 */
function buildMediaEntries(options: ScaffoldOptions): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  const seenNames = new Set<string>();

  // User-declared resources take precedence. The Pebble SDK waf doesn't
  // know about `apng` / `pdc-sequence` types — ship those as `raw` so the
  // asset is bundled verbatim; the runtime uses `gbitmap_sequence_*` /
  // `gdraw_command_sequence_*` to decode on-device.
  for (const r of options.resources ?? []) {
    const sdkType = r.type === 'apng' || r.type === 'pdc-sequence' ? 'raw' : r.type;
    const entry: Record<string, unknown> = {
      type: sdkType,
      name: r.name,
      file: r.file.replace(/^.*\//, ''),
    };
    if ('menuIcon' in r && r.menuIcon) entry.menuIcon = true;
    if ('characterRegex' in r && r.characterRegex) entry.characterRegex = r.characterRegex;
    if ('compatibility' in r && r.compatibility) entry.compatibility = r.compatibility;
    if ('trackingAdjust' in r && typeof r.trackingAdjust === 'number') {
      entry.trackingAdjust = r.trackingAdjust;
    }
    if ('memoryFormat' in r && r.memoryFormat) entry.memoryFormat = r.memoryFormat;
    if (r.targetPlatforms) entry.targetPlatforms = r.targetPlatforms;
    entries.push(entry);
    seenNames.add(r.name);
  }

  // Auto-detected images from the component tree. Extension picks the
  // Pebble SDK resource type — APNG and PDC-sequence assets ship as `raw`
  // because the SDK waf has no `apng` / `pdc-sequence` generator; they're
  // decoded at runtime via `gbitmap_sequence_*` / `gdraw_command_sequence_*`.
  for (const src of options.imageResources ?? []) {
    const name = src.replace(/^.*\//, '').replace(/\.[^.]+$/, '').toUpperCase();
    if (seenNames.has(name)) continue;
    const ext = (src.match(/\.([^./]+)$/)?.[1] ?? 'png').toLowerCase();
    const type: string =
      ext === 'apng' || ext === 'pdcs' ? 'raw'
      : ext === 'pdc' ? 'pdc'
      : 'png';
    entries.push({
      type,
      name,
      file: src.replace(/^.*\//, ''),
    });
    seenNames.add(name);
  }

  return entries;
}

function computeCapabilities(
  options: PebblePiuOptions,
  hooksUsed: string[],
): Array<'location' | 'configurable' | 'health' | 'timeline' | 'smartstrap'> {
  type Cap = 'location' | 'configurable' | 'health' | 'timeline' | 'smartstrap';
  const set = new Set<Cap>(options.capabilities ?? []);
  if (!options.noCapabilityAutoInfer) {
    const used = new Set(hooksUsed);
    if (used.has('useLocation')) set.add('location');
    if (used.has('useConfiguration')) set.add('configurable');
    if (
      used.has('useHealth') ||
      used.has('useHealthAlert') ||
      used.has('useHeartRateMonitor') ||
      used.has('useHealthHistory') ||
      used.has('useMeasurementSystem')
    ) {
      set.add('health');
    }
    if (
      used.has('useTimeline') ||
      used.has('useTimelineToken') ||
      used.has('useTimelineSubscriptions')
    ) {
      set.add('timeline');
    }
    if (used.has('useSmartstrap')) {
      set.add('smartstrap');
    }
  }
  return [...set];
}

export function scaffoldPebbleProject(dir: string, options: ScaffoldOptions): void {
  if (options.target === 'rocky') {
    mkdirSync(join(dir, 'src', 'rocky'), { recursive: true });
  } else if (options.target === 'c') {
    mkdirSync(join(dir, 'src', 'c'), { recursive: true });
  } else {
    mkdirSync(join(dir, 'src', 'embeddedjs'), { recursive: true });
    mkdirSync(join(dir, 'src', 'c'), { recursive: true });
  }
  mkdirSync(join(dir, 'src', 'pkjs'), { recursive: true });

  // Preserve UUID across builds (or generate a new one)
  let uuid: string;
  const pkgPath = join(dir, 'package.json');
  if (options.uuid) {
    uuid = options.uuid;
  } else if (existsSync(pkgPath)) {
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
  const isRocky = options.target === 'rocky';
  const watchappConfig: Record<string, unknown> = { watchface: options.watchface };
  if (options.hiddenApp) watchappConfig.hiddenApp = true;
  if (options.onlyShownOnCommunication) watchappConfig.onlyShownOnCommunication = true;

  const pebbleConfig: Record<string, unknown> = {
    displayName: options.displayName ?? 'react-pebble-app',
    uuid,
    projectType: isRocky ? 'rocky' : options.target === 'c' ? 'native' : 'moddable',
    sdkVersion: '3',
    versionLabel: options.versionLabel ?? '1.0.0',
    enableMultiJS: options.enableMultiJS ?? true,
    targetPlatforms: (isRocky || options.target === 'c')
      ? [options.platform ?? 'basalt']
      : ['emery', 'gabbro'],
    watchapp: watchappConfig,
    resources: {
      media: buildMediaEntries(options),
      ...(options.publishedMedia && options.publishedMedia.length > 0
        ? { publishedMedia: options.publishedMedia }
        : {}),
    },
  };
  if (options.capabilities && options.capabilities.length > 0) {
    pebbleConfig.capabilities = options.capabilities;
  }
  if (options.worker) {
    pebbleConfig.workerName = options.workerName ?? `${(options.displayName ?? 'react-pebble-app').replace(/\s+/g, '')}_worker`;
  }
  // Rocky.js projects don't support custom messageKeys
  if (!isRocky) {
    const msgKeys: string[] = [...options.messageKeys];
    for (const ck of options.configKeys ?? []) {
      const entry = ck.type === 'checkboxgroup' && ck.size
        ? `${ck.key}[${ck.size}]`
        : ck.key;
      // Avoid duplicates if a config key shares a name with a useMessage key
      if (!msgKeys.includes(entry)) msgKeys.push(entry);
    }
    pebbleConfig.messageKeys = msgKeys.length > 0 ? msgKeys : ['dummy'];
  } else {
    // Rocky.js needs a `main` entry specifying the rockyjs and pkjs paths
    pebbleConfig.main = {
      rockyjs: 'src/rocky/index.js',
      pkjs: 'src/pkjs/index.js',
    };
  }
  const pkg = {
    name: 'react-pebble-app',
    author: 'react-pebble',
    version: '1.0.0',
    keywords: ['pebble-app'],
    private: true,
    dependencies: {},
    pebble: pebbleConfig,
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // wscript — Rocky.js projects use bin_type='rocky' on pbl_bundle,
  // other targets use the standard C build via pbl_build.
  const wscriptPath = join(dir, 'wscript');
  const wscriptContent = isRocky ? ROCKY_WSCRIPT_TEMPLATE : WSCRIPT_TEMPLATE;
  writeFileSync(wscriptPath, wscriptContent);

  // Alloy-only: C stub and Moddable manifest (skip for native C target)
  if (!isRocky && options.target !== 'c') {
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

    const manifestPath = join(dir, 'src', 'embeddedjs', 'manifest.json');
    const manifestObj: Record<string, unknown> = {
      include: ['$(MODDABLE)/examples/manifest_mod.json'],
      modules: { '*': './main.js' },
    };
    if (options.imageResources && options.imageResources.length > 0) {
      manifestObj.resources = {
        '*': options.imageResources.map(src =>
          './resources/' + src.replace(/^.*\//, '').replace(/\.[^.]+$/, ''),
        ),
      };
    }
    writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2) + '\n');
  }

  // Collect every source file that needs to be copied into the build
  // project: auto-detected images + user-declared resources + any
  // platform-specific override paths.
  const filesToCopy: string[] = [];
  if (options.imageResources) filesToCopy.push(...options.imageResources);
  if (options.resources) {
    for (const r of options.resources) {
      filesToCopy.push(r.file);
      if (r.targetPlatforms) {
        for (const p of Object.values(r.targetPlatforms)) filesToCopy.push(p);
      }
    }
  }

  // Always clean the resources directory before copying so stale resources
  // from previous builds (e.g. a font from a different example) don't leak
  // into the current pbw and confuse the emulator.
  const moddableResDir = join(dir, 'src', 'embeddedjs', 'resources');
  const pebbleResDir = join(dir, 'resources');
  if (existsSync(pebbleResDir)) rmSync(pebbleResDir, { recursive: true, force: true });
  if (existsSync(moddableResDir)) rmSync(moddableResDir, { recursive: true, force: true });

  if (filesToCopy.length > 0) {
    // Alloy builds need the moddable resources dir too
    if (!isRocky && options.target !== 'c') {
      mkdirSync(moddableResDir, { recursive: true });
    }
    mkdirSync(pebbleResDir, { recursive: true });
    for (const src of filesToCopy) {
      const fileName = src.replace(/^.*\//, '');
      const srcPath = options.projectRoot ? resolve(options.projectRoot, src) : resolve(src);
      if (existsSync(srcPath)) {
        copyFileSync(srcPath, join(pebbleResDir, fileName));
        // Copy bitmap-style assets into the Moddable resources dir so piu's
        // `new Texture(name)` can find them. PDC / fonts / raw / TTF don't
        // have Moddable equivalents — they're loaded via the Pebble C SDK.
        if (!isRocky && options.target !== 'c' && /\.(png|jpg|jpeg|gif|bmp)$/i.test(fileName)) {
          copyFileSync(srcPath, join(moddableResDir, fileName));
        }
        // Moddable's piu `Texture` can't decode APNG or PDC-sequence. When
        // the user ships such an animated resource, also copy the `.png`
        // sibling (same basename) so the Alloy target can render a static
        // first frame. The generated piu code references that .png name.
        if (!isRocky && options.target !== 'c' && /\.(apng|pdcs)$/i.test(fileName)) {
          const pngFallback = srcPath.replace(/\.(apng|pdcs)$/i, '.png');
          if (existsSync(pngFallback)) {
            const pngFile = fileName.replace(/\.(apng|pdcs)$/i, '.png');
            copyFileSync(pngFallback, join(moddableResDir, pngFile));
            copyFileSync(pngFallback, join(pebbleResDir, pngFile));
          }
        }
      }
    }
  }

  // Background worker: copy user's C source into worker_src/c/ so wscript
  // picks it up (wscript auto-detects the directory's existence).
  if (options.worker) {
    const workerSrcPath = options.projectRoot
      ? resolve(options.projectRoot, options.worker)
      : resolve(options.worker);
    if (!existsSync(workerSrcPath)) {
      throw new Error(`[react-pebble] worker source not found: ${workerSrcPath}`);
    }
    if (!workerSrcPath.endsWith('.c')) {
      throw new Error(
        `[react-pebble] worker must be a .c file (found ${options.worker}). ` +
        `Workers run in plain C; they cannot host the Alloy or Rocky JS runtime.`,
      );
    }
    const workerDir = join(dir, 'worker_src', 'c');
    mkdirSync(workerDir, { recursive: true });
    copyFileSync(workerSrcPath, join(workerDir, 'worker.c'));
  }

  // Phone-side JS
  const pkjsPath = join(dir, 'src', 'pkjs', 'index.js');
  if (options.messageKeys.length > 0 && options.messageKeys[0] !== 'dummy') {
    const key = options.messageKeys[0]!;
    const mockSrc = options.mockDataSource;
    // Rocky targets use native postMessage (raw JS objects).
    // Alloy/C targets use the AppMessage dictionary protocol.
    const sendCall = isRocky
      ? `Pebble.postMessage({ "${key}": data });
    console.log("Data posted to watch.");`
      : `Pebble.sendAppMessage(
      { "${key}": JSON.stringify(data) },
      function() { console.log("Data sent to watch successfully."); },
      function(e) { console.log("Send failed: " + JSON.stringify(e)); }
    );`;
    const exampleSendComment = isRocky
      ? `  // Pebble.postMessage({ "${key}": data });`
      : `  // Pebble.sendAppMessage({ "${key}": JSON.stringify(data) });`;
    const protocolNote = isRocky
      ? 'sends mock data to watch via Rocky postMessage'
      : 'sends mock data to watch via AppMessage';
    if (mockSrc) {
      // Generate working phone-side JS that sends the mock data
      // Strip TypeScript type annotations from the mock data source
      const cleanMockSrc = mockSrc
        .replace(/as\s+const/g, '')
        .replace(/:\s*\w+(\[\])?/g, '')
        .replace(/<[^>]+>/g, '');
      writeFileSync(
        pkjsPath,
        `// Phone-side PebbleKit JS — ${protocolNote}.
// Replace the mock data below with a real API fetch.

Pebble.addEventListener("ready", function () {
  console.log("Phone JS ready — sending data to watch...");

  // Mock data (from example). Replace with fetch() for real data.
  var data = ${cleanMockSrc};

  // Send to watch after a short delay (wait for message subscription)
  setTimeout(function() {
    ${sendCall}
  }, 2000);
});
`,
      );
    } else {
      writeFileSync(
        pkjsPath,
        `// Phone-side PebbleKit JS — ${protocolNote}.
// Replace the placeholder below with a real API fetch.

Pebble.addEventListener("ready", function () {
  console.log("Phone JS ready.");
  // Example: fetch data and send to watch
  // var data = { key: "value" };
${exampleSendComment}
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

const ROCKY_WSCRIPT_TEMPLATE = `#
# Pebble SDK build configuration for Rocky.js (auto-generated by react-pebble plugin)
#
top = '.'
out = 'build'

def options(ctx):
    ctx.load('pebble_sdk')

def configure(ctx):
    ctx.load('pebble_sdk')

def build(ctx):
    ctx.load('pebble_sdk')
    ctx.pbl_bundle(js=ctx.path.ant_glob(['src/pkjs/**/*.js',
                                         'src/pkjs/**/*.json',
                                         'src/common/**/*.js']),
                   js_entry_file='src/pkjs/index.js',
                   bin_type='rocky')
`;

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
