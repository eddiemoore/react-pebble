/**
 * scripts/targets/piu.ts — piu (Moddable / Alloy) Target Adapter.
 *
 * Wraps the existing emit-piu.ts implementation behind the Target Interface.
 * Calls the shared PKJS helper when the IR requires phone-side code.
 */

import type { CompilerIR } from '../compiler-ir.js';
import { emitPiu } from '../emit-piu.js';
import type { Target, TargetContext, TargetResult, Diagnostic } from './types.js';
import { needsPKJS, buildPKJS } from './pkjs.js';

export const piuTarget: Target = {
  name: 'alloy',

  validate(_ir: CompilerIR): Diagnostic[] {
    return [];
  },

  emit(ir: CompilerIR, ctx: TargetContext): TargetResult {
    const code = emitPiu(ir, ctx.appName);
    const result: TargetResult = { code, diagnostics: [] };
    if (needsPKJS(ir)) {
      result.pkjsCode = buildPKJS({ ir, target: 'alloy' });
    }
    return result;
  },
};
