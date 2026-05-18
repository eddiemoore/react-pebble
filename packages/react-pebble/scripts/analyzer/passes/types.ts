/**
 * scripts/analyzer/passes/types.ts — Pass Interface for the SourceScan walker.
 *
 * A Pass is a static-analysis Adapter at the SourceScan Seam. It receives every
 * AST node once via `enter`, accumulates internal state, and produces its
 * contribution to the ScanResult via `finalize`. PassContext exposes the
 * shared SourceFile and a pre-built import map from `react-pebble` /
 * `react-pebble/hooks` (lifted from `detectHookUsages` so every Pass gets
 * symbol-aware identification for free).
 */

import ts from 'typescript';

export interface Pass<T> {
  readonly name: string;
  enter(node: ts.Node): void;
  finalize(): T;
}

export interface PassContext {
  readonly sf: ts.SourceFile;
  /** Local binding name → canonical export name, for imports from react-pebble. */
  readonly importedFromReactPebble: ReadonlyMap<string, string>;
}

export const HOOK_MODULE_SPECIFIERS: readonly string[] = [
  'react-pebble',
  'react-pebble/hooks',
];

export function buildPassContext(
  sf: ts.SourceFile,
  specifiers: readonly string[] = HOOK_MODULE_SPECIFIERS,
): PassContext {
  const allowed = new Set(specifiers);
  const localToCanonical = new Map<string, string>();
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    const spec = node.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || !allowed.has(spec.text)) return;
    const named = node.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) return;
    for (const el of named.elements) {
      const canonical = (el.propertyName ?? el.name).text;
      localToCanonical.set(el.name.text, canonical);
    }
  });
  return { sf, importedFromReactPebble: localToCanonical };
}
