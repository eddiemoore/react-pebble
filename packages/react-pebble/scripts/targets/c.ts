/**
 * scripts/targets/c.ts — Pebble C SDK Target Adapter.
 *
 * Wraps emit-c.ts behind the Target Interface. Honors `ir.appMessageSizes`
 * when callers want to bound the AppMessage buffer (env vars
 * APPMSG_INBOX_SIZE / APPMSG_OUTBOX_SIZE in the CLI orchestrator).
 */

import type { CompilerIR } from '../compiler-ir.js';
import { emitC } from '../emit-c.js';
import type { Target, TargetContext, TargetResult, Diagnostic } from './types.js';
import { needsPKJS, buildPKJS } from './pkjs.js';

export const cTarget: Target = {
  name: 'c',

  validate(_ir: CompilerIR, _hooksUsed: string[]): Diagnostic[] {
    return [];
  },

  emit(ir: CompilerIR, ctx: TargetContext): TargetResult {
    const code = emitC(ir);
    const result: TargetResult = { code, diagnostics: [] };
    if (needsPKJS(ir, ctx.hooksUsed)) {
      result.pkjsCode = buildPKJS({ ir, hooksUsed: ctx.hooksUsed, target: 'c' });
    }
    return result;
  },
};
