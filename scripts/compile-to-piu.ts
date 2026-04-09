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

const exampleName = process.env.EXAMPLE ?? 'watchface';
const settleMs = Number(process.env.SETTLE_MS ?? '0');
const settle = () =>
  settleMs > 0 ? new Promise<void>((r) => setTimeout(r, settleMs)) : Promise.resolve();
const exampleMod = await import(`../examples/${exampleName}.js`);
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
  gothic14: '14px Gothic',
  gothic14Bold: 'bold 14px Gothic',
  gothic18: '18px Gothic',
  gothic18Bold: 'bold 18px Gothic',
  gothic24: '24px Gothic',
  gothic24Bold: 'bold 24px Gothic',
  gothic28: '28px Gothic',
  gothic28Bold: 'bold 28px Gothic',
  bitham30Black: 'black 30px Bitham',
  bitham42Bold: 'bold 42px Bitham',
  bitham42Light: 'light 42px Bitham',
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
 * Statically analyze the example source file to extract useButton calls.
 * This is more reliable than runtime interception since ESM exports are
 * read-only and useButton wraps handlers in refs internally.
 */
function extractButtonBindingsFromSource(exName: string): void {
  const srcPath = resolve(__dirname, '..', 'examples', `${exName}.tsx`);
  let source: string;
  try {
    source = readFileSync(srcPath, 'utf-8');
  } catch {
    // Try .ts and .jsx variants
    try {
      source = readFileSync(srcPath.replace('.tsx', '.ts'), 'utf-8');
    } catch {
      return; // No source found; skip button analysis
    }
  }

  // Match useButton('button', handler) patterns
  // Handles multi-line by collapsing the source
  const collapsed = source.replace(/\n/g, ' ');
  const re = /useButton\(\s*['"](\w+)['"]\s*,\s*(.+?)\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(collapsed)) !== null) {
    const button = m[1]!;
    const handlerSource = m[2]!.trim();
    if (!buttonBindings.some((b) => b.button === button)) {
      buttonBindings.push({ button, handlerSource });
    }
  }
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
 * Extract a setter→slot index map from source by parsing
 * `const [name, setName] = useState(...)` patterns in order.
 */
function buildSetterSlotMap(exName: string): Map<string, number> {
  const map = new Map<string, number>();
  const srcPath = resolve(__dirname, '..', 'examples', `${exName}.tsx`);
  let source: string;
  try {
    source = readFileSync(srcPath, 'utf-8');
  } catch {
    try { source = readFileSync(srcPath.replace('.tsx', '.ts'), 'utf-8'); }
    catch { return map; }
  }
  const re = /const\s*\[\s*\w+\s*,\s*(\w+)\s*\]\s*=\s*useState/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(source)) !== null) {
    map.set(m[1]!, idx++);
  }
  return map;
}

const setterSlotMap = buildSetterSlotMap(exampleName);

