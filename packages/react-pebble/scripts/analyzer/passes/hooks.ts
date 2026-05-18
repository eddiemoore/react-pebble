/**
 * scripts/analyzer/passes/hooks.ts — HooksPass.
 *
 * Records every call site of a binding imported from `react-pebble` /
 * `react-pebble/hooks`. The import-symbol map lives on the shared
 * PassContext, so detection is purely a CallExpression walk here.
 *
 * See docs/adr/0003-hook-detection-in-analyzer.md for semantics.
 */

import ts from 'typescript';
import type { HookUsage } from '../../compiler-ir.js';
import type { Pass, PassContext } from './types.js';
import { buildPassContext } from './types.js';
import { walk } from '../source-scan.js';

export function makeHooksPass(ctx: PassContext): Pass<HookUsage[]> {
  const usages: HookUsage[] = [];
  return {
    name: 'hooks',
    enter(node) {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
      const canonical = ctx.importedFromReactPebble.get(node.expression.text);
      if (canonical === undefined) return;
      const { line, character } = ctx.sf.getLineAndCharacterOfPosition(
        node.expression.getStart(ctx.sf),
      );
      usages.push({ name: canonical, line: line + 1, col: character + 1 });
    },
    finalize() {
      return usages;
    },
  };
}

/**
 * Standalone hook detection — preserved for back-compat with the legacy
 * `detectHookUsages(sf)` signature (snapshot tests, the public re-export
 * from `scripts/analyze.ts`). Implemented on the Pass + walker so there
 * is one source of truth.
 */
export function detectHookUsages(
  sf: ts.SourceFile,
  specifiers?: readonly string[],
): HookUsage[] {
  const ctx = buildPassContext(sf, specifiers);
  const pass = makeHooksPass(ctx);
  walk(sf, (n) => pass.enter(n));
  return pass.finalize();
}
