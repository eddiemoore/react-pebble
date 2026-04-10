/**
 * scripts/compile-to-piu.ts — "React → piu" compiler.
 *
 * Phase 1: renders the component in mock mode, snapshots the pebble-dom
 * tree, emits piu Application.template JS code.
 *
 * Phase 2: renders at TWO different mock times, diffs the label texts to
 * identify time-dependent labels, and emits a piu Behavior that updates
 * them every second via `onTimeChanged`.
 *
 * Phase 3 (this version): intercepts useState and useButton to detect
 * state-dependent labels and button bindings, emits a unified AppBehavior
 * that handles both time ticks and state reactivity (counter patterns).
 *
 * Usage:
 *   EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
 *   EXAMPLE=counter  npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
 */

import ts from 'typescript';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render } from '../src/index.js';
import type { DOMElement, AnyNode } from '../src/pebble-dom.js';
import { getTextContent } from '../src/pebble-dom.js';
import { COLOR_PALETTE } from '../src/pebble-output.js';
import { _setUseStateImpl, _restoreUseState } from '../src/hooks/index.js';
import { useState as realUseState } from 'preact/hooks';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Dynamic example import
// ---------------------------------------------------------------------------

const exampleInput = process.env.EXAMPLE ?? 'watchface';
const settleMs = Number(process.env.SETTLE_MS ?? '0');
const platform = process.env.PEBBLE_PLATFORM ?? 'emery';
const settle = () =>
  settleMs > 0 ? new Promise<void>((r) => setTimeout(r, settleMs)) : Promise.resolve();

// Set platform screen dimensions before importing the example
import { _setPlatform, SCREEN } from '../src/platform.js';
_setPlatform(platform);

// Resolve the entry: could be a bare name (e.g., "watchface") for internal examples,
// or an absolute/relative path (e.g., "/tmp/my-app/src/App.tsx") for external projects.
let entryPath: string;
let exampleName: string;
if (exampleInput.includes('/') || exampleInput.includes('\\')) {
  // Absolute or relative path — resolve from cwd
  entryPath = resolve(exampleInput);
  exampleName = entryPath.replace(/\.[jt]sx?$/, '').split('/').pop()!;
} else {
  // Bare name — look in ../examples/
  entryPath = resolve(__dirname, '..', 'examples', `${exampleInput}.tsx`);
  exampleName = exampleInput;
}

const exampleMod = await import(entryPath);
const exampleMain: (...args: unknown[]) => ReturnType<typeof render> =
  exampleMod.main ?? exampleMod.default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function colorToHex(name: string): string {
  const rgb = COLOR_PALETTE[name];
  if (!rgb) return name;
  const r = rgb.r.toString(16).padStart(2, '0');
  const g = rgb.g.toString(16).padStart(2, '0');
  const b = rgb.b.toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

const FONT_TO_PIU: Record<string, string> = {
  // Gothic family
  gothic14: '14px Gothic',
  gothic14Bold: 'bold 14px Gothic',
  gothic18: '18px Gothic',
  gothic18Bold: 'bold 18px Gothic',
  gothic24: '24px Gothic',
  gothic24Bold: 'bold 24px Gothic',
  gothic28: '28px Gothic',
  gothic28Bold: 'bold 28px Gothic',
  // Bitham family
  bitham30Black: 'black 30px Bitham',
  bitham42Bold: 'bold 42px Bitham',
  bitham42Light: 'light 42px Bitham',
  bitham34MediumNumbers: '34px Bitham',
  bitham42MediumNumbers: '42px Bitham',
  // Roboto family
  robotoCondensed21: '21px Roboto Condensed',
  roboto21: '21px Roboto',
  // Droid Serif
  droid28: '28px Droid Serif',
  // LECO family
  leco20: '20px LECO',
  leco26: '26px LECO',
  leco28: '28px LECO',
  leco32: '32px LECO',
  leco36: '36px LECO',
  leco38: '38px LECO',
  leco42: '42px LECO',
};

function fontToPiu(name: string | undefined): string {
  if (!name) return '18px Gothic';
  return FONT_TO_PIU[name] ?? '18px Gothic';
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  return typeof v === 'number' ? v : 0;
}

function str(p: Record<string, unknown>, key: string): string | undefined {
  const v = p[key];
  return typeof v === 'string' ? v : undefined;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

// ---------------------------------------------------------------------------
// useState interception
// ---------------------------------------------------------------------------

interface StateSlot {
  index: number;
  initialValue: unknown;
  setter: (v: unknown) => void;
  currentValue: unknown;
}

const stateSlots: StateSlot[] = [];
const forcedStateValues: Map<number, unknown> = new Map();
let stateCallCounter = 0;

function resetStateTracking() {
  stateCallCounter = 0;
}

function installUseStateInterceptor() {
  // Swap our hooks module's useState implementation via the exposed
  // _setUseStateImpl setter. This works because counter.tsx imports
  // useState from src/hooks/index.ts, which delegates to a mutable
  // internal reference.
  _setUseStateImpl(function interceptedUseState<T>(
    init: T | (() => T),
  ): [T, (v: T | ((prev: T) => T)) => void] {
    const idx = stateCallCounter++;
    const [realVal, realSetter] = realUseState(init);

    // First render — record the slot
    if (idx >= stateSlots.length) {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      stateSlots.push({
        index: idx,
        initialValue,
        setter: realSetter as (v: unknown) => void,
        currentValue: realVal,
      });
    } else {
      stateSlots[idx]!.currentValue = realVal;
    }

    // If we're in a perturbed render, override the value
    if (forcedStateValues.has(idx)) {
      const forced = forcedStateValues.get(idx) as T;
      return [forced, realSetter];
    }

    return [realVal, realSetter];
  });
}

// ---------------------------------------------------------------------------
// useButton interception
// ---------------------------------------------------------------------------

interface ButtonBinding {
  button: string;
  handlerSource: string;
}

const buttonBindings: ButtonBinding[] = [];

/**
 * Parse an example source file into a TypeScript AST SourceFile.
 */
function parseExampleSource(exName: string): ts.SourceFile | null {
  // If exName is an absolute path, try it directly
  if (exName.startsWith('/')) {
    try {
      const source = readFileSync(exName, 'utf-8');
      return ts.createSourceFile(exName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch { /* fall through to extension search */ }
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '']) {
    const srcPath = exName.startsWith('/')
      ? `${exName}${ext}`
      : resolve(__dirname, '..', 'examples', `${exName}${ext}`);
    try {
      const source = readFileSync(srcPath, 'utf-8');
      return ts.createSourceFile(srcPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch { continue; }
  }
  return null;
}

/**
 * Walk all nodes in a TypeScript AST.
 */
function walkAST(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, child => walkAST(child, visitor));
}

/**
 * Statically analyze the example source file to extract useButton calls
 * using TypeScript AST parsing.
 */
function extractButtonBindingsFromSource(exName: string): void {
  const sf = parseExampleSource(exName);
  if (!sf) return;

  walkAST(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    // Check callee is identifier `useButton`
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'useButton') return;
    if (node.arguments.length < 2) return;
    const firstArg = node.arguments[0]!;
    if (!ts.isStringLiteral(firstArg)) return;
    const button = firstArg.text;
    const handlerNode = node.arguments[1]!;
    const handlerSource = handlerNode.getText(sf);
    if (!buttonBindings.some((b) => b.button === button)) {
      buttonBindings.push({ button, handlerSource });
    }
  });
}

// ---------------------------------------------------------------------------
// Button handler analysis
// ---------------------------------------------------------------------------

interface HandlerAction {
  type: 'increment' | 'decrement' | 'reset' | 'toggle' | 'set_string';
  slotIndex: number;
  value: number;
  stringValue?: string; // for set_string
}

/**
 * Extract a setter→slot index map from source by walking the AST for
 * `const [name, setName] = useState(...)` variable declarations.
 */
function buildSetterSlotMap(exName: string): Map<string, number> {
  const map = new Map<string, number>();
  const sf = parseExampleSource(exName);
  if (!sf) return map;

  let idx = 0;
  walkAST(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    // Must have an initializer that calls useState
    if (!node.initializer || !ts.isCallExpression(node.initializer)) return;
    const callee = node.initializer.expression;
    if (!ts.isIdentifier(callee) || callee.text !== 'useState') return;
    // Must be an array binding pattern with 2 elements: [value, setter]
    if (!ts.isArrayBindingPattern(node.name)) return;
    const elements = node.name.elements;
    if (elements.length < 2) return;
    const setterElement = elements[1]!;
    if (ts.isOmittedExpression(setterElement)) return;
    const setterName = setterElement.name;
    if (ts.isIdentifier(setterName)) {
      map.set(setterName.text, idx++);
    }
  });
  return map;
}

const setterSlotMap = buildSetterSlotMap(entryPath);
const listInfo = detectListPatterns(entryPath);
if (listInfo) {
  process.stderr.write(`List detected: array="${listInfo.dataArrayName}" visible=${listInfo.visibleCount} labelsPerItem=${listInfo.labelsPerItem}\n`);
  if (listInfo.dataArrayValues) process.stderr.write(`  values: ${JSON.stringify(listInfo.dataArrayValues)}\n`);
  if (listInfo.scrollSetterName) process.stderr.write(`  scroll setter: ${listInfo.scrollSetterName}\n`);
}

// ---------------------------------------------------------------------------
// useMessage detection — runtime async data loading
// ---------------------------------------------------------------------------

interface MessageInfo {
  key: string;              // Message key name (e.g., "items")
  mockDataArrayName: string | null; // Variable name of mockData
}

function detectUseMessage(exName: string): MessageInfo | null {
  const sf = parseExampleSource(exName);
  if (!sf) return null;

  let key: string | null = null;
  let mockDataArrayName: string | null = null;

  walkAST(sf, (node) => {
    // Find: useMessage({ key: "...", mockData: ... })
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useMessage' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0]!)
    ) {
      const objLit = node.arguments[0]!;
      for (const prop of (objLit as ts.ObjectLiteralExpression).properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        if (prop.name.text === 'key' && ts.isStringLiteral(prop.initializer)) {
          key = prop.initializer.text;
        }
        if (prop.name.text === 'mockData' && ts.isIdentifier(prop.initializer)) {
          mockDataArrayName = prop.initializer.text;
        }
      }
    }
  });

  if (!key) return null;
  return { key, mockDataArrayName };
}

