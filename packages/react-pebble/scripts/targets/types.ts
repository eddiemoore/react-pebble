/**
 * scripts/targets/types.ts — Target Interface.
 *
 * A Target is an output backend. Each Adapter (piu, rocky, c) implements
 * this Interface. The orchestrator picks an Adapter by name from the registry
 * and never branches on target.
 *
 * See: docs/adr/0001-target-adapter-seam.md
 *      docs/adr/0002-pkjs-as-sub-output.md
 *      CONTEXT.md (Target, CompilerIR, Adapter, PKJS)
 */

import type { CompilerIR } from '../compiler-ir.js';

export type TargetName = 'alloy' | 'rocky' | 'c';

export interface TargetContext {
  /** App / window class name (used by piu for window class identifier). */
  appName: string;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  hookName?: string;
}

export interface TargetResult {
  /** Watch-side code (piu JS, Rocky.js JS, or Pebble C). */
  code: string;
  /** PebbleKit JS sub-output (phone-side), if this Target needed it. */
  pkjsCode?: string;
  /** Non-fatal warnings produced during emission. */
  diagnostics: Diagnostic[];
}

export interface Target {
  name: TargetName;
  /**
   * Cheap pre-emit checks. Return errors before `emit` is called so the
   * orchestrator can fail fast without running the full code generator.
   * Rocky uses this to block hooks that require hardware Rocky.js can't expose.
   */
  validate(ir: CompilerIR): Diagnostic[];
  /** Emit watch-side code (and optional PKJS sub-output) from the IR. */
  emit(ir: CompilerIR, ctx: TargetContext): TargetResult;
}
