/**
 * scripts/analyze.ts — Analysis phase of the react-pebble compiler.
 *
 * Renders the component, intercepts hooks, performs perturbation analysis,
 * and produces a backend-agnostic CompilerIR. Extracted from compile-to-piu.ts.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { h } from 'preact';
import type { ComponentType } from 'preact';
import { render } from './analyzer/mock/render.js';
import type { DOMElement, AnyNode } from '../src/pebble-dom.js';
import { getTextContent } from '../src/pebble-dom.js';
import { COLOR_PALETTE } from '../src/palette.js';
import { _setUseStateImpl, _restoreUseState } from '../src/hooks/index.js';
import { useState as realUseState } from 'preact/hooks';
import { PLATFORMS } from '../src/platform.js';
import type {
  CompilerIR, IRElement, IRStateSlot, IRButtonAction,
  IRStateDep, IRSkinDep, IRBranch, IRConditionalChild,
  IRListInfo, IRAnimatedElement, IRTimeReactiveGraphic, IRMessageInfo, IRConfigInfo, TimeFormat, TimeGranularity,
  HookUsage,
} from './compiler-ir.js';

/**
 * Hook detection: see `scripts/analyzer/passes/hooks.ts`. Re-exported here so
 * existing callers (snapshot tests, compile-to-piu) keep working unchanged.
 * See docs/adr/0003-hook-detection-in-analyzer.md for semantics.
 */
import { detectHookUsages } from './analyzer/passes/hooks.js';
import { HOOK_MODULE_SPECIFIERS as DEFAULT_HOOK_MODULE_SPECIFIERS } from './analyzer/passes/types.js';
export { detectHookUsages, DEFAULT_HOOK_MODULE_SPECIFIERS };

