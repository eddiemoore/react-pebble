/**
 * scripts/analyzer/passes/setters.ts — SettersPass.
 *
 * Records every `const [_, setX] = useState(initialValue)` declaration in the
 * entry source. Output feeds the setter→slot resolver in analyze.ts.
 *
 * Matches the textual identifier `useState` (legacy semantics).
 */

import ts from 'typescript';
import type { Pass, PassContext } from './types.js';
import { buildPassContext } from './types.js';
import { walk } from '../source-scan.js';

export interface SetterInfo {
  name: string;
  initValue: unknown;
}

export function makeSettersPass(_ctx: PassContext): Pass<SetterInfo[]> {
  const result: SetterInfo[] = [];
  return {
    name: 'setters',
    enter(node) {
      if (!ts.isVariableDeclaration(node)) return;
      if (!node.initializer || !ts.isCallExpression(node.initializer)) return;
      const callee = node.initializer.expression;
      if (!ts.isIdentifier(callee) || callee.text !== 'useState') return;
      if (!ts.isArrayBindingPattern(node.name)) return;
      const elements = node.name.elements;
      if (elements.length < 2) return;
      const setterElement = elements[1]!;
      if (ts.isOmittedExpression(setterElement)) return;
      const setterName = setterElement.name;
      if (!ts.isIdentifier(setterName)) return;

      let initValue: unknown = undefined;
      const arg = node.initializer.arguments[0];
      if (arg) {
        if (ts.isNumericLiteral(arg)) initValue = Number(arg.text);
        else if (ts.isStringLiteral(arg)) initValue = arg.text;
        else if (arg.kind === ts.SyntaxKind.TrueKeyword) initValue = true;
        else if (arg.kind === ts.SyntaxKind.FalseKeyword) initValue = false;
      }

      result.push({ name: setterName.text, initValue });
    },
    finalize() {
      return result;
    },
  };
}

/** Back-compat wrapper matching the legacy `buildSetterInfo` signature. */
export function buildSetterInfo(sf: ts.SourceFile): SetterInfo[] {
  const ctx = buildPassContext(sf);
  const pass = makeSettersPass(ctx);
  walk(sf, (n) => pass.enter(n));
  return pass.finalize();
}
