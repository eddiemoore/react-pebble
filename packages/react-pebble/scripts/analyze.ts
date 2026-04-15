/**
 * scripts/analyze.ts — Analysis phase of the react-pebble compiler.
 *
 * Renders the component, intercepts hooks, performs perturbation analysis,
 * and produces a backend-agnostic CompilerIR. Extracted from compile-to-piu.ts.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '../src/index.js';
import type { DOMElement, AnyNode } from '../src/pebble-dom.js';
import { getTextContent } from '../src/pebble-dom.js';
import { COLOR_PALETTE } from '../src/pebble-output.js';
import { _setUseStateImpl, _restoreUseState } from '../src/hooks/index.js';
import { useState as realUseState } from 'preact/hooks';
import { PLATFORMS } from '../src/platform.js';
import type {
  CompilerIR, IRElement, IRStateSlot, IRButtonAction,
  IRStateDep, IRSkinDep, IRBranch, IRConditionalChild,
  IRListInfo, IRAnimatedElement, IRTimeReactiveGraphic, IRMessageInfo, IRConfigInfo, TimeFormat, TimeGranularity,
} from './compiler-ir.js';

function detectGranularity(
  timeDeps: Map<number, TimeFormat>,
  hasAnimatedElements: boolean,
  hasTimeReactiveGraphics: boolean,
): TimeGranularity | null {
  if (timeDeps.size === 0 && !hasAnimatedElements && !hasTimeReactiveGraphics) {
    return null;
  }
  if (hasAnimatedElements || hasTimeReactiveGraphics) return 'second';
  const formats = [...timeDeps.values()];
  if (formats.some(f => f === 'SS' || f === 'MMSS')) return 'second';
  if (formats.some(f => f === 'HHMM')) return 'minute';
  if (formats.length > 0 && formats.every(f => f === 'DATE')) return 'day';
  return 'minute';
}

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
// AST helpers
// ---------------------------------------------------------------------------

function parseExampleSource(exName: string): ts.SourceFile | null {
  if (exName.startsWith('/')) {
    try {
      const source = readFileSync(exName, 'utf-8');
      return ts.createSourceFile(exName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch { /* fall through */ }
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '']) {
    const srcPath = exName.startsWith('/')
      ? `${exName}${ext}`
      : resolve('examples', `${exName}${ext}`);
    try {
      const source = readFileSync(srcPath, 'utf-8');
      return ts.createSourceFile(srcPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch { continue; }
  }
  return null;
}

function walkAST(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, child => walkAST(child, visitor));
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

interface ButtonBinding {
  button: string;
  handlerSource: string;
}

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

      return {
        type: 'rect',
        x, y, w, h,
        fill: fill ? colorToHex(fill) : undefined,
        texture: textureSrc,
        variant: num(p, 'variant'),
        borders,
        tiles,
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
      const w = num(p, 'w') || num(p, 'width');
      const x = num(p, 'x');
      const y = num(p, 'y');

      const labelIdx = ctx.labelIdx++;
      ctx.labelTexts.set(labelIdx, text);

      return {
        type: 'text',
        x, y, w, h: 0,
        text,
        font: font ?? 'gothic18',
        color: colorToHex(color),
        align,
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

      return {
        type: 'path',
        x: num(p, 'x'), y: num(p, 'y'), w: 0, h: 0,
        points: points.map(([px, py]) => [px, py] as [number, number]),
        rotation,
        fill: colorToHex(fill),
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

      return {
        type: 'text' as const,
        x: num(p, 'x'), y: num(p, 'y'), w, h,
        text,
        font: fontName,
        color: colorToHex(colorName),
        align,
        labelIndex: labelIdx,
        isWrapping: true,
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
      return {
        type: 'image' as const,
        x, y, w, h,
        src,
        elemIndex: elemIdx,
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

function extractButtonBindingsFromSource(
  exName: string,
  buttonBindings: ButtonBinding[],
): void {
  const sf = parseExampleSource(exName);
  if (!sf) return;

  walkAST(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
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

function buildSetterInfo(exName: string): { name: string; initValue: unknown }[] {
  const result: { name: string; initValue: unknown }[] = [];
  const sf = parseExampleSource(exName);
  if (!sf) return result;

  walkAST(sf, (node) => {
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
  });

  return result;
}

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
// List detection
// ---------------------------------------------------------------------------

interface ListInfoRaw {
  dataArrayName: string;
  dataArrayValues: string[] | null;
  dataArrayObjects: Record<string, string>[] | null;
  propertyOrder: string[] | null;
  visibleCount: number;
  scrollSetterName: string | null;
  labelsPerItem: number;
}

function detectListPatterns(exName: string): ListInfoRaw | null {
  const sf = parseExampleSource(exName);
  if (!sf) return null;

  let mapCallFound = false;
  let dataArrayName: string | null = null;
  let visibleCount = 3;
  let scrollSetterName: string | null = null;
  let labelsPerItem = 1;
  let dataArrayValues: string[] | null = null;
  let dataArrayObjects: Record<string, string>[] | null = null;

  const arrayLiterals = new Map<string, string[]>();
  const objectArrayLiterals = new Map<string, Record<string, string>[]>();
  walkAST(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
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

  // Collect numeric constants (const FOO = 3, const BAR = Math.floor(...), etc.)
  const numericConsts = new Map<string, number>();
  function tryEvalNumeric(expr: any): number | undefined {
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isIdentifier(expr)) return numericConsts.get(expr.text);
    if (ts.isParenthesizedExpression(expr)) return tryEvalNumeric(expr.expression);
    if (ts.isBinaryExpression(expr)) {
      const l = tryEvalNumeric(expr.left);
      const r = tryEvalNumeric(expr.right);
      if (l !== undefined && r !== undefined) {
        switch (expr.operatorToken.kind) {
          case ts.SyntaxKind.PlusToken: return l + r;
          case ts.SyntaxKind.MinusToken: return l - r;
          case ts.SyntaxKind.AsteriskToken: return l * r;
          case ts.SyntaxKind.SlashToken: return r !== 0 ? l / r : undefined;
          case ts.SyntaxKind.PercentToken: return r !== 0 ? l % r : undefined;
        }
      }
    }
    if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
      const obj = expr.expression.expression;
      const method = expr.expression.name.text;
      if (ts.isIdentifier(obj) && obj.text === 'Math' && expr.arguments.length >= 1) {
        const args = expr.arguments.map(a => tryEvalNumeric(a));
        if (args.every(a => a !== undefined)) {
          const nums = args as number[];
          switch (method) {
            case 'floor': return Math.floor(nums[0]!);
            case 'ceil': return Math.ceil(nums[0]!);
            case 'round': return Math.round(nums[0]!);
            case 'min': return Math.min(...nums);
            case 'max': return Math.max(...nums);
            case 'abs': return Math.abs(nums[0]!);
          }
        }
      }
    }
    // Property access on arrays: ITEMS.length
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'length' && ts.isIdentifier(expr.expression)) {
      const arr = arrayLiterals.get(expr.expression.text);
      if (arr) return arr.length;
      const objArr = objectArrayLiterals.get(expr.expression.text);
      if (objArr) return objArr.length;
    }
    return undefined;
  }
  // Two-pass: first collect simple literals, then resolve computed expressions
  walkAST(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const val = tryEvalNumeric(node.initializer);
      if (val !== undefined) numericConsts.set(node.name.text, val);
    }
  });
  // Second pass to resolve forward references
  walkAST(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!numericConsts.has(node.name.text)) {
        const val = tryEvalNumeric(node.initializer);
        if (val !== undefined) numericConsts.set(node.name.text, val);
      }
    }
  });

  walkAST(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map'
    ) {
      mapCallFound = true;
      const obj = node.expression.expression;
      if (ts.isIdentifier(obj) && !dataArrayName) {
        dataArrayName = obj.text;
        dataArrayValues = arrayLiterals.get(obj.text) ?? null;
        dataArrayObjects = objectArrayLiterals.get(obj.text) ?? null;
      }
      if (node.arguments.length > 0) {
        let textCount = 0;
        walkAST(node.arguments[0]!, (n) => {
          if (ts.isJsxSelfClosingElement(n) && ts.isIdentifier(n.tagName) && n.tagName.text === 'Text') textCount++;
          if (ts.isJsxElement(n) && ts.isIdentifier(n.openingElement.tagName) && n.openingElement.tagName.text === 'Text') textCount++;
        });
        if (textCount > 0) labelsPerItem = textCount;
      }
    }

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
          secondArg.operatorToken.kind === ts.SyntaxKind.PlusToken
        ) {
          if (ts.isNumericLiteral(secondArg.right)) {
            visibleCount = Number(secondArg.right.text);
          } else if (ts.isIdentifier(secondArg.right)) {
            const resolved = numericConsts.get(secondArg.right.text);
            if (resolved !== undefined) visibleCount = resolved;
          }
        }
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

      const sliceObj = node.initializer.expression.expression;
      if (ts.isIdentifier(sliceObj)) {
        dataArrayName = sliceObj.text;
        dataArrayValues = arrayLiterals.get(sliceObj.text) ?? null;
        dataArrayObjects = objectArrayLiterals.get(sliceObj.text) ?? null;
      }
    }
  });

  if (!mapCallFound || !dataArrayName) return null;

  let propertyOrder: string[] | null = null;
  const objs = dataArrayObjects as Record<string, string>[] | null;
  if (objs && objs.length > 0 && labelsPerItem > 1) {
    propertyOrder = Object.keys(objs[0]!).slice(0, labelsPerItem);
  }

  return { dataArrayName, dataArrayValues, dataArrayObjects, propertyOrder, visibleCount, scrollSetterName, labelsPerItem };
}

