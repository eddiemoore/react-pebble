/**
 * scripts/targets/rocky.ts — Rocky.js Target Adapter.
 *
 * Wraps emit-rocky.ts behind the Target Interface. Owns the compile-time
 * guardrail list for hooks Rocky.js can't support (no hardware buttons on
 * watchfaces, no on-watch network APIs, no on-watch storage).
 */

import type { CompilerIR } from '../compiler-ir.js';
import { emitRocky } from '../emit-rocky.js';
import type { Target, TargetContext, TargetResult, Diagnostic } from './types.js';
import { needsPKJS, buildPKJS } from './pkjs.js';

/**
 * Hooks Rocky.js cannot support, mapped to the reason. The orchestrator
 * surfaces these as errors before emit runs.
 */
const ROCKY_BLOCKED_HOOKS: Record<string, string> = {
  useButton: 'button events',
  useLongButton: 'button events',
  useMultiClick: 'button events',
  useRepeatClick: 'button events',
  useRawClick: 'button events',
  useFetch: 'on-watch network APIs (route network requests through PKJS via useMessage)',
  useHTTPClient: 'on-watch network APIs (route network requests through PKJS via useMessage)',
  useWebSocket: 'on-watch network APIs (route network requests through PKJS via useMessage)',
  useLocalStorage: 'on-watch storage',
  useKVStorage: 'on-watch storage',
  useFileStorage: 'on-watch storage',
};

export const rockyTarget: Target = {
  name: 'rocky',

  validate(_ir: CompilerIR, hooksUsed: string[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const hook of hooksUsed) {
      const reason = ROCKY_BLOCKED_HOOKS[hook];
      if (reason) {
        diagnostics.push({
          severity: 'error',
          hookName: hook,
          message: `${hook} is not supported on the Rocky.js target (no ${reason}).`,
        });
      }
    }
    return diagnostics;
  },

  emit(ir: CompilerIR, ctx: TargetContext): TargetResult {
    const code = emitRocky(ir);
    const result: TargetResult = { code, diagnostics: [] };
    if (needsPKJS(ir, ctx.hooksUsed)) {
      result.pkjsCode = buildPKJS({ ir, hooksUsed: ctx.hooksUsed, target: 'rocky' });
    }
    return result;
  },
};