function inferSlotIndex(handlerSource: string): number {
  // Extract the setter name called in the handler
  const m = handlerSource.match(/\b(set\w+)\s*\(/);
  if (m && setterSlotMap.has(m[1]!)) {
    return setterSlotMap.get(m[1]!)!;
  }
  return 0; // fallback
}

function analyzeButtonHandler(source: string): HandlerAction | null {
  const slotIndex = inferSlotIndex(source);
  // Reusable param pattern: matches v, (v), (v: Type)
  const P = String.raw`\(?\s*\w+(?:\s*:\s*\w+)?\s*\)?`;

  // Match: () => setXxx(c => c + N) — increment via functional update
  let m = source.match(new RegExp(String.raw`\(\)\s*=>\s*\w+\(\s*${P}\s*=>\s*\w+\s*\+\s*(\d+)\s*\)`));
  if (m) return { type: 'increment', slotIndex, value: Number(m[1]) };

  // Match: () => setXxx(c => c - N) — decrement via functional update
  m = source.match(new RegExp(String.raw`\(\)\s*=>\s*\w+\(\s*${P}\s*=>\s*\w+\s*-\s*(\d+)\s*\)`));
  if (m) return { type: 'decrement', slotIndex, value: Number(m[1]) };

  // Match: c => c + N  or  (c) => c + N — bare increment
  m = source.match(new RegExp(String.raw`${P}\s*=>\s*\w+\s*\+\s*(\d+)`));
  if (m) return { type: 'increment', slotIndex, value: Number(m[1]) };

  // Match: c => c - N  or  (c) => c - N — bare decrement
  m = source.match(new RegExp(String.raw`${P}\s*=>\s*\w+\s*-\s*(\d+)`));
  if (m) return { type: 'decrement', slotIndex, value: Number(m[1]) };

  // Match: () => setState(N)  or  () => setXxx(N) — reset to literal
  m = source.match(/\(\)\s*=>\s*\w+\((\d+)\)/);
  if (m) return { type: 'reset', slotIndex, value: Number(m[1]) };

  // Match: () => setXxx(v => !v)  or  () => setXxx((v) => !v) — boolean toggle
  m = source.match(/\(\)\s*=>\s*\w+\(\s*\(?\s*\w+\s*(?::\s*\w+)?\s*\)?\s*=>\s*!\w+\s*\)/);
  if (m) return { type: 'toggle', slotIndex, value: 0 };

  // Match: () => setXxx('stringValue') — set string literal
  m = source.match(/\(\)\s*=>\s*\w+\(\s*'([^']+)'\s*\)/);
  if (m) return { type: 'set_string', slotIndex, value: 0, stringValue: m[1] };

  return null;
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
      const kids = el.children
        .map((c) => emitNode(c, ctx, indent + '  ', dynamicLabels, stateDeps, skinDeps))
        .filter(Boolean);
      if (el.type === 'pbl-root') return kids.join(',\n');
      const props = buildPos(p);
      return `${indent}new Container(null, { ${props}contents: [\n${kids.join(',\n')}\n${indent}] })`;
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

      const kids = el.children
        .map((c) => emitNode(c, ctx, indent + '  ', dynamicLabels, stateDeps, skinDeps))
        .filter(Boolean);
      if (kids.length > 0) {
        return `${indent}new Container(null, { left: ${x}, top: ${y}, width: ${w}, height: ${h}, skin: ${skinVar}${nameProp}, contents: [\n${kids.join(',\n')}\n${indent}] })`;
      }
      return `${indent}new Content(null, { left: ${x}, top: ${y}, width: ${w}, height: ${h}, skin: ${skinVar}${nameProp} })`;
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
      if (isStateDynamic) {
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

// ---------------------------------------------------------------------------
// Time format inference
// ---------------------------------------------------------------------------

type TimeFormat = 'HHMM' | 'SS' | 'DATE';

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

// Install interceptors BEFORE any rendering
installUseStateInterceptor();
extractButtonBindingsFromSource(exampleName);

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
app1.unmount();

process.stderr.write(`State slots discovered: ${stateSlots.length}\n`);
process.stderr.write(`Button bindings discovered: ${buttonBindings.length}\n`);
for (const b of buttonBindings) {
  process.stderr.write(`  button="${b.button}" handler=${b.handlerSource}\n`);
}

// ---------------------------------------------------------------------------
// Perturbation pipeline — discover state-dependent labels
// ---------------------------------------------------------------------------

const stateDeps = new Map<number, { slotIndex: number; formatExpr: string }>();
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

/**
 * For string enum states, extract the set of possible values from button
 * handler sources. Handlers like `() => setFoo('bar')` reveal that 'bar'
 * is a valid state value.
 */
function extractStringValuesFromHandlers(): Map<number, Set<string>> {
  const valuesBySlot = new Map<number, Set<string>>();
  for (const binding of buttonBindings) {
    // Match: () => setXxx('value') — string literal argument
    const m = binding.handlerSource.match(/\(\)\s*=>\s*\w+\(\s*'([^']+)'\s*\)/);
    if (m) {
      // We don't know WHICH state slot this setter belongs to, but for
      // single-state-slot components it's slot 0. For multi-slot, we'd
      // need to track which setter maps to which slot. For now: slot 0.
      const slotIdx = 0;
      if (!valuesBySlot.has(slotIdx)) valuesBySlot.set(slotIdx, new Set());
      valuesBySlot.get(slotIdx)!.add(m[1]!);
    }
  }
  return valuesBySlot;
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
            // Boolean state produced different text — emit a ternary
            formatExpr = `this.s${slot.index} ? "${pertText.replace(/"/g, '\\"')}" : "${baseText.replace(/"/g, '\\"')}"`;
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

    appP.unmount();
  }

  forcedStateValues.delete(slot.index);
  } // end for perturbedValues
}

process.stderr.write(`State-dependent labels: ${stateDeps.size}\n`);
process.stderr.write(`Structural branches: ${branchInfos.length}\n`);

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
      const visible = branch.isBaseline; // only baseline visible initially
      branchLines.push(
        `    new Container(null, { name: "${name}", visible: ${visible}, contents: [\n${branch.tree}\n    ] })`,
      );
    }
  }
  contents = branchLines.join(',\n');
} else {
  // No structural branches — emit the single tree as before
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
  }
}

// --- Emit piu output ---
const hasTimeDeps = dynamicLabels.size > 0;
const hasStateDeps = stateDeps.size > 0;
const hasButtons = buttonActions.length > 0;
const hasBranches = branchInfos.length > 0;
const hasSkinDeps = skinDeps.size > 0;
const hasBehavior = hasTimeDeps || hasStateDeps || hasButtons || hasBranches || hasSkinDeps;

const lines: string[] = [
  '// Auto-generated by react-pebble compile-to-piu (v3 with state reactivity)',
  `// Source: examples/${exampleName}.tsx rendered in Node mock mode.`,
  '//',
  '// Regenerate: npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js',
  '',
  'import {} from "piu/MC";',
  hasButtons ? 'import PebbleButton from "pebble/button";' : '',
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

if (hasBehavior) {
  lines.push('class AppBehavior extends Behavior {');
  lines.push('  onCreate(app) {');
  // Use app.first.content() for simple (non-branch) cases.
  // For branch cases, nodes are direct children of branch containers
  // which are direct children of app, so app.content() suffices for branches.
  if (!hasBranches) {
    lines.push('    const c = app.first;');
  }

  // State fields
  for (const slot of stateSlots) {
    lines.push(`    this.s${slot.index} = ${JSON.stringify(slot.initialValue)};`);
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

  lines.push('  }');

  // onDisplaying
  lines.push('  onDisplaying(app) {');
  lines.push('    this.refresh();');
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
      switch (action.type) {
        case 'increment':
          stmt = `this.s${action.slotIndex} += ${action.value}; this.refresh();`;
          break;
        case 'decrement':
          stmt = `this.s${action.slotIndex} -= ${action.value}; this.refresh();`;
          break;
        case 'reset':
          stmt = `this.s${action.slotIndex} = ${action.value}; this.refresh();`;
          break;
        case 'toggle':
          stmt = `this.s${action.slotIndex} = !this.s${action.slotIndex}; this.refresh();`;
          break;
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
  // Branch visibility toggles
  for (const [si, branches] of branchesBySlot ?? []) {
    for (let bi = 0; bi < branches.length; bi++) {
      const branch = branches[bi]!;
      const cond = `this.s${si} === ${JSON.stringify(branch.value)}`;
      lines.push(`    this.br_s${si}_v${bi}.visible = (${cond});`);
    }
  }
  lines.push('  }');

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
