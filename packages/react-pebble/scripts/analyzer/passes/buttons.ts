/**
 * scripts/analyzer/passes/buttons.ts — ButtonsPass.
 *
 * Records the (button, handlerSource) pair for every `useButton('foo', () => …)`
 * call site in the entry source. First occurrence wins for a given button.
 *
 * Note: matches the textual identifier `useButton` (legacy semantics) rather
 * than resolving via PassContext.importedFromReactPebble. Tightening this is
 * out of scope for the SourceScan refactor.
 */

import ts from 'typescript';
import type { Pass, PassContext } from './types.js';
import { buildPassContext } from './types.js';
import { walk } from '../source-scan.js';

export interface ButtonBinding {
  button: string;
  handlerSource: string;
}

export function makeButtonsPass(ctx: PassContext): Pass<ButtonBinding[]> {
  const bindings: ButtonBinding[] = [];
  return {
    name: 'buttons',
    enter(node) {
      if (!ts.isCallExpression(node)) return;
      if (!ts.isIdentifier(node.expression) || node.expression.text !== 'useButton') return;
      if (node.arguments.length < 2) return;
      const firstArg = node.arguments[0]!;
      if (!ts.isStringLiteral(firstArg)) return;
      const button = firstArg.text;
      const handlerNode = node.arguments[1]!;
      const handlerSource = handlerNode.getText(ctx.sf);
      if (!bindings.some((b) => b.button === button)) {
        bindings.push({ button, handlerSource });
      }
    },
    finalize() {
      return bindings;
    },
  };
}

/** Back-compat wrapper matching the legacy `extractButtonBindingsFromSource` signature. */
export function extractButtonBindings(sf: ts.SourceFile): ButtonBinding[] {
  const ctx = buildPassContext(sf);
  const pass = makeButtonsPass(ctx);
  walk(sf, (n) => pass.enter(n));
  return pass.finalize();
}