function detectExplicitGranularity(sourceText: string): TimeGranularity | null {
  const strMatch = /\buseTime\s*\(\s*['"](second|minute|hour|day)['"]\s*\)/.exec(sourceText);
  if (strMatch?.[1]) return strMatch[1] as TimeGranularity;
  const numMatch = /\buseTime\s*\(\s*(\d+)\s*\)/.exec(sourceText);
  if (numMatch?.[1]) {
    const n = Number(numMatch[1]);
    if (n <= 1000) return 'second';
    if (n <= 60_000) return 'minute';
    if (n <= 3_600_000) return 'hour';
    return 'day';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function colorToHex(name: string): string {
  const rgb = COLOR_PALETTE[name];
  if (rgb) {
    const r = rgb.r.toString(16).padStart(2, '0');
    const g = rgb.g.toString(16).padStart(2, '0');
    const b = rgb.b.toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  // Bare 6-digit hex (e.g. "AAAAAA") — prefix with #. piu's Style/Skin
  // color parser requires the leading # to treat the value as a hex literal.
  if (/^[0-9a-fA-F]{6}$/.test(name)) return `#${name.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{6}$/.test(name)) return name.toLowerCase();
  return name;
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

import type { ButtonBinding } from './analyzer/passes/buttons.js';
import { parseEntry, scanEntry } from './analyzer/index.js';
import { assembleIR } from './analyzer/ir-assembly.js';

interface HandlerAction {
  type: 'increment' | 'decrement' | 'reset' | 'toggle' | 'set_string';
  slotIndex: number;
  value: number;
  stringValue?: string;
}

// ---------------------------------------------------------------------------
// collectTree — pure data collection from DOM (replaces emitNode for analysis)
// ---------------------------------------------------------------------------

interface CollectContext {
  labelIdx: number;
  labelTexts: Map<number, string>;
  rectIdx: number;
  rectFills: Map<number, string>;
  elemIdx: number;
  elementPositions: Map<number, { type: string; left: number; top: number; width: number; height: number; radius?: number; x2?: number; y2?: number; rotation?: number }>;
  imageResources: string[];
}

function newCollectContext(): CollectContext {
  return {
    labelIdx: 0,
    labelTexts: new Map(),
    rectIdx: 0,
    rectFills: new Map(),
    elemIdx: 0,
    elementPositions: new Map(),
    imageResources: [],
  };
}

/**
 * Walk a pebble-dom tree and collect label texts, rect fills, and element
 * positions. Returns an IRElement tree. This is the data-collection half
 * of the old emitNode — no piu code is generated.
 */
function collectTree(node: AnyNode, ctx: CollectContext): IRElement | null {
  if (node.type === '#text') return null;

  const el = node as DOMElement;
  const p = el.props;

  switch (el.type) {
    case 'pbl-root':
    case 'pbl-group': {
      const children: IRElement[] = [];
      for (const c of el.children) {
        const collected = collectTree(c, ctx);
        if (collected) children.push(collected);
      }
      return {
        type: el.type === 'pbl-root' ? 'root' : 'group',
        x: num(p, 'x'), y: num(p, 'y'),
        // Negative w/h is the "fill parent" sentinel — emitters translate
        // to the platform-native bind-to-parent idiom (piu: left:0,right:0;
        // C: full screen). We use -1 instead of 0 because 0 is a legitimate
        // runtime value for dynamic/animated dimensions.
        w: num(p, 'w') || num(p, 'width') || -1,
        h: num(p, 'h') || num(p, 'height') || -1,
        children,
      };
    }

    case 'pbl-rect': {
      const fill = str(p, 'fill');
      const textureSrc = str(p, 'texture');
      if (!fill && !textureSrc) return null;
      const w = num(p, 'w') || num(p, 'width');
      const h = num(p, 'h') || num(p, 'height');
      const x = num(p, 'x');
      const y = num(p, 'y');

      const rectIdx = ctx.rectIdx++;
      if (fill) ctx.rectFills.set(rectIdx, fill);
      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'rect', left: x, top: y, width: w, height: h });

      // Track texture as an image resource
      if (textureSrc && !ctx.imageResources.includes(textureSrc)) {
        ctx.imageResources.push(textureSrc);
      }

      const children: IRElement[] = [];
      for (const c of el.children) {
        const collected = collectTree(c, ctx);
        if (collected) children.push(collected);
      }

      // Parse border/tile insets if present
      const borders = p.borders as { left: number; right: number; top: number; bottom: number } | undefined;
      const tiles = p.tiles as { left: number; right: number; top: number; bottom: number } | undefined;

      const borderRadius = num(p, 'borderRadius') || undefined;
      const borderRadiusTL = num(p, 'borderRadiusTopLeft') || undefined;
      const borderRadiusTR = num(p, 'borderRadiusTopRight') || undefined;
      const borderRadiusBL = num(p, 'borderRadiusBottomLeft') || undefined;
      const borderRadiusBR = num(p, 'borderRadiusBottomRight') || undefined;

      return {
        type: 'rect',
        x, y, w, h,
        fill: fill ? colorToHex(fill) : undefined,
        texture: textureSrc,
        variant: num(p, 'variant'),
        borders,
        tiles,
        borderRadius,
        borderRadiusTL,
        borderRadiusTR,
        borderRadiusBL,
        borderRadiusBR,
        rectIndex: rectIdx,
        elemIndex: elemIdx,
        children: children.length > 0 ? children : undefined,
      };
    }

    case 'pbl-text': {
      const text = getTextContent(el);
      if (!text) return null;
      const font = str(p, 'font');
      const color = str(p, 'color') ?? 'white';
      const align = str(p, 'align') ?? 'left';
      const overflow = str(p, 'overflow');
      const w = num(p, 'w') || num(p, 'width');
      const x = num(p, 'x');
      const y = num(p, 'y');

      const labelIdx = ctx.labelIdx++;
      ctx.labelTexts.set(labelIdx, text);

      const bgColor = str(p, 'backgroundColor');
      return {
        type: 'text',
        x, y, w, h: 0,
        text,
        font: font ?? 'gothic18',
        color: colorToHex(color),
        align,
        overflow: overflow || undefined,
        backgroundColor: bgColor ? colorToHex(bgColor) : undefined,
        labelIndex: labelIdx,
      };
    }

    case 'pbl-line': {
      const x1 = num(p, 'x');
      const y1 = num(p, 'y');
      const x2 = num(p, 'x2');
      const y2 = num(p, 'y2');
      const color = str(p, 'color') ?? str(p, 'stroke') ?? 'white';
      const sw = num(p, 'strokeWidth') || 1;

      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'line', left: x1, top: y1, width: 0, height: 0, x2, y2 });

      return {
        type: 'line',
        x: x1, y: y1, w: 0, h: 0,
        x2, y2,
        color: colorToHex(color),
        strokeWidth: sw,
        elemIndex: elemIdx,
      };
    }

    case 'pbl-circle': {
      const r = num(p, 'r') || num(p, 'radius');
      const cx = num(p, 'x');
      const cy = num(p, 'y');
      const fill = str(p, 'fill');
      if (!fill || r <= 0) return null;

      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'circle', left: cx, top: cy, width: r * 2, height: r * 2, radius: r });

      return {
        type: 'circle',
        x: cx, y: cy, w: r * 2, h: r * 2,
        radius: r,
        fill: colorToHex(fill),
        elemIndex: elemIdx,
      };
    }

    case 'pbl-scrollable': {
      // Treat as a group container — scrolling is handled at runtime via
      // Scroller/Scroller.content in piu, but compile-time layout uses the
      // same Container approach as pbl-group.
      const children: IRElement[] = [];
      for (const c of el.children) {
        const collected = collectTree(c, ctx);
        if (collected) children.push(collected);
      }
      return {
        type: 'group',
        x: num(p, 'x'), y: num(p, 'y'),
        w: num(p, 'w') || num(p, 'width') || -1,
        h: num(p, 'h') || num(p, 'height') || -1,
        children,
      };
    }

    case 'pbl-path': {
      const points = p.points as Array<[number, number]> | undefined;
      if (!points || points.length < 2) return null;

      const fill = str(p, 'fill') ?? str(p, 'stroke') ?? 'white';
      const rotation = num(p, 'rotation') || 0;

      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, {
        type: 'path', left: num(p, 'x'), top: num(p, 'y'),
        width: 0, height: 0, rotation,
      });

      const closed = p.closed !== undefined ? Boolean(p.closed) : undefined;
      return {
        type: 'path',
        x: num(p, 'x'), y: num(p, 'y'), w: 0, h: 0,
        points: points.map(([px, py]) => [px, py] as [number, number]),
        rotation,
        fill: colorToHex(fill),
        closed,
        elemIndex: elemIdx,
      };
    }

    case 'pbl-arc': {
      const r = num(p, 'r') || 40;
      const innerR = num(p, 'innerR') || 0;
      const startAngle = num(p, 'startAngle') || 0;
      const endAngle = num(p, 'endAngle') || 360;
      const fill = str(p, 'fill');
      const stroke = str(p, 'stroke');

      if (!fill && !stroke) return null;

      const cx = num(p, 'x');
      const cy = num(p, 'y');
      const size = r * 2;
      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'circle', left: cx, top: cy, width: size, height: size, radius: r });

      return {
        type: 'arc' as const,
        x: cx, y: cy, w: size, h: size,
        radius: r,
        innerRadius: innerR,
        startAngle,
        endAngle,
        fill: fill ? colorToHex(fill) : undefined,
        stroke: stroke ? colorToHex(stroke) : undefined,
        strokeWidth: num(p, 'strokeWidth') || 1,
        elemIndex: elemIdx,
      };
    }

    case 'pbl-textflow': {
      const text = getTextContent(el);
      if (!text) return null;

      const fontName = str(p, 'font') ?? 'gothic18';
      const colorName = str(p, 'color') ?? 'white';
      const align = str(p, 'align') ?? 'left';
      // -1 signals "fill parent" to the emitter (see buildSizeProps).
      const w = num(p, 'w') || num(p, 'width') || -1;
      const h = num(p, 'h') || num(p, 'height') || -1;

      const labelIdx = ctx.labelIdx++;
      ctx.labelTexts.set(labelIdx, text);

      const paging = p.paging === true ? true : undefined;
      return {
        type: 'text' as const,
        x: num(p, 'x'), y: num(p, 'y'), w, h,
        text,
        font: fontName,
        color: colorToHex(colorName),
        align,
        labelIndex: labelIdx,
        isWrapping: true,
        paging,
      };
    }

    case 'pbl-image': {
      const src = str(p, 'src');
      if (!src) return null;
      const x = num(p, 'x');
      const y = num(p, 'y');
      const w = num(p, 'w') || num(p, 'width');
      const h = num(p, 'h') || num(p, 'height');
      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'image', left: x, top: y, width: w, height: h });
      if (!ctx.imageResources.includes(src)) {
        ctx.imageResources.push(src);
      }
      const animated = str(p, 'animated');
      const animLoop = p.animLoop;
      const animFps = num(p, 'animFps');
      const imgAlign = str(p, 'align');
      const rotation = num(p, 'rotation');
      const pivotX = num(p, 'pivotX');
      const pivotY = num(p, 'pivotY');
      const cornerClipColor = str(p, 'cornerClipColor');
      return {
        type: 'image' as const,
        x, y, w, h,
        src,
        align: imgAlign || undefined,
        elemIndex: elemIdx,
        ...(rotation ? { rotation } : {}),
        ...(pivotX ? { pivotX } : {}),
        ...(pivotY ? { pivotY } : {}),
        ...(cornerClipColor ? { cornerClipColor: colorToHex(cornerClipColor) } : {}),
        ...(animated === 'apng' || animated === 'pdcs' ? {
          animated: animated as 'apng' | 'pdcs',
          animLoop: animLoop !== false,
          animFps: animFps > 0 ? animFps : undefined,
        } : {}),
      };
    }

    case 'pbl-svg': {
      const src = str(p, 'src');
      if (!src) return null;
      const x = num(p, 'x');
      const y = num(p, 'y');
      const w = num(p, 'w') || num(p, 'width');
      const h = num(p, 'h') || num(p, 'height');
      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'svg', left: x, top: y, width: w, height: h });
      if (!ctx.imageResources.includes(src)) {
        ctx.imageResources.push(src);
      }
      return {
        type: 'svg' as const,
        x, y, w, h,
        src,
        rotation: num(p, 'rotation'),
        svgScale: num(p, 'scale'),
        svgScaleX: num(p, 'scaleX'),
        svgScaleY: num(p, 'scaleY'),
        svgTranslateX: num(p, 'translateX'),
        svgTranslateY: num(p, 'translateY'),
        svgColor: str(p, 'color'),
        svgFillOverride: str(p, 'fillOverride') || undefined,
        svgStrokeOverride: str(p, 'strokeOverride') || undefined,
        svgHidden: p.hidden === true ? true : undefined,
        elemIndex: elemIdx,
      };
    }

    case 'pbl-canvas': {
      // Canvas/Port is a custom drawing surface — we capture its position/size
      // but the drawing callback is emitted as a Piu Port Behavior.
      const x = num(p, 'x');
      const y = num(p, 'y');
      const w = num(p, 'w') || num(p, 'width') || 100;
      const h = num(p, 'h') || num(p, 'height') || 100;
      const elemIdx = ctx.elemIdx++;
      ctx.elementPositions.set(elemIdx, { type: 'canvas', left: x, top: y, width: w, height: h });
      return {
        type: 'canvas' as const,
        x, y, w, h,
        elemIndex: elemIdx,
      };
    }

    case 'pbl-statusbar':
    case 'pbl-actionbar':
      // Already handled upstream — fall through to null for now
      return null;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Time format inference
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Button handler analysis
// ---------------------------------------------------------------------------


function analyzeButtonHandler(
  source: string,
  setterSlotMap: Map<string, number>,
  stringEnumValues: Map<number, Set<string>>,
): HandlerAction | null {
  const wrapper = `(${source});`;
  const sf = ts.createSourceFile('__handler__.ts', wrapper, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const stmt = sf.statements[0];
  if (!stmt || !ts.isExpressionStatement(stmt)) return null;
  const expr = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression;
  return analyzeHandlerNode(expr, sf, setterSlotMap, stringEnumValues);
}

function analyzeHandlerNode(
  node: ts.Node,
  sf: ts.SourceFile,
  setterSlotMap: Map<string, number>,
  stringEnumValues: Map<number, Set<string>>,
): HandlerAction | null {
  if (ts.isArrowFunction(node)) {
    const body = node.body;
    if (ts.isCallExpression(body)) {
      return analyzeSetterCall(body, sf, setterSlotMap, stringEnumValues);
    }
    if (ts.isBlock(body)) {
      for (const stmt of body.statements) {
        if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
          const result = analyzeSetterCall(stmt.expression, sf, setterSlotMap, stringEnumValues);
          if (result) return result;
        }
      }
    }
  }
  if (ts.isCallExpression(node)) {
    return analyzeSetterCall(node, sf, setterSlotMap, stringEnumValues);
  }
  return null;
}

function analyzeSetterCall(
  call: ts.CallExpression,
  sf: ts.SourceFile,
  setterSlotMap: Map<string, number>,
  stringEnumValues: Map<number, Set<string>>,
): HandlerAction | null {
  if (!ts.isIdentifier(call.expression)) return null;
  const setterName = call.expression.text;
  const slotIndex = setterSlotMap.has(setterName) ? setterSlotMap.get(setterName)! : 0;

  if (call.arguments.length !== 1) return null;
  const arg = call.arguments[0]!;

  if (ts.isNumericLiteral(arg)) {
    return { type: 'reset', slotIndex, value: Number(arg.text) };
  }

  if (ts.isStringLiteral(arg)) {
    if (!stringEnumValues.has(slotIndex)) stringEnumValues.set(slotIndex, new Set());
    stringEnumValues.get(slotIndex)!.add(arg.text);
    return { type: 'set_string', slotIndex, value: 0, stringValue: arg.text };
  }

  if (ts.isArrowFunction(arg)) {
    const body = arg.body;
    if (ts.isBinaryExpression(body)) {
      if (body.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(body.right)) {
        return { type: 'increment', slotIndex, value: Number(body.right.text) };
      }
      if (body.operatorToken.kind === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(body.right)) {
        return { type: 'decrement', slotIndex, value: Number(body.right.text) };
      }
    }
    if (ts.isPrefixUnaryExpression(body) && body.operator === ts.SyntaxKind.ExclamationToken) {
      return { type: 'toggle', slotIndex, value: 0 };
    }
    if (ts.isCallExpression(body) && ts.isPropertyAccessExpression(body.expression)) {
      const obj = body.expression.expression;
      const method = body.expression.name.text;
      if (ts.isIdentifier(obj) && obj.text === 'Math' && body.arguments.length === 2) {
        const [a0, a1] = [body.arguments[0]!, body.arguments[1]!];
        const minExpr = method === 'min' ? (ts.isBinaryExpression(a0) ? a0 : ts.isBinaryExpression(a1) ? a1 : null) : null;
        if (minExpr && minExpr.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(minExpr.right)) {
          return { type: 'increment', slotIndex, value: Number(minExpr.right.text) };
        }
        const maxExpr = method === 'max' ? (ts.isBinaryExpression(a0) ? a0 : ts.isBinaryExpression(a1) ? a1 : null) : null;
        if (maxExpr && maxExpr.operatorToken.kind === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(maxExpr.right)) {
          return { type: 'decrement', slotIndex, value: Number(maxExpr.right.text) };
        }
      }
    }
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
// Tree diff for per-subtree conditionals
// ---------------------------------------------------------------------------

function diffTreeChildren(
  baselineRoot: DOMElement,
  perturbedRoot: DOMElement,
  stateSlot: number,
): IRConditionalChild[] {
  const result: IRConditionalChild[] = [];

  const baseGroup = baselineRoot.children[0];
  const pertGroup = perturbedRoot.children[0];
  if (!baseGroup || baseGroup.type === '#text' || !pertGroup || pertGroup.type === '#text') {
    return result;
  }

  const baseChildren = (baseGroup as DOMElement).children.filter(c => c.type !== '#text');
  const pertChildren = (pertGroup as DOMElement).children.filter(c => c.type !== '#text');

  function fingerprint(node: AnyNode): string {
    if (node.type === '#text') return `#text:${node.value}`;
    const el = node as DOMElement;
    const firstText = el.children.find((c: AnyNode) => c.type === '#text' || !!getTextContent(c));
    const text = firstText ? String(getTextContent(firstText) ?? '') : '';
    return `${el.type}:${text.slice(0, 30)}`;
  }

  const baseFPs = baseChildren.map(fingerprint);
  const pertFPs = pertChildren.map(fingerprint);

  for (let i = 0; i < baseFPs.length; i++) {
    if (!pertFPs.includes(baseFPs[i]!)) {
      result.push({ stateSlot, childIndex: i, type: 'removed' });
    }
  }
  for (let i = 0; i < pertFPs.length; i++) {
    if (!baseFPs.includes(pertFPs[i]!)) {
      result.push({ stateSlot, childIndex: i, type: 'added' });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  entryPath: string;
  platform: string;
  settleMs: number;
  /**
   * Module specifiers treated as the react-pebble hooks module by
   * detectHookUsages. Defaults to the canonical strings; the in-repo
   * orchestrator extends this so internal examples that import from
   * relative paths (`../src/hooks/index.js`) are recognised too.
   */
  hookModuleSpecifiers?: readonly string[];
}

export async function analyze(options: AnalyzeOptions): Promise<CompilerIR> {
  const { entryPath, platform: platformName, settleMs } = options;
  const settle = () =>
    settleMs > 0 ? new Promise<void>((r) => setTimeout(r, settleMs)) : Promise.resolve();

  // Look up platform metadata (used for the IR `platform` field and for
  // stubbing runtime globals below).
  const platformSpec = PLATFORMS[platformName] ?? PLATFORMS.emery!;

  // Stub the Moddable runtime globals that `getScreen()` / `useWatchInfo()`
  // read from, so module-level constants in the analyzed entry file observe
  // the target platform (parity with the old _setPlatform(SCREEN) hack, but
  // now driven through the same path user code uses).
  const runtimeGlobals = globalThis as Record<string, unknown>;
  runtimeGlobals.screen = { width: platformSpec.width, height: platformSpec.height };
  runtimeGlobals.WatchInfo = {
    model: platformSpec.name,
    platform: platformSpec.name,
    isRound: platformSpec.isRound,
    isColor: true,
  };
  const { _resetScreenCache } = await import('../src/hooks/useScreen.js');
  _resetScreenCache();

  // Import the example module. The default export is a Preact component;
  // the Analyzer owns the render() wrap — see ADR 0005.
  const exampleMod = await import(entryPath);
  const ExampleComponent = exampleMod.default as ComponentType<Record<string, never>> | undefined;
  if (!ExampleComponent) {
    throw new Error(`Example ${entryPath} must export a default Preact component`);
  }
  const exampleMain: (...args: unknown[]) => ReturnType<typeof render> =
    () => render(h(ExampleComponent, null));

  // --- SourceScan: parse the entry source once and run every Pass in a
  //     single AST traversal. Each downstream consumer reads from `scan`.
  const entrySource = parseEntry(entryPath);
  const scan = entrySource
    ? scanEntry(entrySource, options.hookModuleSpecifiers)
    : { hooks: [], buttons: [], setters: [], list: null, message: null, config: null };

  // --- State tracking ---
  const stateSlots: StateSlot[] = [];
  const forcedStateValues: Map<number, unknown> = new Map();
  let stateCallCounter = 0;

  function resetStateTracking() {
    stateCallCounter = 0;
  }

  // Install useState interceptor
  _setUseStateImpl(function interceptedUseState<T>(
    init: T | (() => T),
  ): [T, (v: T | ((prev: T) => T)) => void] {
    const idx = stateCallCounter++;
    const [realVal, realSetter] = realUseState(init);

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

    if (forcedStateValues.has(idx)) {
      const forced = forcedStateValues.get(idx) as T;
      return [forced, realSetter];
    }

    return [realVal, realSetter];
  });

  // --- Button bindings ---
  const buttonBindings: ButtonBinding[] = scan.buttons.slice();

  // --- Setter info ---
  const _setterInfo = scan.setters;
  let setterSlotMap = new Map<string, number>();

  function resolveSetterSlotMap(): void {
    setterSlotMap = new Map<string, number>();
    const usedSlots = new Set<number>();
    for (const info of _setterInfo) {
      for (const slot of stateSlots) {
        if (usedSlots.has(slot.index)) continue;
        if (slot.initialValue === info.initValue ||
            (typeof slot.initialValue === 'number' && typeof info.initValue === 'number' && slot.initialValue === info.initValue) ||
            (typeof slot.initialValue === 'string' && typeof info.initValue === 'string' && slot.initialValue === info.initValue) ||
            (typeof slot.initialValue === 'boolean' && typeof info.initValue === 'boolean' && slot.initialValue === info.initValue)) {
          setterSlotMap.set(info.name, slot.index);
          usedSlots.add(slot.index);
          break;
        }
      }
    }
    if (setterSlotMap.size > 0) {
      process.stderr.write(`Setter→slot mapping: ${[...setterSlotMap.entries()].map(([n, i]) => `${n}→s${i}`).join(', ')}\n`);
    }
  }

  // --- List detection ---
  const listInfoRaw = scan.list;
  if (listInfoRaw) {
    process.stderr.write(`List detected: array="${listInfoRaw.dataArrayName}" visible=${listInfoRaw.visibleCount} labelsPerItem=${listInfoRaw.labelsPerItem}\n`);
    if (listInfoRaw.scrollSetterName) process.stderr.write(`  scroll setter: ${listInfoRaw.scrollSetterName}\n`);
  }

  // --- Message detection ---
  const messageInfoRaw = scan.message;
  let mockDataSource: string | null = null;
  if (messageInfoRaw) {
    process.stderr.write(`useMessage detected: key="${messageInfoRaw.key}"${messageInfoRaw.mockDataArrayName ? ` mockData=${messageInfoRaw.mockDataArrayName}` : ''}\n`);
    if (messageInfoRaw.mockDataArrayName) {
      mockDataSource = messageInfoRaw.mockDataSource;
      if (mockDataSource) process.stderr.write(`mockDataValue=${mockDataSource}\n`);
    }
  }

  // --- Configuration detection ---
  const configInfoRaw = scan.config;
  if (configInfoRaw) {
    process.stderr.write(`useConfiguration detected: ${configInfoRaw.keys.length} keys [${configInfoRaw.keys.map(k => k.key).join(', ')}]\n`);
  }

  // --- String enum collection ---
  const stringEnumValues = new Map<number, Set<string>>();

  // --- Console silencing ---
  const origLog = console.log;
  const silence = () => { console.log = () => {}; };
  const restore = () => { console.log = origLog; };

  // --- List tracking ---
  const listSlotLabels = new Set<number>();
  let listScrollSlotIndex = -1;

  // --- Mock dates ---
  const OrigDate = globalThis.Date;
  const T1 = new OrigDate(2026, 0, 15, 9, 7, 3);
  const T2 = new OrigDate(2026, 5, 20, 14, 52, 48);

  function mockDate(target: Date) {
    (globalThis as unknown as { Date: unknown }).Date = class MockDate extends OrigDate {
      constructor() { super(); return target; }
      static override now() { return target.getTime(); }
    };
  }

  function restoreDate() {
    (globalThis as unknown as { Date: typeof Date }).Date = OrigDate;
  }

  // =========================================================================
  // Pass 1: Render at T1 (baseline)
  // =========================================================================

  mockDate(T1);
  resetStateTracking();
  silence();
  const app1 = exampleMain();
  restore();
  await settle();

  resolveSetterSlotMap();

  if (!app1) {
    process.stderr.write('Failed to render at T1\n');
    process.exit(1);
  }

  const ctx1 = newCollectContext();
  collectTree(app1._root, ctx1);
  const t1Texts = new Map(ctx1.labelTexts);

  process.stderr.write(`State slots discovered: ${stateSlots.length}\n`);
  process.stderr.write(`Button bindings discovered: ${buttonBindings.length}\n`);
  for (const b of buttonBindings) {
    process.stderr.write(`  button="${b.button}" handler=${b.handlerSource}\n`);
  }

  // =========================================================================
  // Pass 2: Perturbation — discover state-dependent labels
  // =========================================================================

  const stateDeps = new Map<number, IRStateDep>();
  const skinDeps = new Map<number, IRSkinDep>();

  interface BranchInfo {
    stateSlot: number;
    perturbedValue: unknown;
    baselineLabels: Map<number, string>;
    perturbedLabels: Map<number, string>;
  }
  const branchInfos: BranchInfo[] = [];
  const conditionalChildren: IRConditionalChild[] = [];

  function extractStringValuesFromHandlers(): Map<number, Set<string>> {
    for (const binding of buttonBindings) {
      analyzeButtonHandler(binding.handlerSource, setterSlotMap, stringEnumValues);
    }
    return stringEnumValues;
  }

  function computePerturbedValues(slot: StateSlot): unknown[] {
    const v = slot.initialValue;
    if (typeof v === 'number') return [v + 42];
    if (typeof v === 'boolean') return [!v];
    if (typeof v === 'string') {
      const enumValues = extractStringValuesFromHandlers().get(slot.index);
      if (enumValues && enumValues.size > 0) {
        return [...enumValues].filter((ev) => ev !== v);
      }
      return [v + '__PROBE__'];
    }
    return [];
  }

  for (const slot of stateSlots) {
    const perturbedValues = computePerturbedValues(slot);
    if (perturbedValues.length === 0) continue;

    for (const perturbedValue of perturbedValues) {
      forcedStateValues.set(slot.index, perturbedValue);
      resetStateTracking();
      silence();
      const appP = exampleMain();
      restore();

      if (appP) {
        const ctxP = newCollectContext();
        collectTree(appP._root, ctxP);

        const baseKeys = [...t1Texts.keys()].sort((a, b) => a - b);
        const pertKeys = [...ctxP.labelTexts.keys()].sort((a, b) => a - b);
        const sameShape = baseKeys.length === pertKeys.length &&
          baseKeys.every((k, i) => k === pertKeys[i]);

        if (sameShape) {
          // Text changes
          for (const [idx, baseText] of t1Texts) {
            const pertText = ctxP.labelTexts.get(idx);
            if (pertText !== undefined && pertText !== baseText) {
              let formatExpr: string;
              if (String(perturbedValue) === pertText) {
                formatExpr = `"" + this.s${slot.index}`;
              } else if (typeof slot.initialValue === 'boolean') {
                const pertTimeFmt = inferTimeFormat(pertText, T1);
                if (pertTimeFmt && (pertTimeFmt === 'MMSS' || pertTimeFmt === 'HHMM')) {
                  formatExpr = `this.s${slot.index} ? (function(e) { return pad(Math.floor(e / 60)) + ":" + pad(e % 60); })(Math.floor((Date.now() - this._startTime_s${slot.index}) / 1000)) : "${baseText.replace(/"/g, '\\"')}"`;
                  stateDeps.set(idx, { slotIndex: slot.index, formatExpr, needsTime: true });
                  process.stderr.write(`  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed=ELAPSED:${pertTimeFmt})\n`);
                  continue;
                } else {
                  formatExpr = `this.s${slot.index} ? "${pertText.replace(/"/g, '\\"')}" : "${baseText.replace(/"/g, '\\"')}"`;
                }
              } else {
                formatExpr = `"" + this.s${slot.index}`;
              }
              stateDeps.set(idx, { slotIndex: slot.index, formatExpr });
              process.stderr.write(`  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed="${pertText}")\n`);
            }
          }

          // Rect fill changes
          for (const [rIdx, baseFill] of ctx1.rectFills) {
            const pertFill = ctxP.rectFills.get(rIdx);
            if (pertFill !== undefined && pertFill !== baseFill) {
              skinDeps.set(rIdx, {
                slotIndex: slot.index,
                skins: [baseFill, pertFill],
              });
              process.stderr.write(`  Rect ${rIdx} skin depends on state slot ${slot.index} (base="${baseFill}", perturbed="${pertFill}")\n`);
            }
          }
        } else {
          // Structural changes
          if (listInfoRaw && listInfoRaw.scrollSetterName && setterSlotMap.get(listInfoRaw.scrollSetterName) === slot.index) {
            process.stderr.write(`  State slot ${slot.index} causes structural change (skipped — list scroll)\n`);
            for (const [idx, baseText] of t1Texts) {
              const pertText = ctxP.labelTexts.get(idx);
              if (pertText !== undefined && pertText !== baseText) {
                if (listSlotLabels.has(idx)) continue;
                let formatExpr: string;
                const pv = String(Number(perturbedValue) + 1);
                if (pertText.includes(pv)) {
                  const before = pertText.substring(0, pertText.indexOf(pv));
                  const after = pertText.substring(pertText.indexOf(pv) + pv.length);
                  // Check if the suffix also has a dynamic number (e.g. min(s0+VISIBLE, dataLen))
                  // Compare the base suffix with the perturbed suffix
                  const _searchStr = String(Number(slot.initialValue) + 1);
                  const _searchIdx = baseText.indexOf(_searchStr);
                  const baseAfterFirstNum = baseText.substring(_searchIdx + _searchStr.length);
                  if (after !== baseAfterFirstNum && listInfoRaw) {
                    // Find differing numbers in base vs perturbed suffix
                    const baseNums = baseAfterFirstNum.match(/\d+/g) ?? [];
                    const pertNums = after.match(/\d+/g) ?? [];
                    if (baseNums.length > 0 && pertNums.length > 0 && baseNums[0] !== pertNums[0]) {
                      // Likely min(s0 + visibleCount, dataLen) pattern
                      // Derive visibleCount from the base number: baseNum = min(initVal + vis, dataLen) → vis = baseNum - initVal
                      const baseNum = Number(baseNums[0]);
                      const dataLen = listInfoRaw.dataArrayValues?.length ?? listInfoRaw.dataArrayObjects?.length ?? 0;
                      const initVal = Number(slot.initialValue);
                      const derivedVis = baseNum - initVal;
                      if (derivedVis > 0 && dataLen > 0 && baseNum === Math.min(initVal + derivedVis, dataLen)) {
                        // Extract the static parts around the dynamic number in the suffix
                        const numIdx = after.indexOf(pertNums[0]!);
                        const midBefore = after.substring(0, numIdx);
                        const midAfter = after.substring(numIdx + pertNums[0]!.length);
                        formatExpr = `${before ? `"${before}" + ` : ''}(this.s${slot.index} + 1)${midBefore ? ` + "${midBefore}" + ` : ' + '}MIN(this.s${slot.index} + ${derivedVis}, ${dataLen})${midAfter ? ` + "${midAfter}"` : ''}`;
                        stateDeps.set(idx, { slotIndex: slot.index, formatExpr });
                        process.stderr.write(`  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed="${pertText}") [with min expr]\n`);
                        continue;
                      }
                    }
                  }
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
                process.stderr.write(`  Label ${idx} depends on state slot ${slot.index} (base="${baseText}", perturbed="${pertText}")\n`);
              }
            }
          } else if (typeof slot.initialValue === 'boolean') {
            const diffs = diffTreeChildren(app1._root, appP._root, slot.index);
            if (diffs.length > 0) {
              conditionalChildren.push(...diffs);
              process.stderr.write(`  State slot ${slot.index}: ${diffs.length} conditional child(ren) detected\n`);
            } else {
              process.stderr.write(`  State slot ${slot.index} causes structural change: ${baseKeys.length} → ${pertKeys.length} labels\n`);
              branchInfos.push({ stateSlot: slot.index, perturbedValue, baselineLabels: new Map(t1Texts), perturbedLabels: new Map(ctxP.labelTexts) });
            }
          } else {
            process.stderr.write(`  State slot ${slot.index} causes structural change: ${baseKeys.length} → ${pertKeys.length} labels\n`);
            branchInfos.push({ stateSlot: slot.index, perturbedValue, baselineLabels: new Map(t1Texts), perturbedLabels: new Map(ctxP.labelTexts) });
          }
        }

        appP.unmount();
      }

      forcedStateValues.delete(slot.index);
    }
  }

  app1.unmount();

  process.stderr.write(`State-dependent labels: ${stateDeps.size}\n`);
  process.stderr.write(`Structural branches: ${branchInfos.length}\n`);
  if (conditionalChildren.length > 0) {
    process.stderr.write(`Conditional subtrees: ${conditionalChildren.length}\n`);
  }

  // =========================================================================
  // Pass 3: List slot detection
  // =========================================================================

  if (listInfoRaw) {
    if (listInfoRaw.scrollSetterName && setterSlotMap.has(listInfoRaw.scrollSetterName)) {
      listScrollSlotIndex = setterSlotMap.get(listInfoRaw.scrollSetterName)!;
    }

    if (listScrollSlotIndex >= 0) {
      forcedStateValues.set(listScrollSlotIndex, 1);
      resetStateTracking();
      silence();
      const appScroll = exampleMain();
      restore();

      if (appScroll) {
        const ctxScroll = newCollectContext();
        collectTree(appScroll._root, ctxScroll);

        for (const [idx, baseText] of t1Texts) {
          // Skip labels already identified as state-dependent (e.g. header showing scroll range)
          if (stateDeps.has(idx)) continue;
          const scrollText = ctxScroll.labelTexts.get(idx);
          if (scrollText !== undefined && scrollText !== baseText) {
            listSlotLabels.add(idx);
          }
        }
        appScroll.unmount();
      }
      forcedStateValues.delete(listScrollSlotIndex);
    }

    const expectedSlots = listInfoRaw.visibleCount * listInfoRaw.labelsPerItem;
    if (listSlotLabels.size > expectedSlots && listInfoRaw.labelsPerItem > 0) {
      // Runtime detected more list slots than AST analysis predicted — trust
      // the runtime count and update visibleCount accordingly.
      listInfoRaw.visibleCount = Math.floor(listSlotLabels.size / listInfoRaw.labelsPerItem);
      process.stderr.write(`  visibleCount updated to ${listInfoRaw.visibleCount} from runtime detection\n`);
    }

    if (listSlotLabels.size === 0 && messageInfoRaw && listInfoRaw) {
      const allLabels = [...t1Texts.keys()].sort((a, b) => a - b);
      const listLabels = allLabels.slice(-expectedSlots);
      for (const idx of listLabels) listSlotLabels.add(idx);
      process.stderr.write(`Message-driven list labels (inferred): [${[...listSlotLabels].join(', ')}]\n`);
    }

    if (listSlotLabels.size > 0) {
      process.stderr.write(`List slot labels: [${[...listSlotLabels].join(', ')}]\n`);
    }

  }

  // =========================================================================
  // Pass 4: Time diff (T2 render)
  // =========================================================================

  mockDate(T2);
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

  const ctx2 = newCollectContext();
  collectTree(app2._root, ctx2);
  const t2Texts = new Map(ctx2.labelTexts);
  app2.unmount();
  restoreDate();

  const dynamicLabels = new Set<number>();
  const labelFormats = new Map<number, TimeFormat>();

  for (const [idx, text1] of t1Texts) {
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

  // =========================================================================
  // Pass 5: Animation keyframes
  // =========================================================================

  const animatedElements: IRAnimatedElement[] = [];
  const t1Positions = ctx1.elementPositions;
  const t2Positions = ctx2.elementPositions;

  const changedElems = new Set<number>();
  for (const [idx, pos1] of t1Positions) {
    const pos2 = t2Positions.get(idx);
    if (!pos2) continue;
    if (pos1.top !== pos2.top || pos1.width !== pos2.width ||
        pos1.height !== pos2.height || (pos1.radius !== undefined && pos1.radius !== pos2.radius)) {
      changedElems.add(idx);
    }
  }

  const animatedElemIndices = new Set<number>();

  if (changedElems.size > 0) {
    process.stderr.write(`Found ${changedElems.size} animated element(s), sampling keyframes...\n`);
    const keyframeData = new Map<number, Map<string, number[]>>();

    for (let s = 0; s < 60; s++) {
      const kfTime = new OrigDate(T1.getFullYear(), T1.getMonth(), T1.getDate(),
        T1.getHours(), T1.getMinutes(), s, 0);
      mockDate(kfTime);
      forcedStateValues.clear();
      resetStateTracking();
      silence();
      const appKF = exampleMain();
      restore();

      if (appKF) {
        const ctxKF = newCollectContext();
        collectTree(appKF._root, ctxKF);

        for (const eIdx of changedElems) {
          const pos = ctxKF.elementPositions.get(eIdx);
          if (!pos) continue;
          if (!keyframeData.has(eIdx)) keyframeData.set(eIdx, new Map());
          const props = keyframeData.get(eIdx)!;
          for (const prop of ['top', 'width', 'height', 'radius'] as const) {
            const val = pos[prop];
            if (val === undefined) continue;
            if (!props.has(prop)) props.set(prop, []);
            props.get(prop)!.push(val);
          }
        }
        appKF.unmount();
      }
    }

    restoreDate();

    for (const [eIdx, props] of keyframeData) {
      for (const [prop, values] of props) {
        const allSame = values.every(v => v === values[0]);
        if (!allSame) {
          animatedElements.push({
            elemIndex: eIdx,
            prop: prop as IRAnimatedElement['prop'],
            keyframes: values,
          });
          animatedElemIndices.add(eIdx);
        }
      }
    }

    process.stderr.write(`  Animated properties: ${animatedElements.map(a => `e${a.elemIndex}.${a.prop}`).join(', ')}\n`);
  }

  // =========================================================================
  // Pass 5b: Time-reactive graphics (paths with rotation, lines with endpoints)
  // =========================================================================

  const timeReactiveGraphics: IRTimeReactiveGraphic[] = [];

  // Helper: classify time component by measuring angular velocity.
  // Renders at T_sec (27 seconds later than T1) and computes the rotation
  // change rate. Second hands move ~6°/sec, minute ~0.1°/sec, hour ~0.008°/sec.
  function classifyTimeComponent(
    idx: number,
    getRotation: (positions: typeof t1Positions) => number | undefined,
    baseRotation: number,
  ): 'second' | 'minute' | 'hour' {
    const T_sec = new OrigDate(T1.getFullYear(), T1.getMonth(), T1.getDate(),
      T1.getHours(), T1.getMinutes(), 30, 0);
    const deltaSec = 30 - T1.getSeconds(); // seconds difference
    mockDate(T_sec);
    forcedStateValues.clear();
    resetStateTracking();
    silence();
    const appProbe = exampleMain();
    restore();
    restoreDate();

    if (appProbe) {
      const ctxProbe = newCollectContext();
      collectTree(appProbe._root, ctxProbe);
      const probeRotation = getRotation(ctxProbe.elementPositions);
      appProbe.unmount();

      if (probeRotation !== undefined) {
        const deltaAngle = Math.abs(probeRotation - baseRotation);
        const rate = deltaAngle / deltaSec; // degrees per second
        // Second hand: ~6°/sec, Minute hand: ~0.1°/sec, Hour hand: ~0.008°/sec
        if (rate > 1) return 'second';
        if (rate > 0.02) return 'minute';
      }
    }
    return 'hour';
  }

  // Detect graphics elements whose position/rotation changed between T1 and T2
  for (const [idx, pos1] of t1Positions) {
    const pos2 = t2Positions.get(idx);
    if (!pos2) continue;

    if (pos1.type === 'path' && pos2.type === 'path' &&
        pos1.rotation !== undefined && pos2.rotation !== undefined &&
        pos1.rotation !== pos2.rotation) {
      const timeComponent = classifyTimeComponent(
        idx,
        (positions) => positions.get(idx)?.rotation,
        pos1.rotation,
      );

      timeReactiveGraphics.push({
        elemIndex: idx,
        type: 'path_rotation',
        centerX: pos1.left,
        centerY: pos1.top,
        radius: 0,
        timeComponent,
      });
      process.stderr.write(`  Time-reactive path e${idx}: rotation driven by ${timeComponent}\n`);
    }

    if (pos1.type === 'line' && pos2.type === 'line' &&
        pos1.x2 !== undefined && pos2.x2 !== undefined &&
        pos1.y2 !== undefined && pos2.y2 !== undefined &&
        (pos1.x2 !== pos2.x2 || pos1.y2 !== pos2.y2)) {
      const cx = pos1.left;
      const cy = pos1.top;
      const dx = pos1.x2 - cx;
      const dy = pos1.y2 - cy;
      const radius = Math.round(Math.sqrt(dx * dx + dy * dy));

      // For lines, compute the angle from the endpoint to classify
      const baseAngle = Math.atan2(dx, -dy) * 180 / Math.PI; // 0=north, clockwise
      const timeComponent = classifyTimeComponent(
        idx,
        (positions) => {
          const p = positions.get(idx);
          if (p?.x2 === undefined || p?.y2 === undefined) return undefined;
          return Math.atan2(p.x2 - p.left, -(p.y2 - p.top)) * 180 / Math.PI;
        },
        baseAngle,
      );

      timeReactiveGraphics.push({
        elemIndex: idx,
        type: 'line_endpoint',
        centerX: cx,
        centerY: cy,
        radius,
        timeComponent,
      });
      process.stderr.write(`  Time-reactive line e${idx}: endpoint driven by ${timeComponent} (radius=${radius})\n`);
    }
  }

  if (timeReactiveGraphics.length > 0) {
    process.stderr.write(`Found ${timeReactiveGraphics.length} time-reactive graphic(s)\n`);
  }

  // =========================================================================
  // Pass 6: Final render for the visual tree
  // =========================================================================

  mockDate(T1);
  forcedStateValues.clear();
  resetStateTracking();
  silence();
  const appFinal = exampleMain();
  restore();
  await settle();
  restoreDate();

  if (!appFinal) {
    process.stderr.write('Failed to render final snapshot\n');
    process.exit(1);
  }

  const ctxFinal = newCollectContext();
  const finalTree = collectTree(appFinal._root, ctxFinal);

  // =========================================================================
  // Pass 7: Build branch trees (re-render for each branch value)
  // =========================================================================

  const branches = new Map<number, IRBranch[]>();

  if (branchInfos.length > 0) {
    const affectedSlots = new Set(branchInfos.map((b) => b.stateSlot));
    for (const si of affectedSlots) {
      const slot = stateSlots[si];
      // Baseline tree
      const baseCtx = newCollectContext();
      const baseTree = collectTree(appFinal._root, baseCtx);
      branches.set(si, [
        { stateSlot: si, value: slot?.initialValue, tree: baseTree ? [baseTree] : [], isBaseline: true },
      ]);
    }

    for (const branch of branchInfos) {
      forcedStateValues.set(branch.stateSlot, branch.perturbedValue);
      resetStateTracking();
      mockDate(T1);
      silence();
      const appBranch = exampleMain();
      restore();
      restoreDate();
      forcedStateValues.clear();

      if (appBranch) {
        const branchCtx = newCollectContext();
        const branchTree = collectTree(appBranch._root, branchCtx);
        appBranch.unmount();
        branches.get(branch.stateSlot)!.push({
          stateSlot: branch.stateSlot,
          value: branch.perturbedValue,
          tree: branchTree ? [branchTree] : [],
          isBaseline: false,
        });
      }
    }
  }

  appFinal.unmount();

  // =========================================================================
  // Analyze button handlers
  // =========================================================================

  const buttonActions: IRButtonAction[] = [];
  for (const binding of buttonBindings) {
    const action = analyzeButtonHandler(binding.handlerSource, setterSlotMap, stringEnumValues);
    if (action) {
      buttonActions.push({ button: binding.button, action });
      process.stderr.write(`  Button "${binding.button}": ${action.type} s${action.slotIndex} by ${action.value}\n`);
    } else if (listInfoRaw && listSlotLabels.size > 0 && listScrollSlotIndex >= 0) {
      if (binding.button === 'up') {
        buttonActions.push({ button: 'up', action: { type: 'decrement', slotIndex: listScrollSlotIndex, value: 1 } });
        process.stderr.write(`  Button "up": list scroll up (fallback)\n`);
      } else if (binding.button === 'down') {
        buttonActions.push({ button: 'down', action: { type: 'increment', slotIndex: listScrollSlotIndex, value: 1 } });
        process.stderr.write(`  Button "down": list scroll down (fallback)\n`);
      }
    }
  }

  // =========================================================================
  // Restore hooks
  // =========================================================================

  _restoreUseState();

  // =========================================================================
  // Assemble CompilerIR — pure synthesis from harvested observations.
  // See scripts/analyzer/ir-assembly.ts and ADR 0006.
  // =========================================================================

  const entrySrc = readFileSync(entryPath, 'utf-8');
  return assembleIR({
    platformSpec,
    scan,
    stateSlots,
    stateDeps,
    skinDeps,
    dynamicLabels,
    labelFormats,
    conditionalChildren,
    animatedElements,
    timeReactiveGraphics,
    branches,
    buttonActions,
    finalTree,
    imageResources: ctxFinal.imageResources,
    listSlotLabels,
    listScrollSlotIndex,
    mockDataSource,
    explicitGranularity: detectExplicitGranularity(entrySrc),
  });
}