const messageInfo = detectUseMessage(entryPath);
if (messageInfo) {
  process.stderr.write(`useMessage detected: key="${messageInfo.key}"${messageInfo.mockDataArrayName ? ` mockData=${messageInfo.mockDataArrayName}` : ''}\n`);
}

/** Module-level map collecting string enum values per slot from handler analysis */
const stringEnumValues = new Map<number, Set<string>>();

/**
 * Analyze a button handler AST node (or source string) to determine
 * what action it performs (increment, decrement, reset, toggle, set_string).
 */
function analyzeButtonHandler(source: string): HandlerAction | null {
  // Parse the handler source as an expression statement
  const wrapper = `(${source});`;
  const sf = ts.createSourceFile('__handler__.ts', wrapper, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const stmt = sf.statements[0];
  if (!stmt || !ts.isExpressionStatement(stmt)) return null;
  const expr = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression;
  return analyzeHandlerNode(expr, sf);
}

function analyzeHandlerNode(node: ts.Node, sf: ts.SourceFile): HandlerAction | null {
  // We expect an arrow function: () => setXxx(...) or (param => expr)
  if (ts.isArrowFunction(node)) {
    const body = node.body;
    // () => setXxx(...)  — body is a call expression
    if (ts.isCallExpression(body)) {
      return analyzeSetterCall(body, sf);
    }
    // () => someExpr — try recursing
    if (ts.isBlock(body)) {
      // Walk statements for a setter call
      for (const stmt of body.statements) {
        if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
          const result = analyzeSetterCall(stmt.expression, sf);
          if (result) return result;
        }
      }
    }
  }
  // Maybe it's a bare setter call expression (unlikely but handle it)
  if (ts.isCallExpression(node)) {
    return analyzeSetterCall(node, sf);
  }
  return null;
}

function analyzeSetterCall(call: ts.CallExpression, sf: ts.SourceFile): HandlerAction | null {
  // Get setter name to look up slot index
  if (!ts.isIdentifier(call.expression)) return null;
  const setterName = call.expression.text;
  const slotIndex = setterSlotMap.has(setterName) ? setterSlotMap.get(setterName)! : 0;

  if (call.arguments.length !== 1) return null;
  const arg = call.arguments[0]!;

  // setXxx(numericLiteral) — reset
  if (ts.isNumericLiteral(arg)) {
    return { type: 'reset', slotIndex, value: Number(arg.text) };
  }

  // setXxx('stringLiteral') — set_string
  if (ts.isStringLiteral(arg)) {
    // Collect for string enum extraction
    if (!stringEnumValues.has(slotIndex)) stringEnumValues.set(slotIndex, new Set());
    stringEnumValues.get(slotIndex)!.add(arg.text);
    return { type: 'set_string', slotIndex, value: 0, stringValue: arg.text };
  }

  // setXxx(arrow function) — functional update
  if (ts.isArrowFunction(arg)) {
    const body = arg.body;
    // param => param + N  (increment)
    // param => param - N  (decrement)
    if (ts.isBinaryExpression(body)) {
      if (body.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(body.right)) {
        return { type: 'increment', slotIndex, value: Number(body.right.text) };
      }
      if (body.operatorToken.kind === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(body.right)) {
        return { type: 'decrement', slotIndex, value: Number(body.right.text) };
      }
    }
    // param => !param  (toggle)
    if (ts.isPrefixUnaryExpression(body) && body.operator === ts.SyntaxKind.ExclamationToken) {
      return { type: 'toggle', slotIndex, value: 0 };
    }
    // param => Math.min(param + N, max)  (clamped increment)
    // param => Math.max(param - N, min)  (clamped decrement)
    if (ts.isCallExpression(body) && ts.isPropertyAccessExpression(body.expression)) {
      const obj = body.expression.expression;
      const method = body.expression.name.text;
      if (ts.isIdentifier(obj) && obj.text === 'Math' && body.arguments.length === 2) {
        const [a0, a1] = [body.arguments[0]!, body.arguments[1]!];
        if (method === 'min' && ts.isBinaryExpression(a0)) {
          if (a0.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(a0.right)) {
            return { type: 'increment', slotIndex, value: Number(a0.right.text) };
          }
        }
        if (method === 'max' && ts.isBinaryExpression(a0)) {
          if (a0.operatorToken.kind === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(a0.right)) {
            return { type: 'decrement', slotIndex, value: Number(a0.right.text) };
          }
        }
      }
    }
    // param => (param + N) % M  (modular increment)
    if (ts.isBinaryExpression(body) && body.operatorToken.kind === ts.SyntaxKind.PercentToken) {
      const left = ts.isParenthesizedExpression(body.left) ? body.left.expression : body.left;
      if (ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(left.right)) {
        return { type: 'increment', slotIndex, value: Number(left.right.text) };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// List (.map()) detection via AST
// ---------------------------------------------------------------------------

interface ListInfo {
  dataArrayName: string;
  dataArrayValues: string[] | null;
  /** For object arrays: array of plain objects with string values */
  dataArrayObjects: Record<string, string>[] | null;
  /** Property names in the order they appear as labels per item */
  propertyOrder: string[] | null;
  visibleCount: number;
  scrollSetterName: string | null;
  labelsPerItem: number;
}

function detectListPatterns(exName: string): ListInfo | null {
  const sf = parseExampleSource(exName);
  if (!sf) return null;

  let mapCallFound = false;
  let dataArrayName: string | null = null;
  let visibleCount = 3;
  let scrollSetterName: string | null = null;
  let labelsPerItem = 1;
  let dataArrayValues: string[] | null = null;
  let dataArrayObjects: Record<string, string>[] | null = null;

  // First pass: find array literals to know data values
  const arrayLiterals = new Map<string, string[]>();
  const objectArrayLiterals = new Map<string, Record<string, string>[]>();
  walkAST(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      // Try string array first
      const strValues: string[] = [];
      let allStrings = true;
      for (const el of node.initializer.elements) {
        if (ts.isStringLiteral(el)) strValues.push(el.text);
        else { allStrings = false; break; }
      }
      if (allStrings && strValues.length > 0) {
        arrayLiterals.set(node.name.text, strValues);
        return;
      }

      // Try object array
      const objValues: Record<string, string>[] = [];
      let allObjects = true;
      for (const el of node.initializer.elements) {
        if (ts.isObjectLiteralExpression(el)) {
          const obj: Record<string, string> = {};
          for (const prop of el.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isStringLiteral(prop.initializer)) {
              obj[prop.name.text] = prop.initializer.text;
            }
          }
          if (Object.keys(obj).length > 0) objValues.push(obj);
          else { allObjects = false; break; }
        } else {
          allObjects = false;
          break;
        }
      }
      if (allObjects && objValues.length > 0) {
        objectArrayLiterals.set(node.name.text, objValues);
      }
    }
  });

  // Second pass: find .map() and .slice()
  walkAST(sf, (node) => {
    // Find .map() call
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map'
    ) {
      mapCallFound = true;
      const obj = node.expression.expression;
      if (ts.isIdentifier(obj) && !dataArrayName) {
        // Only set if .slice() hasn't already identified the real source
        dataArrayName = obj.text;
        dataArrayValues = arrayLiterals.get(obj.text) ?? null;
        dataArrayObjects = objectArrayLiterals.get(obj.text) ?? null;
      }

      // Count Text elements in callback
      if (node.arguments.length > 0) {
        let textCount = 0;
        walkAST(node.arguments[0]!, (n) => {
          if (ts.isJsxSelfClosingElement(n) && ts.isIdentifier(n.tagName) && n.tagName.text === 'Text') textCount++;
          if (ts.isJsxElement(n) && ts.isIdentifier(n.openingElement.tagName) && n.openingElement.tagName.text === 'Text') textCount++;
        });
        if (textCount > 0) labelsPerItem = textCount;
      }
    }

    // Find .slice(index, index + N)
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isPropertyAccessExpression(node.initializer.expression) &&
      node.initializer.expression.name.text === 'slice'
    ) {
      const sliceArgs = node.initializer.arguments;
      if (sliceArgs.length >= 2) {
        const secondArg = sliceArgs[1]!;
        if (
          ts.isBinaryExpression(secondArg) &&
          secondArg.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          ts.isNumericLiteral(secondArg.right)
        ) {
          visibleCount = Number(secondArg.right.text);
        }
        // Find scroll setter from the index variable
        const firstArg = sliceArgs[0]!;
        if (ts.isIdentifier(firstArg)) {
          const indexVarName = firstArg.text;
          walkAST(sf, (n) => {
            if (
              ts.isVariableDeclaration(n) &&
              ts.isArrayBindingPattern(n.name) &&
              n.name.elements.length >= 2
            ) {
              const first = n.name.elements[0]!;
              if (
                !ts.isOmittedExpression(first) &&
                ts.isIdentifier(first.name) &&
                first.name.text === indexVarName
              ) {
                const setter = n.name.elements[1]!;
                if (!ts.isOmittedExpression(setter) && ts.isIdentifier(setter.name)) {
                  scrollSetterName = setter.name.text;
                }
              }
            }
          });
        }
      }

      // Trace the source array from: visible = SOURCE.slice(...)
      // This overrides .map()'s target since the slice source is the real data.
      const sliceObj = node.initializer.expression.expression;
      if (ts.isIdentifier(sliceObj)) {
        dataArrayName = sliceObj.text;
        dataArrayValues = arrayLiterals.get(sliceObj.text) ?? null;
        dataArrayObjects = objectArrayLiterals.get(sliceObj.text) ?? null;
      }
    }
  });

  if (!mapCallFound || !dataArrayName) return null;

  // Determine property order by matching baseline label texts to first item's properties
  let propertyOrder: string[] | null = null;
  if (dataArrayObjects && dataArrayObjects.length > 0 && labelsPerItem > 1) {
    const firstItem = dataArrayObjects[0]!;
    // We'll match during the main pipeline after rendering
    propertyOrder = Object.keys(firstItem).slice(0, labelsPerItem);
  }

  return { dataArrayName, dataArrayValues, dataArrayObjects, propertyOrder, visibleCount, scrollSetterName, labelsPerItem };
}

