/**
 * scripts/analyzer/ — SourceScan walker, parser, and Pass implementations.
 * Imported by `scripts/analyze.ts`.
 */

export { parseEntry } from './parse-entry.js';
export {
  scanSource,
  scanEntry,
  walk,
  type ScanResult,
  type PassFactory,
} from './source-scan.js';
export {
  type Pass,
  type PassContext,
  HOOK_MODULE_SPECIFIERS,
  buildPassContext,
} from './passes/types.js';
