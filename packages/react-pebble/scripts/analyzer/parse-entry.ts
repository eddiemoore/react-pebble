/**
 * scripts/analyzer/parse-entry.ts — Resolve and parse the entry source file
 * into a `ts.SourceFile` consumed by the SourceScan walker. Single source of
 * truth: every Analyzer run builds exactly one AST per entry.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Counter incremented on every successful `parseEntry` call. Exposed for the
 * `test/source-scan-parse-count.test.ts` behavioural invariant — see the
 * SourceScan section of CONTEXT.md.
 */
export const _entryBuildCount = { value: 0 };

export function parseEntry(exName: string): ts.SourceFile | null {
  if (exName.startsWith('/')) {
    try {
      const source = readFileSync(exName, 'utf-8');
      _entryBuildCount.value++;
      return ts.createSourceFile(exName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch { /* fall through */ }
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '']) {
    const srcPath = exName.startsWith('/')
      ? `${exName}${ext}`
      : resolve('examples', `${exName}${ext}`);
    try {
      const source = readFileSync(srcPath, 'utf-8');
      _entryBuildCount.value++;
      return ts.createSourceFile(srcPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch { continue; }
  }
  return null;
}