// ---------------------------------------------------------------------------
// Emit context
// ---------------------------------------------------------------------------

interface EmitContext {
  skins: Map<string, string>;
  styles: Map<string, string>;
  declarations: string[];
  skinIdx: number;
  styleIdx: number;
  labelIdx: number;
  rectIdx: number;
  /** Map from label sequential index → its text */
  labelTexts: Map<number, string>;
  /** Map from rect sequential index → its fill color name */
  rectFills: Map<number, string>;
}

function ensureSkin(ctx: EmitContext, fill: string): string {
  const hex = colorToHex(fill);
  const existing = ctx.skins.get(hex);
  if (existing) return existing;
  const name = `sk${ctx.skinIdx++}`;
  ctx.skins.set(hex, name);
  ctx.declarations.push(`const ${name} = new Skin({ fill: "${hex}" });`);
  return name;
}

function ensureStyle(ctx: EmitContext, font: string, color: string): string {
  const key = `${font}|${color}`;
  const existing = ctx.styles.get(key);
  if (existing) return existing;
  const name = `st${ctx.styleIdx++}`;
  ctx.styles.set(key, name);
  const hex = colorToHex(color);
  ctx.declarations.push(
    `const ${name} = new Style({ font: "${fontToPiu(font)}", color: "${hex}" });`,
  );
  return name;
}

// ---------------------------------------------------------------------------
// Per-subtree conditional tracking (hoisted for emitNode access)
interface ConditionalChild {
  stateSlot: number;
  childIndex: number;
  type: 'removed' | 'added';
}
const conditionalChildren: ConditionalChild[] = [];
let emitConditionals = false; // Only wrap conditionals during final emit
let conditionalDepth = 0; // Track nesting — only wrap at depth 1 (root Group's children)

// Emit piu tree
// ---------------------------------------------------------------------------