// ---------------------------------------------------------------------------
// useMessage detection
// ---------------------------------------------------------------------------

interface MessageInfoRaw {
  key: string;
  mockDataArrayName: string | null;
}

function detectUseMessage(exName: string): MessageInfoRaw | null {
  const sf = parseExampleSource(exName);
  if (!sf) return null;

  let key: string | null = null;
  let mockDataArrayName: string | null = null;

  walkAST(sf, (node) => {
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

function extractMockDataSource(exName: string, mockDataArrayName: string): string | null {
  const sf = parseExampleSource(exName);
  if (!sf) return null;

  let result: string | null = null;
  walkAST(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === mockDataArrayName &&
      node.initializer
    ) {
      result = node.initializer.getText(sf);
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
// useConfiguration detection
// ---------------------------------------------------------------------------

interface ConfigInfoRaw {
  keys: Array<{ key: string; label: string; type: 'color' | 'boolean' | 'string'; default: string | boolean }>;
  url: string | null;
  appName: string | null;
  sectionTitles: string[];
}

function detectUseConfiguration(exName: string): ConfigInfoRaw | null {
  const sf = parseExampleSource(exName);
  if (!sf) return null;

  const keys: ConfigInfoRaw['keys'] = [];
  let urlValue: string | null = null;

  walkAST(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useConfiguration' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0]!)
    ) {
      const objLit = node.arguments[0] as ts.ObjectLiteralExpression;
      for (const prop of objLit.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

        // Extract url
        if (prop.name.text === 'url') {
          if (ts.isStringLiteral(prop.initializer)) {
            urlValue = prop.initializer.text;
          } else {
            // Could be a variable reference — capture the text
            urlValue = prop.initializer.getText(sf);
          }
        }

        // Extract defaults object
        if (prop.name.text === 'defaults' && ts.isObjectLiteralExpression(prop.initializer)) {
          const defaults = prop.initializer as ts.ObjectLiteralExpression;
          for (const dp of defaults.properties) {
            if (!ts.isPropertyAssignment(dp) || !ts.isIdentifier(dp.name)) continue;
            const key = dp.name.text;
            const init = dp.initializer;

            // Default label from camelCase key name
            const defaultLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

            if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) {
              keys.push({ key, label: defaultLabel, type: 'boolean', default: init.kind === ts.SyntaxKind.TrueKeyword });
            } else if (ts.isStringLiteral(init)) {
              // Heuristic: 6-char hex strings are colors
              const val = init.text;
              const isColor = /^[0-9a-fA-F]{6}$/.test(val);
              keys.push({ key, label: defaultLabel, type: isColor ? 'color' : 'string', default: val });
            } else if (ts.isNumericLiteral(init)) {
              keys.push({ key, label: defaultLabel, type: 'string', default: init.text });
            }
          }
        }
      }
    }
  });

  if (keys.length === 0) return null;

  // Second pass: scan for ConfigColor/ConfigToggle/ConfigText/ConfigSelect calls
  // to extract human-readable labels, and ConfigPage/ConfigSection for titles
  const labelMap = new Map<string, string>();
  let appName: string | null = null;
  const sectionTitles: string[] = [];

  walkAST(sf, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;

    const fnName = node.expression.text;

    // Config item labels
    if (['ConfigColor', 'ConfigToggle', 'ConfigText', 'ConfigSelect'].includes(fnName) &&
        node.arguments.length >= 2) {
      const keyArg = node.arguments[0];
      const labelArg = node.arguments[1];
      if (keyArg && ts.isStringLiteral(keyArg) && labelArg && ts.isStringLiteral(labelArg)) {
        labelMap.set(keyArg.text, labelArg.text);
      }
    }

    // ConfigSection title
    if (fnName === 'ConfigSection' && node.arguments.length >= 1) {
      const titleArg = node.arguments[0];
      if (titleArg && ts.isStringLiteral(titleArg)) {
        sectionTitles.push(titleArg.text);
      }
    }

    // ConfigPage appName from options object
    if (fnName === 'ConfigPage' && node.arguments.length >= 2) {
      const optsArg = node.arguments[1];
      if (optsArg && ts.isObjectLiteralExpression(optsArg)) {
        for (const prop of optsArg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) &&
              prop.name.text === 'appName' && ts.isStringLiteral(prop.initializer)) {
            appName = prop.initializer.text;
          }
        }
      }
    }
  });

  // Apply labels to keys
  for (const k of keys) {
    const label = labelMap.get(k.key);
    if (label) {
      k.label = label;
    }
  }

  return { keys, url: urlValue, appName, sectionTitles };
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

  // Import the example module
  const exampleMod = await import(entryPath);
  const exampleMain: (...args: unknown[]) => ReturnType<typeof render> =
    exampleMod.main ?? exampleMod.default;

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
  const buttonBindings: ButtonBinding[] = [];
  extractButtonBindingsFromSource(entryPath, buttonBindings);

  // --- Setter info ---
  const _setterInfo = buildSetterInfo(entryPath);
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
  const listInfoRaw = detectListPatterns(entryPath);
  if (listInfoRaw) {
    process.stderr.write(`List detected: array="${listInfoRaw.dataArrayName}" visible=${listInfoRaw.visibleCount} labelsPerItem=${listInfoRaw.labelsPerItem}\n`);
    if (listInfoRaw.scrollSetterName) process.stderr.write(`  scroll setter: ${listInfoRaw.scrollSetterName}\n`);
  }

  // --- Message detection ---
  const messageInfoRaw = detectUseMessage(entryPath);
  let mockDataSource: string | null = null;
  if (messageInfoRaw) {
    process.stderr.write(`useMessage detected: key="${messageInfoRaw.key}"${messageInfoRaw.mockDataArrayName ? ` mockData=${messageInfoRaw.mockDataArrayName}` : ''}\n`);
    if (messageInfoRaw.mockDataArrayName) {
      mockDataSource = extractMockDataSource(entryPath, messageInfoRaw.mockDataArrayName);
      if (mockDataSource) process.stderr.write(`mockDataValue=${mockDataSource}\n`);
    }
  }

  // --- Configuration detection ---
  const configInfoRaw = detectUseConfiguration(entryPath);
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
  // Build convenience flags
  // =========================================================================

  const stateNeedsTime = [...stateDeps.values()].some(d => d.needsTime);
  const hasAnimatedElements = animatedElements.length > 0;
  const hasTimeReactiveGraphics = timeReactiveGraphics.length > 0;
  const hasTimeDeps = dynamicLabels.size > 0 || stateNeedsTime || hasAnimatedElements || hasTimeReactiveGraphics;

  // Tick granularity: explicit `useTime('minute')` arg wins; else derive from
  // the formats the app actually renders.
  const entrySrc = readFileSync(entryPath, 'utf-8');
  const explicitGranularity = detectExplicitGranularity(entrySrc);
  const detectedGranularity = detectGranularity(
    labelFormats,
    hasAnimatedElements,
    hasTimeReactiveGraphics,
  );
  const timeGranularity: TimeGranularity | null = hasTimeDeps
    ? (explicitGranularity ?? detectedGranularity ?? 'minute')
    : null;
  const hasStateDeps = stateDeps.size > 0;
  const hasButtons = buttonActions.length > 0;
  const hasBranches = branchInfos.length > 0;
  const hasConditionals = conditionalChildren.length > 0 && !messageInfoRaw;
  const hasSkinDeps = skinDeps.size > 0;
  const hasList = listInfoRaw !== null && listSlotLabels.size > 0;

  // =========================================================================
  // Build IR
  // =========================================================================

  const irStateSlots: IRStateSlot[] = stateSlots.map(s => ({
    index: s.index,
    initialValue: s.initialValue,
    type: typeof s.initialValue === 'number' ? 'number'
        : typeof s.initialValue === 'boolean' ? 'boolean'
        : typeof s.initialValue === 'string' ? 'string'
        : 'unknown',
  }));

  const irListInfo: IRListInfo | null = listInfoRaw && hasList ? {
    ...listInfoRaw,
    scrollSlotIndex: listScrollSlotIndex,
  } : null;

  const irMessageInfo: IRMessageInfo | null = messageInfoRaw ? {
    key: messageInfoRaw.key,
    mockDataArrayName: messageInfoRaw.mockDataArrayName,
    mockDataSource,
  } : null;

  const irConfigInfo: IRConfigInfo | null = configInfoRaw ? {
    keys: configInfoRaw.keys,
    url: configInfoRaw.url,
    appName: configInfoRaw.appName,
    sectionTitles: configInfoRaw.sectionTitles,
  } : null;

  // Assign names and reactivity flags to the final tree elements
  function assignNames(elements: IRElement[]): void {
    for (const el of elements) {
      if (el.labelIndex !== undefined) {
        if (listSlotLabels.has(el.labelIndex)) {
          el.isListSlot = true;
          const flatIdx = [...listSlotLabels].indexOf(el.labelIndex);
          const lpi = listInfoRaw?.labelsPerItem ?? 1;
          const itemIdx = Math.floor(flatIdx / lpi);
          const labelIdx = flatIdx % lpi;
          el.name = lpi > 1 ? `ls${itemIdx}_${labelIdx}` : `ls${flatIdx}`;
        } else if (stateDeps.has(el.labelIndex)) {
          el.isStateDynamic = true;
          el.name = `sl${el.labelIndex}`;
        } else if (dynamicLabels.has(el.labelIndex)) {
          el.isTimeDynamic = true;
          el.name = `tl${el.labelIndex}`;
        }
      }
      if (el.rectIndex !== undefined && skinDeps.has(el.rectIndex)) {
        el.isSkinDynamic = true;
        el.name = `sr${el.rectIndex}`;
      }
      if (el.elemIndex !== undefined && animatedElemIndices.has(el.elemIndex)) {
        el.isAnimated = true;
        if (!el.name) el.name = `ae${el.elemIndex}`;
      }
      if (el.children) assignNames(el.children);
      // Assign list group names AFTER children have been named
      if (el.type === 'group' && el.children && listInfoRaw && listInfoRaw.labelsPerItem > 1) {
        const directListChildren = el.children.filter(c => c.isListSlot && c.name?.startsWith('ls'));
        if (directListChildren.length > 0) {
          const m = directListChildren[0]!.name?.match(/^ls(\d+)/);
          if (m) el.listGroupName = `lg${m[1]}`;
        }
      }
    }
  }

  const tree = finalTree ? [finalTree] : [];
  assignNames(tree);

  // Only assign names on baseline branch trees — perturbed branches have
  // baked-in label text and don't need runtime references.
  for (const [, branchList] of branches) {
    for (const branch of branchList) {
      if (branch.isBaseline) {
        assignNames(branch.tree);
      }
    }
  }

  return {
    platform: {
      name: platformSpec.name,
      width: platformSpec.width,
      height: platformSpec.height,
      isRound: platformSpec.isRound,
    },
    tree,
    stateSlots: irStateSlots,
    buttonActions,
    timeDeps: labelFormats,
    stateDeps,
    skinDeps,
    branches,
    conditionalChildren,
    listInfo: irListInfo,
    listSlotLabels,
    timeReactiveGraphics,
    animatedElements,
    messageInfo: irMessageInfo,
    configInfo: irConfigInfo,
    hasButtons,
    hasTimeDeps,
    timeGranularity,
    hasStateDeps,
    hasBranches,
    hasConditionals,
    hasSkinDeps,
    hasList,
    hasAnimatedElements,
    hasImages: ctxFinal.imageResources.length > 0,
    imageResources: ctxFinal.imageResources,
  };
}
