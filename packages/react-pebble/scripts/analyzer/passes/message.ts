/**
 * scripts/analyzer/passes/message.ts — MessagePass.
 *
 * Detects `useMessage({ key, mockData })` and, in the same walk, harvests
 * every top-level `const arr = […]` initializer so `mockData: someArray` can
 * be resolved without a second pass. Folds the legacy
 * `detectUseMessage + extractMockDataSource` pair into a single pass.
 *
 * Matches the textual identifier `useMessage` (legacy semantics).
 */

import ts from 'typescript';
import type { Pass, PassContext } from './types.js';
import { buildPassContext } from './types.js';
import { walk } from '../source-scan.js';

export interface MessageInfo {
  key: string;
  mockDataArrayName: string | null;
  mockDataSource: string | null;
}

export function makeMessagePass(ctx: PassContext): Pass<MessageInfo | null> {
  let key: string | null = null;
  let mockDataArrayName: string | null = null;
  const varInits = new Map<string, string>();

  return {
    name: 'message',
    enter(node) {
      // Harvest every `var <name> = <init>` for mock-data lookup later.
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        varInits.set(node.name.text, node.initializer.getText(ctx.sf));
      }

      // Match `useMessage({ key: 'foo', mockData: arrName })`.
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'useMessage' &&
        node.arguments.length > 0 &&
        ts.isObjectLiteralExpression(node.arguments[0]!)
      ) {
        const objLit = node.arguments[0] as ts.ObjectLiteralExpression;
        for (const prop of objLit.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
          if (prop.name.text === 'key' && ts.isStringLiteral(prop.initializer)) {
            key = prop.initializer.text;
          }
          if (prop.name.text === 'mockData' && ts.isIdentifier(prop.initializer)) {
            mockDataArrayName = prop.initializer.text;
          }
        }
      }
    },
    finalize() {
      if (!key) return null;
      const mockDataSource = mockDataArrayName !== null
        ? (varInits.get(mockDataArrayName) ?? null)
        : null;
      return { key, mockDataArrayName, mockDataSource };
    },
  };
}

/** Back-compat wrapper matching the legacy `detectUseMessage` signature. */
export function detectUseMessage(sf: ts.SourceFile): { key: string; mockDataArrayName: string | null } | null {
  const ctx = buildPassContext(sf);
  const pass = makeMessagePass(ctx);
  walk(sf, (n) => pass.enter(n));
  const r = pass.finalize();
  if (!r) return null;
  return { key: r.key, mockDataArrayName: r.mockDataArrayName };
}

/** Back-compat wrapper matching the legacy `extractMockDataSource` signature. */
export function extractMockDataSource(sf: ts.SourceFile, mockDataArrayName: string): string | null {
  const ctx = buildPassContext(sf);
  const pass = makeMessagePass(ctx);
  walk(sf, (n) => pass.enter(n));
  const r = pass.finalize();
  if (r?.mockDataArrayName === mockDataArrayName && r.mockDataSource) {
    return r.mockDataSource;
  }
  // Fall back to a direct lookup (legacy behavior allowed any var name regardless of useMessage result).
  let result: string | null = null;
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === mockDataArrayName &&
      n.initializer
    ) {
      result = n.initializer.getText(sf);
    }
  });
  return result;
}
