/**
 * scripts/analyzer/source-scan.ts — Single AST traversal of the entry source.
 *
 * Builds the PassContext once, walks the SourceFile once, and dispatches every
 * node to every registered Pass. Each Pass contributes one field to the
 * ScanResult via its `finalize()`. See CONTEXT.md for the SourceScan concept
 * and `passes/types.ts` for the Pass<T> Interface.
 */

import ts from 'typescript';
import type { Pass, PassContext } from './passes/types.js';
import { buildPassContext } from './passes/types.js';

export function walk(node: ts.Node, visitor: (n: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

import type { HookUsage } from '../compiler-ir.js';
import type { ButtonBinding } from './passes/buttons.js';
import type { SetterInfo } from './passes/setters.js';
import type { ListInfoRaw } from './passes/list.js';
import type { MessageInfo } from './passes/message.js';
import type { ConfigInfoRaw } from './passes/configuration.js';
import { makeHooksPass } from './passes/hooks.js';
import { makeButtonsPass } from './passes/buttons.js';
import { makeSettersPass } from './passes/setters.js';
import { makeListPass } from './passes/list.js';
import { makeMessagePass } from './passes/message.js';
import { makeConfigPass } from './passes/configuration.js';

/**
 * ScanResult — the typed product of one SourceScan. Every field is produced
 * by exactly one Pass (see `analyzer/passes/*`).
 */
export interface ScanResult {
  hooks: HookUsage[];
  buttons: ButtonBinding[];
  setters: SetterInfo[];
  list: ListInfoRaw | null;
  message: MessageInfo | null;
  config: ConfigInfoRaw | null;
}

/**
 * scanEntry — run the SourceScan with the default Pass list and return the
 * typed ScanResult. One AST traversal; every Pass sees every node once.
 */
export function scanEntry(
  sf: ts.SourceFile,
  hookModuleSpecifiers?: readonly string[],
): ScanResult {
  const ctxSpecOverride = hookModuleSpecifiers;
  const result = scanSource(sf, [
    (c) => makeHooksPass(c),
    (c) => makeButtonsPass(c),
    (c) => makeSettersPass(c),
    (c) => makeListPass(c),
    (c) => makeMessagePass(c),
    (c) => makeConfigPass(c),
  ], ctxSpecOverride);
  return {
    hooks: result['hooks'] as HookUsage[],
    buttons: result['buttons'] as ButtonBinding[],
    setters: result['setters'] as SetterInfo[],
    list: result['list'] as ListInfoRaw | null,
    message: result['message'] as MessageInfo | null,
    config: result['config'] as ConfigInfoRaw | null,
  };
}

export type PassFactory<T> = (ctx: PassContext) => Pass<T>;

/**
 * Run a SourceScan: build context, instantiate every Pass via its factory,
 * walk the AST once, and collect each Pass's finalized output keyed by name.
 *
 * Callers expecting a typed `ScanResult` should cast or destructure the
 * returned record by known pass names; the Pass list grows over the migration
 * (see plans/sorted-munching-flask.md).
 */
export function scanSource(
  sf: ts.SourceFile,
  passFactories: ReadonlyArray<PassFactory<unknown>>,
  hookModuleSpecifiers?: readonly string[],
): Record<string, unknown> {
  const ctx = buildPassContext(sf, hookModuleSpecifiers);
  const passes = passFactories.map((f) => f(ctx));
  walk(sf, (node) => {
    for (const p of passes) p.enter(node);
  });
  const out: Record<string, unknown> = {};
  for (const p of passes) out[p.name] = p.finalize();
  return out;
}
