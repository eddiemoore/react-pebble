/**
 * src/compiler/index.ts — react-pebble compile-to-piu library API.
 *
 * Wraps the compile-to-piu.ts script as a programmatic API. The script
 * runs as a subprocess (it uses module-level state that requires process
 * isolation). A future refactoring will inline the logic as a pure function.
 *
 * Usage:
 *   import { compileToPiu } from 'react-pebble/compiler';
 *   const result = await compileToPiu({ entry: 'examples/watchface.tsx' });
 *   console.log(result.code); // piu Application.template JS
 */

import { execSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CompileOptions {
  /** Path to the entry .tsx file (relative to cwd or absolute) */
  entry: string;
  /** Milliseconds to wait for async effects (useEffect/setTimeout) */
  settleMs?: number;
  /** Target platform (default: 'emery') */
  platform?: string;
  /** Compilation target: 'alloy' for piu/Moddable, 'rocky' for classic Pebble */
  target?: 'alloy' | 'rocky' | 'c';
  /** Logger for diagnostic messages */
  logger?: (msg: string) => void;
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /**
   * Optional override for AppMessage inbox/outbox sizes (C target only).
   * When omitted, the C emitter uses `app_message_*_size_maximum()`. When
   * either field is set, the other falls back to the 'maximum' call.
   */
  appMessageSizes?: { inboxSize?: number; outboxSize?: number };
}

export interface CompileResult {
  /** The compiled piu JavaScript code */
  code: string;
  /** Whether the component uses useButton (needs watchapp mode) */
  hasButtons: boolean;
  /** Message keys used by useMessage hooks */
  messageKeys: string[];
  /** Mock data source from useMessage (for generating phone-side JS) */
  mockDataSource: string | null;
  /** Image resource paths referenced in the component */
  imageResources: string[];
  /** Names of react-pebble hooks referenced in the entry source */
  hooksUsed: string[];
  /** Generated PebbleKit JS companion code (null if no phone communication needed) */
  pebbleKitJS: string | null;
  /** Config keys with their types and sizes (for messageKeys emission). */
  configKeys: Array<{ key: string; type: string; size?: number }>;
  /** Diagnostic messages from the compiler */
  diagnostics: string;
}

/**
 * Compile a Preact component to piu Application.template code.
 *
 * Internally runs scripts/compile-to-piu.ts as a subprocess.
 */
export async function compileToPiu(options: CompileOptions): Promise<CompileResult> {
  const log = options.logger ?? (() => {});
  const projectRoot = options.projectRoot ?? process.cwd();

  // Resolve the entry path — pass the full path so the script can find it
  // whether it's an internal example or an external project file
  const entryPath = resolve(projectRoot, options.entry);
  const exampleName = basename(entryPath).replace(/\.[jt]sx?$/, '');

  // Find the compiler script
  const scriptPath = resolve(__dirname, '../../scripts/compile-to-piu.ts');
  if (!existsSync(scriptPath)) {
    throw new Error(`Compiler script not found at ${scriptPath}`);
  }

  log(`Compiling ${exampleName}...`);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    EXAMPLE: entryPath,
  };
  if (options.settleMs) {
    env.SETTLE_MS = String(options.settleMs);
  }
  if (options.platform) {
    env.PEBBLE_PLATFORM = options.platform;
  }
  if (options.target) {
    env.COMPILE_TARGET = options.target;
  }
  if (options.appMessageSizes?.inboxSize !== undefined) {
    env.APPMSG_INBOX_SIZE = String(options.appMessageSizes.inboxSize);
  }
  if (options.appMessageSizes?.outboxSize !== undefined) {
    env.APPMSG_OUTBOX_SIZE = String(options.appMessageSizes.outboxSize);
  }

  // Run the compiler script and capture stdout (code) + stderr (diagnostics)
  let code: string;
  let diagnostics: string;
  try {
    code = execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      env,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Re-run to capture stderr separately (execSync doesn't give both easily)
    try {
      diagnostics = execSync(`npx tsx "${scriptPath}" 2>&1 1>/dev/null`, {
        cwd: projectRoot,
        env,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch {
      diagnostics = '';
    }
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`Compilation failed for ${exampleName}: ${e.stderr ?? e.message}`);
  }

  // Parse diagnostics to extract metadata
  const hasButtons = diagnostics.includes('Button bindings discovered:') &&
    !diagnostics.includes('Button bindings discovered: 0');
  const messageKeys: string[] = [];
  const msgMatch = diagnostics.match(/useMessage detected: key="([^"]+)"/);
  if (msgMatch?.[1]) messageKeys.push(msgMatch[1]);

  // Extract mock data source for phone-side JS generation
  let mockDataSource: string | null = null;
  const mockMatch = diagnostics.match(/mockDataValue=([\s\S]*?)(?:\n[A-Z]|\n$)/);
  if (mockMatch?.[1]) mockDataSource = mockMatch[1].trim();

  // Extract image resources
  const imgMatch = diagnostics.match(/imageResources=(\[.*?\])/);
  const imageResources: string[] = imgMatch?.[1] ? JSON.parse(imgMatch[1]) : [];

  // Extract hook usage (for capability auto-inference)
  const hooksMatch = diagnostics.match(/hooksUsed=(\[.*?\])/);
  const hooksUsed: string[] = hooksMatch?.[1] ? JSON.parse(hooksMatch[1]) : [];

  // Extract PebbleKit JS companion code if generated
  let pebbleKitJS: string | null = null;
  const pkjsMatch = diagnostics.match(/--- PebbleKit JS \(src\/pkjs\/index\.js\) ---\n([\s\S]*?)--- End PebbleKit JS ---/);
  if (pkjsMatch?.[1]) pebbleKitJS = pkjsMatch[1];

  // Extract config keys (for messageKeys emission, including "key[N]" notation)
  const configKeysMatch = diagnostics.match(/configKeys=(\[.*?\])/);
  const configKeys: CompileResult['configKeys'] = configKeysMatch?.[1]
    ? JSON.parse(configKeysMatch[1])
    : [];

  log(`Compiled ${exampleName}: ${code.split('\n').length} lines, buttons=${hasButtons}, messageKeys=[${messageKeys.join(',')}]`);

  return { code, hasButtons, messageKeys, mockDataSource, imageResources, hooksUsed, pebbleKitJS, configKeys, diagnostics };
}