function emitNode(
  node: AnyNode,
  ctx: EmitContext,
  indent: string,
  dynamicLabels: Set<number> | null,
  stateDeps: Map<number, { slotIndex: number; formatExpr: string }> | null,
  skinDeps?: Map<number, { slotIndex: number; skins: string[] }> | null,
): string | null {
  if (node.type === '#text') return null;

  const el = node as DOMElement;
  const p = el.props;

  switch (el.type) {
    case 'pbl-root':
    case 'pbl-group': {
      if (el.type === 'pbl-group') conditionalDepth++;
      const kids = el.children
        .map((c, childIdx) => {
          const emitted = emitNode(c, ctx, indent + '  ', dynamicLabels, stateDeps, skinDeps);
          if (!emitted) return null;

          // Check if this child is a per-subtree conditional
          // (only applies to children of the root Group, which is child 0 of pbl-root)
          // Only wrap at the root Group level (depth 1), not nested Groups
          if (el.type === 'pbl-group' && emitConditionals && conditionalDepth === 1 && conditionalChildren.length > 0) {
            const cond = conditionalChildren.find(
              cc => cc.childIndex === childIdx && cc.type === 'removed'
            );
            if (cond) {
              const name = `cv_s${cond.stateSlot}_${childIdx}`;
              return `${indent}  new Container(null, { name: "${name}", visible: true, left: 0, right: 0, top: 0, bottom: 0, contents: [\n${emitted}\n${indent}  ] })`;
            }
          }

          return emitted;
        })
        .filter(Boolean);
      if (el.type === 'pbl-root') return kids.join(',\n');
      const x = num(p, 'x');
      const y = num(p, 'y');
      // Groups without explicit position need full-size layout constraints
      // so piu actually sizes them (otherwise they get zero size).
      const layout = (x === 0 && y === 0)
        ? 'left: 0, right: 0, top: 0, bottom: 0, '
        : `left: ${x}, right: 0, top: ${y}, `;

      // If this Group is a DIRECT parent of list slot labels (not a grandparent),
      // give it a name so the Behavior can find it.
      let groupNameProp = '';
      if (listInfo && listInfo.labelsPerItem > 1 && listSlotLabels.size > 0) {
        // Check if a DIRECT child (not nested) is a named list label
        const directListLabels = kids.filter(k => k?.includes('name: "ls') && !k?.includes('contents:'));
        if (directListLabels.length > 0) {
          const m = directListLabels[0]!.match(/name: "ls(\d+)_/);
          if (m) {
            groupNameProp = `name: "lg${m[1]}", `;
          }
        }
      }

      if (el.type === 'pbl-group') conditionalDepth--;
      return `${indent}new Container(null, { ${groupNameProp}${layout}contents: [\n${kids.join(',\n')}\n${indent}] })`;
    }

    case 'pbl-rect': {
      const fill = str(p, 'fill');
      if (!fill) return null;
      const w = num(p, 'w') || num(p, 'width');
      const h = num(p, 'h') || num(p, 'height');
      const x = num(p, 'x');
      const y = num(p, 'y');
      const skinVar = ensureSkin(ctx, fill);

      // Track rect fill for skin reactivity detection
      const rectIdx = ctx.rectIdx++;
      ctx.rectFills.set(rectIdx, fill);

      // If this rect has a dynamic skin, give it a name
      const isSkinDynamic = skinDeps?.has(rectIdx) ?? false;
      const nameProp = isSkinDynamic ? `, name: "sr${rectIdx}"` : '';

      // Use constraint-based layout when dimensions match screen size
      // (so the output adapts to any screen at runtime)
      const sizeProps = buildSizeProps(x, y, w, h);

      const kids = el.children
        .map((c) => emitNode(c, ctx, indent + '  ', dynamicLabels, stateDeps, skinDeps))
        .filter(Boolean);
      if (kids.length > 0) {
        return `${indent}new Container(null, { ${sizeProps}, skin: ${skinVar}${nameProp}, contents: [\n${kids.join(',\n')}\n${indent}] })`;
      }
      return `${indent}new Content(null, { ${sizeProps}, skin: ${skinVar}${nameProp} })`;
    }

    case 'pbl-text': {
      const text = getTextContent(el);
      if (!text) return null;
      const font = str(p, 'font');
      const color = str(p, 'color') ?? 'white';
      const align = str(p, 'align') ?? 'left';
      const w = num(p, 'w') || num(p, 'width');
      const x = num(p, 'x');
      const y = num(p, 'y');

      const idx = ctx.labelIdx++;
      ctx.labelTexts.set(idx, text);

      const styleVar = ensureStyle(ctx, font ?? 'gothic18', color);
      const posProps: string[] = [`top: ${y}`];
      posProps.push(`left: ${x}`);
      if (w > 0) posProps.push(`width: ${w}`);
      const horizProp = align !== 'left' ? `, horizontal: "${align}"` : '';
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      // Determine label naming: state-dep → "sl{idx}", time-dep → "tl{idx}"
      const isTimeDynamic = dynamicLabels?.has(idx) ?? false;
      const isStateDynamic = stateDeps?.has(idx) ?? false;
      let nameProp = '';
      if (listSlotLabels.has(idx)) {
        const flatIdx = [...listSlotLabels].indexOf(idx);
        const lpi = listInfo?.labelsPerItem ?? 1;
        const itemIdx = Math.floor(flatIdx / lpi);
        const labelIdx = flatIdx % lpi;
        const lsName = lpi > 1 ? `ls${itemIdx}_${labelIdx}` : `ls${flatIdx}`;
        nameProp = `, name: "${lsName}"`;
      } else if (isStateDynamic) {
        nameProp = `, name: "sl${idx}"`;
      } else if (isTimeDynamic) {
        nameProp = `, name: "tl${idx}"`;
      }

      return `${indent}new Label(null, { ${posProps.join(', ')}, style: ${styleVar}${horizProp}${nameProp}, string: "${escaped}" })`;
    }

    case 'pbl-line': {
      const x1 = num(p, 'x');
      const y1 = num(p, 'y');
      const x2 = num(p, 'x2');
      const y2 = num(p, 'y2');
      const color = str(p, 'color') ?? str(p, 'stroke') ?? 'white';
      const skinVar = ensureSkin(ctx, color);
      const sw = num(p, 'strokeWidth') || 1;
      if (y1 === y2) {
        const left = Math.min(x1, x2);
        const w = Math.abs(x2 - x1) || 1;
        return `${indent}new Content(null, { left: ${left}, top: ${y1}, width: ${w}, height: ${sw}, skin: ${skinVar} })`;
      } else if (x1 === x2) {
        const top = Math.min(y1, y2);
        const h = Math.abs(y2 - y1) || 1;
        return `${indent}new Content(null, { left: ${x1}, top: ${top}, width: ${sw}, height: ${h}, skin: ${skinVar} })`;
      }
      return null;
    }

    case 'pbl-circle': {
      const r = num(p, 'r') || num(p, 'radius');
      const cx = num(p, 'x');
      const cy = num(p, 'y');
      const fill = str(p, 'fill');
      if (!fill || r <= 0) return null;
      const skinVar = ensureSkin(ctx, fill);
      // piu RoundRect with radius = r draws a circle when width = height = 2*r
      const size = r * 2;
      return `${indent}new RoundRect(null, { left: ${cx}, top: ${cy}, width: ${size}, height: ${size}, radius: ${r}, skin: ${skinVar} })`;
    }

    default:
      return null;
  }
}

function buildPos(p: Record<string, unknown>): string {
  const parts: string[] = [];
  const x = num(p, 'x');
  const y = num(p, 'y');
  if (x) parts.push(`left: ${x}`);
  if (y) parts.push(`top: ${y}`);
  return parts.length > 0 ? parts.join(', ') + ', ' : '';
}

/**
 * Build size props using constraint layout when dimensions match screen.
 * full-width (w === SCREEN.width) → left: 0, right: 0
 * full-height (h === SCREEN.height) → top: 0, bottom: 0
 * Otherwise: absolute left/top/width/height
 */
function buildSizeProps(x: number, y: number, w: number, h: number): string {
  const parts: string[] = [];

  if (w >= SCREEN.width && x === 0) {
    parts.push('left: 0', 'right: 0');
  } else {
    if (x !== 0) parts.push(`left: ${x}`);
    else parts.push('left: 0');
    parts.push(`width: ${w}`);
  }

  if (h >= SCREEN.height && y === 0) {
    parts.push('top: 0', 'bottom: 0');
  } else {
    parts.push(`top: ${y}`);
    parts.push(`height: ${h}`);
  }

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Time format inference
// ---------------------------------------------------------------------------

type TimeFormat = 'HHMM' | 'MMSS' | 'SS' | 'DATE';

function inferTimeFormat(textAtT1: string, t1: Date): TimeFormat | null {
  const hh = pad2(t1.getHours());
  const mm = pad2(t1.getMinutes());
  const ss = pad2(t1.getSeconds());
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  if (textAtT1 === `${hh}:${mm}`) return 'HHMM';
  if (textAtT1 === `${mm}:${ss}`) return 'MMSS';
  if (textAtT1 === ss) return 'SS';
  if (
    textAtT1.includes(days[t1.getDay()]!) &&
    textAtT1.includes(months[t1.getMonth()]!)
  ) {
    return 'DATE';
  }
  return null;
}

function emitTimeExpr(fmt: TimeFormat): string {
  switch (fmt) {
    case 'HHMM':
      return 'pad(d.getHours()) + ":" + pad(d.getMinutes())';
    case 'MMSS':
      return 'pad(d.getMinutes()) + ":" + pad(d.getSeconds())';
    case 'SS':
      return 'pad(d.getSeconds())';
    case 'DATE':
      return 'days[d.getDay()] + " " + months[d.getMonth()] + " " + d.getDate()';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const origLog = console.log;
const silence = () => {
  console.log = () => {};
};
const restore = () => {
  console.log = origLog;
};

// Hoisted declarations (populated during detection phases below)
const listSlotLabels = new Set<number>();
let listScrollSlotIndex = -1;

// Install interceptors BEFORE any rendering
installUseStateInterceptor();
extractButtonBindingsFromSource(entryPath);

// Create BOTH test dates with the REAL Date before any mocking.
const OrigDate = globalThis.Date;
const T1 = new OrigDate(2026, 0, 15, 9, 7, 3);
const T2 = new OrigDate(2026, 5, 20, 14, 52, 48);
(globalThis as unknown as { Date: unknown }).Date = class MockDate extends OrigDate {
  constructor() {
    super();
    return T1;
  }
  static now() {
    return T1.getTime();
  }
};

// --- Render at T1 (baseline) ---
resetStateTracking();
silence();
const app1 = exampleMain();
restore();
await settle(); // Let async effects (useEffect + setTimeout) fire

if (!app1) {
  process.stderr.write('Failed to render at T1\n');
  process.exit(1);
}

// Collect label texts from T1 render
const ctx1: EmitContext = {
  skins: new Map(),
  styles: new Map(),
  declarations: [],
  skinIdx: 0,
  styleIdx: 0,
  labelIdx: 0,
  labelTexts: new Map(),
  rectIdx: 0,
  rectFills: new Map(),
};
emitNode(app1._root, ctx1, '', null, null);
const t1Texts = new Map(ctx1.labelTexts);
// Don't unmount app1 yet — we need its _root for per-subtree tree diff

process.stderr.write(`State slots discovered: ${stateSlots.length}\n`);
process.stderr.write(`Button bindings discovered: ${buttonBindings.length}\n`);
for (const b of buttonBindings) {
  process.stderr.write(`  button="${b.button}" handler=${b.handlerSource}\n`);
}

// ---------------------------------------------------------------------------
// Perturbation pipeline — discover state-dependent labels
// ---------------------------------------------------------------------------

const stateDeps = new Map<number, { slotIndex: number; formatExpr: string; needsTime?: boolean }>();
const skinDeps = new Map<number, { slotIndex: number; skins: [string, string] }>();

// Branch info: when tree structure changes between baseline and perturbed,
// we record both renders' full label sets so we can emit both as branches
// wrapped in named Containers with .visible toggling.
interface BranchInfo {
  stateSlot: number;
  perturbedValue: unknown;
  baselineLabels: Map<number, string>;
  perturbedLabels: Map<number, string>;
}
const branchInfos: BranchInfo[] = [];

// Per-subtree conditionals use the hoisted `conditionalChildren` array
// (declared before emitNode so it's accessible during rendering).

/**
 * Compare children of two pebble-dom Group nodes to find which children
 * were added or removed when a state was perturbed.
 *
 * Uses a simple fingerprint match: each child is identified by its type
 * + first text content. Children present in baseline but not perturbed
 * are 'removed' (conditional on the truthy state).
 */
function diffTreeChildren(
  baselineRoot: DOMElement,
  perturbedRoot: DOMElement,
  stateSlot: number,
): ConditionalChild[] {
  const result: ConditionalChild[] = [];

  // Get the actual Group container (root → first child which is the Group)
  const baseGroup = baselineRoot.children[0];
  const pertGroup = perturbedRoot.children[0];
  if (!baseGroup || baseGroup.type === '#text' || !pertGroup || pertGroup.type === '#text') {
    return result;
  }

  const baseChildren = (baseGroup as DOMElement).children.filter(c => c.type !== '#text');
  const pertChildren = (pertGroup as DOMElement).children.filter(c => c.type !== '#text');

  // Fingerprint each child: type + first text descendant
  function fingerprint(node: AnyNode): string {
    if (node.type === '#text') return `#text:${node.value}`;
    const el = node as DOMElement;
    const firstText = el.children.find(c => c.type === '#text' || (c.type !== '#text' && getTextContent(c)));
    const text = firstText ? getTextContent(firstText) : '';
    return `${el.type}:${text.slice(0, 30)}`;
  }

  const baseFPs = baseChildren.map(fingerprint);
  const pertFPs = pertChildren.map(fingerprint);

  // Find children in baseline but not in perturbed (removed when state perturbed)
  for (let i = 0; i < baseFPs.length; i++) {
    if (!pertFPs.includes(baseFPs[i]!)) {
      result.push({ stateSlot, childIndex: i, type: 'removed' });
    }
  }

  // Find children in perturbed but not in baseline (added when state perturbed)
  for (let i = 0; i < pertFPs.length; i++) {
    if (!baseFPs.includes(pertFPs[i]!)) {
      result.push({ stateSlot, childIndex: i, type: 'added' });
    }
  }

  return result;
}

/**
 * For string enum states, return the set of possible values from button
 * handler sources. Values are collected during analyzeButtonHandler into
 * the module-level stringEnumValues map; this function triggers analysis
 * if not yet done and returns the map.
 */
function extractStringValuesFromHandlers(): Map<number, Set<string>> {
  // Ensure handler analysis has run so stringEnumValues is populated.
  // Analyze all bindings if not yet analyzed.
  for (const binding of buttonBindings) {
    analyzeButtonHandler(binding.handlerSource);
  }
  return stringEnumValues;
}

function computePerturbedValues(slot: StateSlot): unknown[] {
  const v = slot.initialValue;
  if (typeof v === 'number') return [v + 42];
  if (typeof v === 'boolean') return [!v];
  if (typeof v === 'string') {
    // Use extracted enum values (excluding the initial value itself)
    const enumValues = extractStringValuesFromHandlers().get(slot.index);
    if (enumValues && enumValues.size > 0) {
      return [...enumValues].filter((ev) => ev !== v);
    }
    return [v + '__PROBE__']; // fallback
  }
  return []; // unsupported type — skip
}

for (const slot of stateSlots) {
  const perturbedValues = computePerturbedValues(slot);
  if (perturbedValues.length === 0) continue;

  for (const perturbedValue of perturbedValues) {

  forcedStateValues.set(slot.index, perturbedValue);

  // Re-render with forced state
  resetStateTracking();
  silence();
  const appP = exampleMain();
  restore();

  if (appP) {
    const ctxP: EmitContext = {
      skins: new Map(),
      styles: new Map(),
      declarations: [],
      skinIdx: 0,
      styleIdx: 0,
      labelIdx: 0,
      labelTexts: new Map(),
      rectIdx: 0,
      rectFills: new Map(),
    };
    emitNode(appP._root, ctxP, '', null, null);

    // Check if tree shape changed (different label count or structure)
    const baseKeys = [...t1Texts.keys()].sort((a, b) => a - b);
    const pertKeys = [...ctxP.labelTexts.keys()].sort((a, b) => a - b);
    const sameShape = baseKeys.length === pertKeys.length &&
      baseKeys.every((k, i) => k === pertKeys[i]);

    if (sameShape) {
      // Same structure — check for text changes (existing v3 path)
      for (const [idx, baseText] of t1Texts) {
        const pertText = ctxP.labelTexts.get(idx);
        if (pertText !== undefined && pertText !== baseText) {
          let formatExpr: string;
          if (String(perturbedValue) === pertText) {
            formatExpr = `"" + this.s${slot.index}`;
          } else if (typeof slot.initialValue === 'boolean') {
            // Boolean state produced different text — emit a ternary.
            // If the perturbed text looks like a time format, emit a live
            // time expression instead of a frozen compile-time snapshot.
            const pertTimeFmt = inferTimeFormat(pertText, T1);
            if (pertTimeFmt && (pertTimeFmt === 'MMSS' || pertTimeFmt === 'HHMM')) {
              // State toggles between static text and live time.
              // Emit elapsed-time tracking: capture start time when toggled on,
              // compute elapsed seconds in refresh().
              formatExpr = `this.s${slot.index} ? (function(e) { return pad(Math.floor(e / 60)) + ":" + pad(e % 60); })(Math.floor((Date.now() - this._startTime_s${slot.index}) / 1000)) : "${baseText.replace(/"/g, '\\"')}"`;
              stateDeps.set(idx, { slotIndex: slot.index, formatExpr, needsTime: true });
              process.stderr.write(
                `  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed=ELAPSED:${pertTimeFmt})\n`,
              );
              continue; // skip the default stateDeps.set below
            } else {
              formatExpr = `this.s${slot.index} ? "${pertText.replace(/"/g, '\\"')}" : "${baseText.replace(/"/g, '\\"')}"`;
            }
          } else {
            formatExpr = `"" + this.s${slot.index}`;
          }
          stateDeps.set(idx, { slotIndex: slot.index, formatExpr });
          process.stderr.write(
            `  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed="${pertText}")\n`,
          );
        }
      }

      // Also check for rect fill changes
      const baseRectFills = ctx1.rectFills;
      for (const [rIdx, baseFill] of baseRectFills) {
        const pertFill = ctxP.rectFills.get(rIdx);
        if (pertFill !== undefined && pertFill !== baseFill) {
          // Ensure both skins exist in declarations
          ensureSkin(ctx1, baseFill);
          ensureSkin(ctx1, pertFill);
          skinDeps.set(rIdx, {
            slotIndex: slot.index,
            skins: [baseFill, pertFill],
          });
          process.stderr.write(
            `  Rect ${rIdx} skin depends on state slot ${slot.index} (base="${baseFill}", perturbed="${pertFill}")\n`,
          );
        }
      }
    } else {
      // Different structure — this is a conditional branch!
      // EXCEPT: skip if this slot is the list scroll index — list items
      // change count when scrolled past the end, which is handled by
      // the list slot pool, not structural branching.
      if (listInfo && listInfo.scrollSetterName && setterSlotMap.get(listInfo.scrollSetterName) === slot.index) {
        process.stderr.write(
          `  State slot ${slot.index} causes structural change (skipped — list scroll): ${baseKeys.length} → ${pertKeys.length} labels\n`,
        );
        // Still check labels that exist in BOTH renders for text changes
        // (e.g., a "1/5" counter label that updates on scroll).
        for (const [idx, baseText] of t1Texts) {
          const pertText = ctxP.labelTexts.get(idx);
          if (pertText !== undefined && pertText !== baseText) {
            // Skip labels that will be handled as list slots
            if (listSlotLabels.has(idx)) continue;
            // Infer format by substitution: find where the perturbed value appears in the text
            let formatExpr: string;
            const pv = String(Number(perturbedValue) + 1); // try value+1 (common: sel+1)
            if (pertText.includes(pv)) {
              // Pattern like "{sel+1}/{total}" → "(this.s{N} + 1) + suffix"
              const before = pertText.substring(0, pertText.indexOf(pv));
              const after = pertText.substring(pertText.indexOf(pv) + pv.length);
              formatExpr = `${before ? `"${before}" + ` : ''}(this.s${slot.index} + 1)${after ? ` + "${after}"` : ''}`;
            } else if (pertText.includes(String(perturbedValue))) {
              const pStr = String(perturbedValue);
              const before = pertText.substring(0, pertText.indexOf(pStr));
              const after = pertText.substring(pertText.indexOf(pStr) + pStr.length);
              formatExpr = `${before ? `"${before}" + ` : ''}this.s${slot.index}${after ? ` + "${after}"` : ''}`;
            } else {
              formatExpr = `"" + this.s${slot.index}`;
            }
            stateDeps.set(idx, { slotIndex: slot.index, formatExpr });
            process.stderr.write(
              `  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed="${pertText}")\n`,
            );
          }
        }
      } else if (typeof slot.initialValue === 'boolean') {
        // Boolean state with structural change → per-subtree conditional
        // Diff the tree to find which specific children appeared/disappeared
        const diffs = diffTreeChildren(app1._root, appP._root, slot.index);
        if (diffs.length > 0) {
          conditionalChildren.push(...diffs);
          process.stderr.write(
            `  State slot ${slot.index}: ${diffs.length} conditional child(ren) detected\n`,
          );
        } else {
          // Fallback to whole-tree branch if diff couldn't identify subtrees
          process.stderr.write(
            `  State slot ${slot.index} causes structural change: ${baseKeys.length} labels → ${pertKeys.length} labels\n`,
          );
          branchInfos.push({
            stateSlot: slot.index,
            perturbedValue,
            baselineLabels: new Map(t1Texts),
            perturbedLabels: new Map(ctxP.labelTexts),
          });
        }
      } else {
        // Non-boolean (string enum etc.) → whole-tree branching as before
        process.stderr.write(
          `  State slot ${slot.index} causes structural change: ${baseKeys.length} labels → ${pertKeys.length} labels\n`,
        );
        branchInfos.push({
          stateSlot: slot.index,
          perturbedValue,
          baselineLabels: new Map(t1Texts),
          perturbedLabels: new Map(ctxP.labelTexts),
        });
      }
    }

    appP.unmount();
  }

  forcedStateValues.delete(slot.index);
  } // end for perturbedValues
}

// Now safe to unmount baseline
app1.unmount();

process.stderr.write(`State-dependent labels: ${stateDeps.size}\n`);
process.stderr.write(`Structural branches: ${branchInfos.length}\n`);
if (conditionalChildren.length > 0) {
  process.stderr.write(`Conditional subtrees: ${conditionalChildren.length}\n`);
}

// ---------------------------------------------------------------------------
// List slot detection: identify which labels are .map() items
// ---------------------------------------------------------------------------

// (listSlotLabels and listScrollSlotIndex hoisted before first emitNode call)
// Populated in the list slot detection section below.

if (listInfo) {
  if (listInfo.scrollSetterName && setterSlotMap.has(listInfo.scrollSetterName)) {
    listScrollSlotIndex = setterSlotMap.get(listInfo.scrollSetterName)!;
  }

  // Perturb scroll index to 1 and diff — labels that change are list slots
  if (listScrollSlotIndex >= 0) {
    forcedStateValues.set(listScrollSlotIndex, 1);
    resetStateTracking();
    silence();
    const appScroll = exampleMain();
    restore();

    if (appScroll) {
      const ctxScroll: EmitContext = {
        skins: new Map(), styles: new Map(), declarations: [],
        skinIdx: 0, styleIdx: 0, labelIdx: 0, labelTexts: new Map(),
        rectIdx: 0, rectFills: new Map(),
      };
      emitNode(appScroll._root, ctxScroll, '', null, null);

      for (const [idx, baseText] of t1Texts) {
        const scrollText = ctxScroll.labelTexts.get(idx);
        if (scrollText !== undefined && scrollText !== baseText) {
          listSlotLabels.add(idx);
        }
      }
      appScroll.unmount();
    }
    forcedStateValues.delete(listScrollSlotIndex);
  }

  // Trim to expected count: visibleCount × labelsPerItem.
  // Extra labels (e.g., a "1/5" counter) that change on scroll aren't list slots.
  const expectedSlots = listInfo.visibleCount * listInfo.labelsPerItem;
  if (listSlotLabels.size > expectedSlots) {
    const all = [...listSlotLabels];
    // Keep the LAST expectedSlots (list items appear after header labels)
    const keep = new Set(all.slice(all.length - expectedSlots));
    listSlotLabels.clear();
    for (const idx of keep) listSlotLabels.add(idx);
  }

  if (listSlotLabels.size > 0) {
    process.stderr.write(`List slot labels: [${[...listSlotLabels].join(', ')}]\n`);
  }
}

// --- Render at T2 (for time diff) ---
(globalThis as unknown as { Date: unknown }).Date = class MockDate2 extends OrigDate {
  constructor() {
    super();
    return T2;
  }
  static now() {
    return T2.getTime();
  }
};

process.stderr.write('T2 Date.now before render: ' + Date.now() + ' vs expected ' + T2.getTime() + '\n');
process.stderr.write('T2 new Date(): ' + new Date() + '\n');
resetStateTracking();
silence();
const app2 = exampleMain();
restore();

if (!app2) {
  process.stderr.write('Failed to render at T2\n');
  process.exit(1);
}

const ctx2: EmitContext = {
  skins: new Map(),
  styles: new Map(),
  declarations: [],
  skinIdx: 0,
  styleIdx: 0,
  labelIdx: 0,
  labelTexts: new Map(),
  rectIdx: 0,
  rectFills: new Map(),
};
emitNode(app2._root, ctx2, '', null, null);
const t2Texts = new Map(ctx2.labelTexts);
app2.unmount();

// Restore real Date
(globalThis as unknown as { Date: typeof Date }).Date = OrigDate;

// --- Diff texts to find time-dynamic labels ---
const dynamicLabels = new Set<number>();
const labelFormats = new Map<number, TimeFormat>();

for (const [idx, text1] of t1Texts) {
  // Skip labels that are state-dependent (already handled)
  if (stateDeps.has(idx)) continue;
  const text2 = t2Texts.get(idx);
  if (text2 !== undefined && text1 !== text2) {
    const fmt = inferTimeFormat(text1, T1);
    if (fmt) {
      dynamicLabels.add(idx);
      labelFormats.set(idx, fmt);
    }
  }
}

process.stderr.write('T1 texts: ' + JSON.stringify([...t1Texts]) + '\n');
process.stderr.write('T2 texts: ' + JSON.stringify([...t2Texts]) + '\n');
process.stderr.write(
  `Found ${dynamicLabels.size} time-dependent label(s): ${[...labelFormats.entries()]
    .map(([idx, fmt]) => `tl${idx}=${fmt}`)
    .join(', ')}\n`,
);

// --- Final render at T1 for the emitted static snapshot ---
(globalThis as unknown as { Date: unknown }).Date = class MockDate3 extends OrigDate {
  constructor() {
    super();
    return T1;
  }
  static now() {
    return T1.getTime();
  }
};

// Clear forced values for final render
forcedStateValues.clear();
resetStateTracking();
silence();
const appFinal = exampleMain();
restore();
await settle(); // Let async effects fire for final snapshot
(globalThis as unknown as { Date: typeof Date }).Date = OrigDate;

if (!appFinal) {
  process.stderr.write('Failed to render final snapshot\n');
  process.exit(1);
}

const ctx: EmitContext = {
  skins: new Map(),
  styles: new Map(),
  declarations: [],
  skinIdx: 0,
  styleIdx: 0,
  labelIdx: 0,
  labelTexts: new Map(),
  rectIdx: 0,
  rectFills: new Map(),
};

let contents: string | null;

interface BranchOutput {
  value: unknown;
  tree: string;
  isBaseline: boolean;
}
const branchesBySlot = new Map<number, BranchOutput[]>();

if (branchInfos.length > 0) {

  // Baseline tree (for each slot that has branches)
  emitConditionals = true;
  const baselineTree = emitNode(appFinal._root, ctx, '      ', dynamicLabels, stateDeps, skinDeps);

  const affectedSlots = new Set(branchInfos.map((b) => b.stateSlot));
  for (const si of affectedSlots) {
    const slot = stateSlots[si];
    branchesBySlot.set(si, [
      { value: slot?.initialValue, tree: baselineTree ?? '      /* empty */', isBaseline: true },
    ]);
  }

  // Perturbed trees
  for (const branch of branchInfos) {
    forcedStateValues.set(branch.stateSlot, branch.perturbedValue);
    resetStateTracking();
    (globalThis as unknown as { Date: unknown }).Date = class extends OrigDate {
      constructor() { super(); return T1; }
      static now() { return T1.getTime(); }
    };
    silence();
    const appBranch = exampleMain();
    restore();
    (globalThis as unknown as { Date: typeof Date }).Date = OrigDate;
    forcedStateValues.clear();

    if (appBranch) {
      const tree = emitNode(appBranch._root, ctx, '      ', dynamicLabels, stateDeps, skinDeps);
      appBranch.unmount();
      branchesBySlot.get(branch.stateSlot)!.push({
        value: branch.perturbedValue,
        tree: tree ?? '      /* empty */',
        isBaseline: false,
      });
    }
  }

  // Build the contents with named Containers per branch
  const branchLines: string[] = [];
  for (const [si, branches] of branchesBySlot) {
    for (let bi = 0; bi < branches.length; bi++) {
      const branch = branches[bi]!;
      const name = `br_s${si}_v${bi}`;
      // For message-driven apps, start with loading visible (non-baseline)
      // since data arrives at runtime. Otherwise, baseline is visible.
      const visible = messageInfo ? !branch.isBaseline : branch.isBaseline;
      branchLines.push(
        `    new Container(null, { name: "${name}", visible: ${visible}, left: 0, right: 0, top: 0, bottom: 0, contents: [\n${branch.tree}\n    ] })`,
      );
    }
  }
  contents = branchLines.join(',\n');
} else {
  // No structural branches — emit the single tree as before
  emitConditionals = true;
  contents = emitNode(appFinal._root, ctx, '    ', dynamicLabels, stateDeps, skinDeps);
}
appFinal.unmount();

// --- Analyze button handlers ---
const buttonActions: { button: string; action: HandlerAction }[] = [];
for (const binding of buttonBindings) {
  const action = analyzeButtonHandler(binding.handlerSource);
  if (action) {
    buttonActions.push({ button: binding.button, action });
    process.stderr.write(
      `  Button "${binding.button}": ${action.type} s${action.slotIndex} by ${action.value}\n`,
    );
  } else if (listInfo && listSlotLabels.size > 0 && listScrollSlotIndex >= 0) {
    // Unrecognized handler but we have a list — emit scroll fallback for up/down
    if (binding.button === 'up') {
      buttonActions.push({ button: 'up', action: { type: 'decrement', slotIndex: listScrollSlotIndex, value: 1 } });
      process.stderr.write(`  Button "up": list scroll up (fallback)\n`);
    } else if (binding.button === 'down') {
      buttonActions.push({ button: 'down', action: { type: 'increment', slotIndex: listScrollSlotIndex, value: 1 } });
      process.stderr.write(`  Button "down": list scroll down (fallback)\n`);
    }
  }
}

// --- Emit piu output ---
const stateNeedsTime = [...stateDeps.values()].some(d => d.needsTime);
const hasTimeDeps = dynamicLabels.size > 0 || stateNeedsTime;
const hasStateDeps = stateDeps.size > 0;
const hasButtons = buttonActions.length > 0;
const hasBranches = branchInfos.length > 0;
const hasConditionals = conditionalChildren.length > 0;
const hasSkinDeps = skinDeps.size > 0;
const hasList = listInfo !== null && listSlotLabels.size > 0;
const hasBehavior = hasTimeDeps || hasStateDeps || hasButtons || hasBranches || hasSkinDeps || hasList || hasConditionals;

const lines: string[] = [
  '// Auto-generated by react-pebble compile-to-piu (v3 with state reactivity)',
  `// Source: examples/${exampleName}.tsx rendered in Node mock mode.`,
  '//',
  '// Regenerate: npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js',
  '',
  'import {} from "piu/MC";',
  hasButtons ? 'import PebbleButton from "pebble/button";' : '',
  messageInfo ? 'import Message from "pebble/message";' : '',
  '',
];

// Pre-register all skin deps so declarations are complete before output
for (const [, dep] of skinDeps) {
  ensureSkin(ctx, dep.skins[0]!);
  ensureSkin(ctx, dep.skins[1]!);
}

lines.push(
  ...ctx.declarations,
  '',
  `const bgSkin = new Skin({ fill: "${colorToHex('black')}" });`,
  '',
);

if (hasTimeDeps) {
  lines.push('function pad(n) { return n < 10 ? "0" + n : "" + n; }');
  lines.push(
    'const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];',
    'const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];',
  );
  lines.push('');
}

if (messageInfo) {
  // Runtime data: always declare _data for Message population
  lines.push('let _data = [];');
  lines.push('');
}
if (hasList && !messageInfo) {
  if (listInfo!.dataArrayObjects) {
    lines.push(`const _data = ${JSON.stringify(listInfo!.dataArrayObjects)};`);
  } else if (listInfo!.dataArrayValues) {
    lines.push(`const _data = ${JSON.stringify(listInfo!.dataArrayValues)};`);
  }
  lines.push('');
}

if (hasBehavior) {
  lines.push('class AppBehavior extends Behavior {');
  lines.push('  onCreate(app) {');
  // `c` is the container to search for named content nodes (sl*, sr*, ls*).
  // Without branches: c = app.first (the root Group container).
  // With branches: c = the baseline branch's inner Group container.
  //   app → br_s0_v0 (branch) → Container (Group) → named nodes
  if (hasBranches) {
    // Find the baseline (initially visible) branch and navigate into its Group
    const baselineBranchIdx = branchesBySlot.values().next().value?.[0]?.isBaseline ? 0 : 1;
    const si = branchInfos[0]?.stateSlot ?? 0;
    lines.push(`    const c = app.content("br_s${si}_v${baselineBranchIdx}").first;`);
  } else {
    lines.push('    const c = app.first;');
  }

  // State fields (skip non-serializable values like Date objects)
  for (const slot of stateSlots) {
    const v = slot.initialValue;
    if (v instanceof Date || (typeof v === 'object' && v !== null && !(Array.isArray(v)))) {
      // Skip — internal hook state (e.g., useTime's Date) shouldn't be baked
      continue;
    }
    lines.push(`    this.s${slot.index} = ${JSON.stringify(v)};`);
  }

  // Elapsed-time start markers for state+time hybrid labels
  for (const [, dep] of stateDeps) {
    if (dep.needsTime) {
      lines.push(`    this._startTime_s${dep.slotIndex} = Date.now();`);
    }
  }

  // Time-dependent label refs
  for (const [idx] of labelFormats) {
    lines.push(`    this.tl${idx} = c.content("tl${idx}");`);
  }

  // State-dependent label refs
  for (const [idx] of stateDeps) {
    lines.push(`    this.sl${idx} = c.content("sl${idx}");`);
  }

  // Skin-reactive rect refs
  for (const [rIdx] of skinDeps) {
    lines.push(`    this.sr${rIdx} = c.content("sr${rIdx}");`);
  }

  // Branch container refs (for structural conditional rendering)
  for (const [si, branches] of branchesBySlot ?? []) {
    for (let bi = 0; bi < branches.length; bi++) {
      lines.push(`    this.br_s${si}_v${bi} = app.content("br_s${si}_v${bi}");`);
    }
  }

  // Per-subtree conditional refs
  for (const cc of conditionalChildren) {
    if (cc.type === 'removed') {
      const name = `cv_s${cc.stateSlot}_${cc.childIndex}`;
      lines.push(`    this.${name} = c.content("${name}");`);
    }
  }

  // List slot refs
  if (hasList) {
    const lpi = listInfo!.labelsPerItem;
    lines.push(`    this._ls = [];`);
    for (let i = 0; i < listInfo!.visibleCount; i++) {
      if (lpi > 1) {
        // Multi-label: find the item Group, then its labels within
        lines.push(`    const _g${i} = c.content("lg${i}");`);
        const refs = [];
        for (let j = 0; j < lpi; j++) {
          refs.push(`_g${i}.content("ls${i}_${j}")`);
        }
        lines.push(`    this._ls.push([${refs.join(', ')}]);`);
      } else {
        lines.push(`    this._ls.push(c.content("ls${i}"));`);
      }
    }
  }

  lines.push('  }');

  // onDisplaying
  lines.push('  onDisplaying(app) {');
  if (!messageInfo) {
    lines.push('    this.refresh();');
  }
  if (hasTimeDeps) {
    lines.push('    app.interval = 1000;');
    lines.push('    app.start();');
  }
  if (hasButtons) {
    // Collect unique button names used by bindings
    const usedButtons = [...new Set(buttonBindings.map(b => b.button))];
    for (const btn of usedButtons) {
      lines.push(`    new PebbleButton({ type: "${btn}", onPush: (pushed, name) => { if (pushed) this.onButton({ button: name }); } });`);
    }
  }
  if (messageInfo) {
    // Subscribe to phone→watch messages
    lines.push(`    const self = this;`);
    lines.push(`    new Message({`);
    lines.push(`      keys: ["${messageInfo.key}"],`);
    lines.push(`      onReadable() {`);
    lines.push(`        const map = this.read();`);
    lines.push(`        const json = map.get("${messageInfo.key}");`);
    lines.push(`        if (json) {`);
    lines.push(`          try {`);
    lines.push(`            _data = JSON.parse(json);`);
    // Toggle: show loaded branches (v0 = baseline = loaded), hide loading (v1)
    for (const [si, branches] of branchesBySlot ?? []) {
      for (let bi = 0; bi < branches.length; bi++) {
        lines.push(`            self.br_s${si}_v${bi}.visible = ${bi === 0 ? 'true' : 'false'};`);
      }
    }
    // Update list labels from parsed data
    if (listInfo && listInfo.labelsPerItem > 1 && listInfo.propertyOrder) {
      const lpi = listInfo.labelsPerItem;
      const vc = listInfo.visibleCount;
      lines.push(`            const c = self.br_s${[...branchesBySlot.keys()][0]}_v0.first;`);
      for (let i = 0; i < vc; i++) {
        lines.push(`            const g${i} = c.content("lg${i}");`);
        for (let j = 0; j < lpi; j++) {
          const prop = listInfo.propertyOrder[j]!;
          lines.push(`            if (g${i}) { const l = g${i}.content("ls${i}_${j}"); if (l) l.string = _data[${i}] ? _data[${i}].${prop} : ""; }`);
        }
      }
    } else if (listInfo) {
      const vc = listInfo.visibleCount;
      lines.push(`            const c = self.br_s${[...branchesBySlot.keys()][0]}_v0.first;`);
      for (let i = 0; i < vc; i++) {
        lines.push(`            const l${i} = c.content("ls${i}"); if (l${i}) l${i}.string = _data[${i}] || "";`);
      }
    }
    lines.push(`          } catch (e) { console.log("Parse error: " + e.message); }`);
    lines.push(`        }`);
    lines.push(`      }`);
    lines.push(`    });`);
  }
  lines.push('  }');

  // onTimeChanged (only if time-dependent)
  if (hasTimeDeps) {
    lines.push('  onTimeChanged() {');
    lines.push('    this.refresh();');
    lines.push('  }');
  }

  // onButton (only if buttons)
  if (hasButtons) {
    lines.push('  onButton(e) {');
    lines.push('    const name = e && e.button;');
    for (const { button, action } of buttonActions) {
      const cond = `name === "${button}"`;
      let stmt: string;
      // Override for list scroll: add clamping
      const isListScroll = hasList && action.slotIndex === listScrollSlotIndex;

      switch (action.type) {
        case 'increment':
          if (isListScroll) {
            stmt = `this.s${action.slotIndex} = Math.min(_data.length - ${listInfo!.visibleCount}, this.s${action.slotIndex} + ${action.value}); this.refresh();`;
          } else {
            stmt = `this.s${action.slotIndex} += ${action.value}; this.refresh();`;
          }
          break;
        case 'decrement':
          if (isListScroll) {
            stmt = `this.s${action.slotIndex} = Math.max(0, this.s${action.slotIndex} - ${action.value}); this.refresh();`;
          } else {
            stmt = `this.s${action.slotIndex} -= ${action.value}; this.refresh();`;
          }
          break;
        case 'reset':
          stmt = `this.s${action.slotIndex} = ${action.value}; this.refresh();`;
          break;
        case 'toggle': {
          // Check if any state-dependent label needs elapsed time tracking for this slot
          const needsElapsed = [...stateDeps.values()].some(d => d.slotIndex === action.slotIndex && d.needsTime);
          if (needsElapsed) {
            stmt = `this.s${action.slotIndex} = !this.s${action.slotIndex}; if (this.s${action.slotIndex}) this._startTime_s${action.slotIndex} = Date.now(); this.refresh();`;
          } else {
            stmt = `this.s${action.slotIndex} = !this.s${action.slotIndex}; this.refresh();`;
          }
          break;
        }
        case 'set_string':
          stmt = `this.s${action.slotIndex} = "${action.stringValue}"; this.refresh();`;
          break;
      }
      lines.push(`    if (${cond}) { ${stmt} }`);
    }
    lines.push('  }');
  }

  // refresh
  lines.push('  refresh() {');
  if (hasTimeDeps) {
    lines.push('    const d = new Date();');
  }
  for (const [idx, fmt] of labelFormats) {
    lines.push(`    this.tl${idx}.string = ${emitTimeExpr(fmt)};`);
  }
  for (const [idx, dep] of stateDeps) {
    lines.push(`    this.sl${idx}.string = ${dep.formatExpr};`);
  }
  // Skin reactivity — swap skins on state change
  for (const [rIdx, dep] of skinDeps) {
    const baseSkinVar = ensureSkin(ctx, dep.skins[0]!);
    const pertSkinVar = ensureSkin(ctx, dep.skins[1]!);
    const slot = stateSlots[dep.slotIndex];
    if (typeof slot?.initialValue === 'boolean') {
      lines.push(`    this.sr${rIdx}.skin = this.s${dep.slotIndex} ? ${pertSkinVar} : ${baseSkinVar};`);
    } else {
      lines.push(`    this.sr${rIdx}.skin = (this.s${dep.slotIndex} !== ${JSON.stringify(slot?.initialValue)}) ? ${pertSkinVar} : ${baseSkinVar};`);
    }
  }
  // Per-subtree conditional visibility
  for (const cc of conditionalChildren) {
    if (cc.type === 'removed') {
      const name = `cv_s${cc.stateSlot}_${cc.childIndex}`;
      lines.push(`    this.${name}.visible = !!this.s${cc.stateSlot};`);
    }
  }
  // Branch visibility toggles
  for (const [si, branches] of branchesBySlot ?? []) {
    for (let bi = 0; bi < branches.length; bi++) {
      const branch = branches[bi]!;
      const cond = `this.s${si} === ${JSON.stringify(branch.value)}`;
      lines.push(`    this.br_s${si}_v${bi}.visible = (${cond});`);
    }
  }
  // List slot scroll updates
  if (hasList && listScrollSlotIndex >= 0) {
    const lpi = listInfo!.labelsPerItem;
    lines.push(`    const _start = this.s${listScrollSlotIndex};`);
    lines.push(`    for (let _i = 0; _i < ${listInfo!.visibleCount}; _i++) {`);
    lines.push(`      const _item = _data[_start + _i];`);
    if (lpi > 1 && listInfo!.propertyOrder) {
      // Multi-label: update each label from the corresponding property
      lines.push(`      const _slot = this._ls[_i];`);
      lines.push(`      if (_slot) {`);
      for (let j = 0; j < lpi; j++) {
        const prop = listInfo!.propertyOrder[j]!;
        lines.push(`        _slot[${j}].string = _item ? _item.${prop} : "";`);
        lines.push(`        _slot[${j}].visible = !!_item;`);
      }
      lines.push(`      }`);
    } else {
      // Single-label: simple string update
      lines.push(`      if (this._ls[_i]) {`);
      lines.push(`        this._ls[_i].string = _item !== undefined ? "" + _item : "";`);
      lines.push(`        this._ls[_i].visible = (_item !== undefined);`);
      lines.push(`      }`);
    }
    lines.push(`    }`);
  }
  lines.push('  }');

  // refreshList — separate from refresh() for Message-driven data updates
  if (messageInfo && listInfo) {
    const lpi = listInfo!.labelsPerItem;
    lines.push('  refreshList() {');
    lines.push(`    for (let i = 0; i < ${listInfo!.visibleCount}; i++) {`);
    lines.push(`      const item = _data[i];`);
    if (lpi > 1 && listInfo!.propertyOrder) {
      lines.push(`      const slot = this._ls[i];`);
      lines.push(`      if (slot) {`);
      for (let j = 0; j < lpi; j++) {
        const prop = listInfo!.propertyOrder[j]!;
        lines.push(`        slot[${j}].string = item ? item.${prop} : "";`);
        lines.push(`        slot[${j}].visible = !!item;`);
      }
      lines.push(`      }`);
    } else {
      lines.push(`      if (this._ls[i]) {`);
      lines.push(`        this._ls[i].string = item !== undefined ? "" + item : "";`);
      lines.push(`        this._ls[i].visible = (item !== undefined);`);
      lines.push(`      }`);
    }
    lines.push(`    }`);
    lines.push('  }');
  }

  lines.push('}');
  lines.push('');
}

lines.push(
  'const WatchApp = Application.template(() => ({',
  '  skin: bgSkin,',
  hasBehavior ? '  Behavior: AppBehavior,' : '',
  '  contents: [',
  contents ?? '    /* empty */',
  '  ],',
  '}));',
  '',
  'export default new WatchApp(null, { touchCount: 0, pixels: screen.width * 4 });',
  '',
);

process.stdout.write(lines.join('\n'));
