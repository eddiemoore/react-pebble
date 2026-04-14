/**
 * scripts/emit-c.ts — Pebble C SDK code generation backend.
 *
 * Consumes a CompilerIR and produces a complete main.c for classic Pebble
 * platforms (basalt, chalk, diorite, aplite). Uses TextLayer for text,
 * a custom Layer with update_proc for graphics, and the full Pebble C SDK
 * for buttons, timers, and AppMessage.
 */

import type { CompilerIR, IRElement, IRStateSlot, IRTimeReactiveGraphic, TimeFormat } from './compiler-ir.js';
import { stripThisPrefix } from './compiler-ir.js';

// ---------------------------------------------------------------------------
// Font mapping
// ---------------------------------------------------------------------------

const FONT_TO_C: Record<string, string> = {
  gothic14: 'FONT_KEY_GOTHIC_14',
  gothic14Bold: 'FONT_KEY_GOTHIC_14_BOLD',
  gothic18: 'FONT_KEY_GOTHIC_18',
  gothic18Bold: 'FONT_KEY_GOTHIC_18_BOLD',
  gothic24: 'FONT_KEY_GOTHIC_24',
  gothic24Bold: 'FONT_KEY_GOTHIC_24_BOLD',
  gothic28: 'FONT_KEY_GOTHIC_28',
  gothic28Bold: 'FONT_KEY_GOTHIC_28_BOLD',
  bitham30Black: 'FONT_KEY_BITHAM_30_BLACK',
  bitham42Bold: 'FONT_KEY_BITHAM_42_BOLD',
  bitham42Light: 'FONT_KEY_BITHAM_42_LIGHT',
  bitham34MediumNumbers: 'FONT_KEY_BITHAM_34_MEDIUM_NUMBERS',
  bitham42MediumNumbers: 'FONT_KEY_BITHAM_42_MEDIUM_NUMBERS',
  robotoCondensed21: 'FONT_KEY_ROBOTO_CONDENSED_21',
  roboto21: 'FONT_KEY_ROBOTO_CONDENSED_21',
  droid28: 'FONT_KEY_DROID_SERIF_28_BOLD',
  leco20: 'FONT_KEY_LECO_20_BOLD_NUMBERS',
  leco26: 'FONT_KEY_LECO_26_BOLD_NUMBERS_AM_PM',
  leco28: 'FONT_KEY_LECO_28_LIGHT_NUMBERS',
  leco32: 'FONT_KEY_LECO_32_BOLD_NUMBERS',
  leco36: 'FONT_KEY_LECO_36_BOLD_NUMBERS',
  leco38: 'FONT_KEY_LECO_38_BOLD_NUMBERS',
  leco42: 'FONT_KEY_LECO_42_NUMBERS',
};

function fontToC(name: string | undefined): string {
  if (!name) return 'FONT_KEY_GOTHIC_18';
  return FONT_TO_C[name] ?? 'FONT_KEY_GOTHIC_18';
}

/** Is this font name a system font (vs a declared custom font resource)? */
function isSystemFontC(name: string | undefined): boolean {
  return !name || Object.prototype.hasOwnProperty.call(FONT_TO_C, name);
}

/** Emit the full font expression — system fonts load-once, customs use a static. */
function fontExprC(name: string | undefined): string {
  if (isSystemFontC(name)) {
    return `fonts_get_system_font(${fontToC(name)})`;
  }
  // Custom font — resource name uppercased, resolved at window_load into a static.
  const resName = String(name).toUpperCase();
  return `s_font_${resName.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

function colorToGColor(hex: string): string {
  if (hex === '#000000') return 'GColorBlack';
  if (hex === '#ffffff') return 'GColorWhite';
  if (hex === '#00000000' || hex === 'transparent') return 'GColorClear';
  // Strip '#' and convert to 0xRRGGBB
  const h = hex.replace('#', '');
  return `GColorFromHEX(0x${h})`;
}

// ---------------------------------------------------------------------------
// Alignment mapping
// ---------------------------------------------------------------------------

function alignToC(align: string | undefined): string {
  switch (align) {
    case 'center': return 'GTextAlignmentCenter';
    case 'right': return 'GTextAlignmentRight';
    default: return 'GTextAlignmentLeft';
  }
}

// ---------------------------------------------------------------------------
// Button ID mapping
// ---------------------------------------------------------------------------

const BUTTON_MAP: Record<string, string> = {
  up: 'BUTTON_ID_UP',
  down: 'BUTTON_ID_DOWN',
  select: 'BUTTON_ID_SELECT',
  back: 'BUTTON_ID_BACK',
};

// ---------------------------------------------------------------------------
// Time format → strftime
// ---------------------------------------------------------------------------

function timeFormatToStrftime(fmt: TimeFormat): string {
  switch (fmt) {
    case 'HHMM': return '%H:%M';
    case 'MMSS': return '%M:%S';
    case 'SS': return '%S';
    case 'DATE': return '%a %b %e';
  }
}

function timeBufSize(fmt: TimeFormat): number {
  switch (fmt) {
    case 'HHMM': return 12; // Extra room for HH:MM:SS when showSeconds config is active
    case 'MMSS': return 8;
    case 'SS': return 4;
    case 'DATE': return 16;
  }
}

// ---------------------------------------------------------------------------
// Element classification
// ---------------------------------------------------------------------------

interface CTextElement {
  el: IRElement;
  absX: number;         // absolute X after parent group offsets
  absY: number;         // absolute Y after parent group offsets
  varName: string;      // e.g. "s_tl0"
  bufName: string;      // e.g. "s_tl0_buf"
  bufSize: number;
}

interface CGraphicsElement {
  el: IRElement;
  absX: number;
  absY: number;
}

interface ClassifiedTree {
  bgColor: string;
  textElements: { el: IRElement; isDynamic: boolean; dynamicVar?: CTextElement }[];
  graphicsElements: CGraphicsElement[];
  needsDrawLayer: boolean;
}

/** Shared counter so dynamic var names are unique across branches */
let _dynamicIdx = 0;

function classifyElements(
  elements: IRElement[],
  ir: CompilerIR,
  skipBgDetection = false,
): ClassifiedTree {
  let bgColor = '#000000';
  const textElements: ClassifiedTree['textElements'] = [];
  const graphicsElements: CGraphicsElement[] = [];

  function walk(el: IRElement, isFirst: boolean, offX: number, offY: number) {
    switch (el.type) {
      case 'root':
      case 'group': {
        const gx = offX + el.x;
        const gy = offY + el.y;
        for (let i = 0; i < (el.children ?? []).length; i++) {
          walk(el.children![i]!, isFirst && i === 0, gx, gy);
        }
        break;
      }

      case 'rect': {
        const ax = offX + el.x;
        const ay = offY + el.y;
        if (!skipBgDetection && isFirst && ax === 0 && ay === 0 && el.w >= ir.platform.width && el.h >= ir.platform.height) {
          bgColor = el.fill ?? '#000000';
        } else {
          graphicsElements.push({ el, absX: ax, absY: ay });
        }
        for (const child of el.children ?? []) {
          walk(child, false, offX, offY);
        }
        break;
      }

      case 'text': {
        const ax = offX + el.x;
        const ay = offY + el.y;
        // List slot elements are handled separately by the s_ls[] array —
        // don't allocate dynamic TextLayer vars for them.
        const isDynamic = !!(el.isTimeDynamic || el.isStateDynamic) && !el.isListSlot;
        let dynamicVar: CTextElement | undefined;
        if (isDynamic) {
          const varName = `s_tl${_dynamicIdx}`;
          const bufName = `s_tl${_dynamicIdx}_buf`;
          let bufSize = 32;
          if (el.isTimeDynamic && el.labelIndex !== undefined) {
            const fmt = ir.timeDeps.get(el.labelIndex);
            if (fmt) bufSize = timeBufSize(fmt);
          }
          dynamicVar = { el, absX: ax, absY: ay, varName, bufName, bufSize };
          _dynamicIdx++;
        }
        textElements.push({ el, isDynamic, dynamicVar });
        // Store absolute position on the element for non-dynamic text too
        (el as any)._absX = ax;
        (el as any)._absY = ay;
        break;
      }

      case 'circle':
      case 'line':
      case 'path':
      case 'image':
        graphicsElements.push({ el, absX: offX + el.x, absY: offY + el.y });
        break;
    }
  }

  for (const el of elements) {
    walk(el, true, 0, 0);
  }

  return {
    bgColor,
    textElements,
    graphicsElements,
    needsDrawLayer: graphicsElements.length > 0,
  };
}

interface BranchClassified {
  slotIndex: number;
  branchIndex: number;
  value: unknown;
  isBaseline: boolean;
  layerVar: string;         // e.g. "s_br_s1_v0"
  classified: ClassifiedTree;
}

// ---------------------------------------------------------------------------
// Format expression translation (JS → C)
// ---------------------------------------------------------------------------

function translateFormatExpr(
  expr: string,
  bufVar: string,
  bufSize: number,
  stateSlots: IRStateSlot[],
): { kind: 'snprintf' | 'direct'; code: string } {
  const e = stripThisPrefix(expr);

  // Pattern: s0 ? "A" : "B" (boolean ternary with string literals)
  const ternaryMatch = e.match(/^s(\d+)\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"$/);
  if (ternaryMatch) {
    const [, slotStr, trueVal, falseVal] = ternaryMatch;
    return { kind: 'direct', code: `s${slotStr} ? "${trueVal}" : "${falseVal}"` };
  }

  // Pattern: s0 ? (function(e) { ... elapsed time ... }) : "text"
  // Detected by needsTime flag — handle in caller
  if (e.includes('Math.floor') && e.includes('_startTime_s')) {
    const slotMatch = e.match(/_startTime_s(\d+)/);
    const slot = slotMatch ? slotMatch[1] : '0';
    const falseMatch = e.match(/:\s*"([^"]*)"\s*$/);
    const falseText = falseMatch ? falseMatch[1] : '';
    return {
      kind: 'snprintf',
      code: `if (s${slot}) {\n    int _elapsed = (int)(time(NULL) - _startTime_s${slot});\n    snprintf(${bufVar}, sizeof(${bufVar}), "%02d:%02d", _elapsed / 60, _elapsed % 60);\n  } else {\n    snprintf(${bufVar}, sizeof(${bufVar}), "${falseText}");\n  }`,
    };
  }

  // Pattern: "" + s0 (simple number toString)
  const simpleNumMatch = e.match(/^""\s*\+\s*s(\d+)$/);
  if (simpleNumMatch) {
    const slot = simpleNumMatch[1];
    const slotInfo = stateSlots.find(s => s.index === Number(slot));
    if (slotInfo?.type === 'string') {
      return { kind: 'direct', code: `s${slot}` };
    }
    return { kind: 'snprintf', code: `snprintf(${bufVar}, sizeof(${bufVar}), "%d", s${slot})` };
  }

  // Pattern: "prefix" + (s0 + N) + "suffix" or "prefix" + s0 + "suffix"
  const concatMatch = e.match(/^(?:"([^"]*)" \+ )?(?:\(s(\d+) \+ (\d+)\)|s(\d+))(?:\s*\+\s*"([^"]*)")?$/);
  if (concatMatch) {
    const [, prefix, slotPlus, offset, slotDirect, suffix] = concatMatch;
    const slot = slotPlus ?? slotDirect;
    const hasOffset = slotPlus !== undefined;
    const fmtParts: string[] = [];
    const args: string[] = [];
    if (prefix) fmtParts.push(prefix);
    fmtParts.push('%d');
    args.push(hasOffset ? `s${slot} + ${offset}` : `s${slot}`);
    if (suffix) fmtParts.push(suffix);
    return { kind: 'snprintf', code: `snprintf(${bufVar}, sizeof(${bufVar}), "${fmtParts.join('')}", ${args.join(', ')})` };
  }

  // General concatenation: split on " + " and handle each segment
  // Handles patterns like: "prefix" + (s0 + 1) + "-" + MIN(s0 + 6, 12) + "/suffix"
  const segments = e.split(/\s*\+\s*(?=["(sMm])/);
  if (segments.length > 1) {
    const fmtParts: string[] = [];
    const args: string[] = [];
    let valid = true;
    for (const seg of segments) {
      const trimmed = seg.trim();
      // String literal: "..."
      const strMatch = trimmed.match(/^"([^"]*)"$/);
      if (strMatch) { fmtParts.push(strMatch[1]!.replace(/%/g, '%%')); continue; }
      // (sN + offset)
      const slotOffMatch = trimmed.match(/^\(s(\d+)\s*\+\s*(\d+)\)$/);
      if (slotOffMatch) { fmtParts.push('%d'); args.push(`s${slotOffMatch[1]} + ${slotOffMatch[2]}`); continue; }
      // sN
      const slotMatch = trimmed.match(/^s(\d+)$/);
      if (slotMatch) { fmtParts.push('%d'); args.push(`s${slotMatch[1]}`); continue; }
      // MIN(sN + offset, max) or MIN(sN, max)
      const minMatch = trimmed.match(/^MIN\(s(\d+)(?:\s*\+\s*(\d+))?,\s*(\d+)\)$/);
      if (minMatch) {
        const sExpr = minMatch[2] ? `s${minMatch[1]} + ${minMatch[2]}` : `s${minMatch[1]}`;
        fmtParts.push('%d');
        args.push(`(${sExpr}) < ${minMatch[3]} ? (${sExpr}) : ${minMatch[3]}`);
        continue;
      }
      valid = false;
      break;
    }
    if (valid && args.length > 0) {
      return { kind: 'snprintf', code: `snprintf(${bufVar}, sizeof(${bufVar}), "${fmtParts.join('')}", ${args.join(', ')})` };
    }
  }

  // Fallback: emit as snprintf with %d
  const slotRef = e.match(/s(\d+)/);
  if (slotRef) {
    return { kind: 'snprintf', code: `snprintf(${bufVar}, sizeof(${bufVar}), "%d", s${slotRef[1]})` };
  }

  return { kind: 'snprintf', code: `snprintf(${bufVar}, sizeof(${bufVar}), "?")` };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function emitC(ir: CompilerIR): string {
  _dynamicIdx = 0; // Reset counter

  // Classify elements — either per-branch or single tree
  const branchClassifieds: BranchClassified[] = [];
  let mainClassified: ClassifiedTree;

  if (ir.hasBranches && ir.branches.size > 0) {
    // Use the first branch's baseline for bg color detection
    const firstBranches = [...ir.branches.values()][0]!;
    const baselineBranch = firstBranches.find(b => b.isBaseline);
    mainClassified = classifyElements(baselineBranch?.tree ?? ir.tree, ir);

    // Classify each branch separately
    for (const [si, branchList] of ir.branches) {
      for (let bi = 0; bi < branchList.length; bi++) {
        const branch = branchList[bi]!;
        const classified = classifyElements(branch.tree, ir, true); // skip bg detection
        branchClassifieds.push({
          slotIndex: si,
          branchIndex: bi,
          value: branch.value,
          isBaseline: branch.isBaseline,
          layerVar: `s_br_s${si}_v${bi}`,
          classified,
        });
      }
    }
  } else {
    mainClassified = classifyElements(ir.tree, ir);
  }

  // Merge all classified trees for global declarations
  const allClassifieds = branchClassifieds.length > 0
    ? branchClassifieds.map(b => b.classified)
    : [mainClassified];
  const allTextElements = allClassifieds.flatMap(c => c.textElements);
  const allGraphicsElements = allClassifieds.flatMap(c => c.graphicsElements);
  const needsDrawLayer = allGraphicsElements.length > 0;

  const classified = mainClassified;
  const lines: string[] = [];

  const hasBehavior = ir.hasTimeDeps || ir.hasStateDeps || ir.hasButtons ||
    ir.hasBranches || ir.hasSkinDeps || ir.hasList || ir.hasConditionals;
  const needsTick = ir.hasTimeDeps;
  const hasSeconds = [...ir.timeDeps.values()].some(fmt => fmt === 'SS' || fmt === 'MMSS') || ir.hasAnimatedElements || ir.timeReactiveGraphics.length > 0;

  // =========================================================================
  // Header
  // =========================================================================

  const hasConfig = ir.configInfo !== null && ir.configInfo.keys.length > 0;

  lines.push('// Auto-generated by react-pebble (C SDK backend for classic Pebble)');
  lines.push(`// Target: ${ir.platform.name} (${ir.platform.width}x${ir.platform.height})`);
  lines.push('');
  lines.push('#include <pebble.h>');
  lines.push('');

  // =========================================================================
  // Configuration settings (if useConfiguration detected)
  // =========================================================================

  if (hasConfig) {
    const cfg = ir.configInfo!;
    lines.push('#define SETTINGS_KEY 1');
    lines.push('');
    lines.push('// MESSAGE_KEY_* constants are auto-generated by the Pebble SDK');
    lines.push('// from the "messageKeys" array in package.json.');
    lines.push('');

    // Settings struct
    lines.push('typedef struct ClaySettings {');
    for (const k of cfg.keys) {
      switch (k.type) {
        case 'color':
          lines.push(`  GColor ${k.key};`);
          break;
        case 'boolean':
          lines.push(`  bool ${k.key};`);
          break;
        case 'string':
          lines.push(`  char ${k.key}[64];`);
          break;
      }
    }
    lines.push('} ClaySettings;');
    lines.push('');
    lines.push('static ClaySettings settings;');
    lines.push('');

    // Default settings function
    lines.push('static void prv_default_settings(void) {');
    for (const k of cfg.keys) {
      switch (k.type) {
        case 'color':
          lines.push(`  settings.${k.key} = GColorFromHEX(0x${k.default});`);
          break;
        case 'boolean':
          lines.push(`  settings.${k.key} = ${k.default ? 'true' : 'false'};`);
          break;
        case 'string':
          lines.push(`  strncpy(settings.${k.key}, "${String(k.default).replace(/"/g, '\\"')}", sizeof(settings.${k.key}) - 1);`);
          break;
      }
    }
    lines.push('}');
    lines.push('');

    // Save/load settings
    lines.push('static void prv_save_settings(void) {');
    lines.push('  persist_write_data(SETTINGS_KEY, &settings, sizeof(settings));');
    lines.push('}');
    lines.push('');
    lines.push('static void prv_load_settings(void) {');
    lines.push('  prv_default_settings();');
    lines.push('  persist_read_data(SETTINGS_KEY, &settings, sizeof(settings));');
    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // Static globals
  // =========================================================================

  lines.push('static Window *s_window;');
  if (needsDrawLayer) {
    lines.push('static Layer *s_draw_layer;');
  }
  // Branch parent layers
  for (const bc of branchClassifieds) {
    lines.push(`static Layer *${bc.layerVar};`);
  }

  // Animated image resources — walk the IR to find APNG / PDC-sequence
  // declarations. Each declares a sequence + a reusable frame bitmap and a
  // repeating timer that advances to the next frame and redraws.
  interface AnimatedImageC {
    resName: string;
    format: 'apng' | 'pdcs';
    loop: boolean;
    el: IRElement;
  }
  const animatedImages: AnimatedImageC[] = [];
  const seenAnimResNames = new Set<string>();
  function collectAnimated(el: IRElement): void {
    if (el.type === 'image' && el.animated && el.src) {
      const resName = el.src.replace(/^.*\//, '').replace(/\.[^.]+$/, '').toUpperCase();
      if (!seenAnimResNames.has(resName)) {
        seenAnimResNames.add(resName);
        animatedImages.push({
          resName,
          format: el.animated,
          loop: el.animLoop !== false,
          el,
        });
      }
    }
    for (const c of el.children ?? []) collectAnimated(c);
  }
  for (const el of ir.tree) collectAnimated(el);

  // Image bitmaps — exclude animated sources (they live in s_seq_* / s_seqframe_*)
  const imageResNames: string[] = [];
  for (const src of ir.imageResources) {
    const resName = src.replace(/^.*\//, '').replace(/\.[^.]+$/, '').toUpperCase();
    if (seenAnimResNames.has(resName)) continue;
    if (!imageResNames.includes(resName)) {
      imageResNames.push(resName);
      lines.push(`static GBitmap *s_img_${resName.toLowerCase()};`);
    }
  }
  lines.push('');

  for (const ai of animatedImages) {
    const lower = ai.resName.toLowerCase();
    if (ai.format === 'apng') {
      lines.push(`static GBitmapSequence *s_seq_${lower};`);
      lines.push(`static GBitmap *s_seqframe_${lower};`);
    } else {
      lines.push(`static GDrawCommandSequence *s_seq_${lower};`);
      lines.push(`static uint32_t s_seqframe_${lower}_idx;`);
    }
    lines.push(`static AppTimer *s_seqtimer_${lower};`);
  }
  if (animatedImages.length > 0) lines.push('');

  // Custom font resources — any `font="NAME"` value that doesn't match
  // FONT_TO_C is treated as a user-declared TTF resource loaded via
  // `fonts_load_custom_font(resource_get_handle(RESOURCE_ID_NAME))`.
  const customFontNames = new Set<string>();
  function collectFonts(el: IRElement): void {
    if (el.type === 'text' || el.type === 'textflow') {
      if (el.font && !isSystemFontC(el.font)) {
        customFontNames.add(el.font);
      }
    }
    for (const c of el.children ?? []) collectFonts(c);
  }
  for (const el of ir.tree) collectFonts(el);
  for (const fname of customFontNames) {
    lines.push(`static GFont s_font_${fname.toLowerCase()};`);
  }
  if (customFontNames.size > 0) lines.push('');

  // Forward declarations for per-resource advance callbacks.
  for (const ai of animatedImages) {
    lines.push(`static void _seq_advance_${ai.resName.toLowerCase()}(void *data);`);
  }
  if (animatedImages.length > 0) lines.push('');

  // State variables
  for (const slot of ir.stateSlots) {
    const v = slot.initialValue;
    if (v instanceof Date || (typeof v === 'object' && v !== null && !(Array.isArray(v)))) continue;
    switch (slot.type) {
      case 'number':
        lines.push(`static int s${slot.index} = ${v};`);
        break;
      case 'boolean':
        lines.push(`static bool s${slot.index} = ${v ? 'true' : 'false'};`);
        break;
      case 'string':
        lines.push(`static char s${slot.index}[64] = "${String(v).replace(/"/g, '\\"')}";`);
        break;
      default:
        lines.push(`static int s${slot.index} = 0;`);
    }
  }

  // Elapsed time markers
  for (const [, dep] of ir.stateDeps) {
    if (dep.needsTime) {
      lines.push(`static time_t _startTime_s${dep.slotIndex} = 0;`);
    }
  }

  if (ir.stateSlots.length > 0) lines.push('');

  // Dynamic TextLayer globals and buffers
  for (const te of allTextElements) {
    if (te.isDynamic && te.dynamicVar) {
      const dv = te.dynamicVar;
      lines.push(`static TextLayer *${dv.varName};`);
      lines.push(`static char ${dv.bufName}[${dv.bufSize}];`);
    }
  }

  // List TextLayer array
  if (ir.hasList && ir.listInfo) {
    const count = ir.listInfo.visibleCount * ir.listInfo.labelsPerItem;
    lines.push(`static TextLayer *s_ls[${count}];`);
    lines.push(`static char s_ls_buf[${count}][32];`);
  }

  // Data arrays for lists
  if (ir.hasList && !ir.messageInfo && ir.listInfo) {
    const li = ir.listInfo;
    if (li.dataArrayValues) {
      lines.push(`static const char *_data[] = {${li.dataArrayValues.map(v => `"${v}"`).join(', ')}};`);
      lines.push(`static int _data_len = ${li.dataArrayValues.length};`);
    } else if (li.dataArrayObjects) {
      // For object arrays, flatten to per-property arrays
      const props = li.propertyOrder ?? Object.keys(li.dataArrayObjects[0] ?? {});
      for (const prop of props) {
        const vals = li.dataArrayObjects.map(o => `"${(o[prop] ?? '').replace(/"/g, '\\"')}"`);
        lines.push(`static const char *_data_${prop}[] = {${vals.join(', ')}};`);
      }
      lines.push(`static int _data_len = ${li.dataArrayObjects.length};`);
    }
  }
  if (ir.messageInfo) {
    lines.push('static char _msg_buf[512];');
    lines.push('static int _data_len = 0;');
  }

  // Keyframe arrays
  if (ir.hasAnimatedElements) {
    for (const ae of ir.animatedElements) {
      lines.push(`static const int16_t _kf_e${ae.elemIndex}_${ae.prop}[] = {${ae.keyframes.join(',')}};`);
    }
  }

  // GPath declarations for path elements
  const pathElements = allGraphicsElements.filter(ge => ge.el.type === 'path' && ge.el.points);
  for (let i = 0; i < pathElements.length; i++) {
    const pe = pathElements[i]!;
    const pts = pe.el.points!;
    const pointsStr = pts.map(([px, py]) => `{${px}, ${py}}`).join(', ');
    lines.push(`static const GPathInfo s_path${i}_info = {`);
    lines.push(`  .num_points = ${pts.length},`);
    lines.push(`  .points = (GPoint[]) { ${pointsStr} }`);
    lines.push(`};`);
    lines.push(`static GPath *s_path${i};`);
  }

  const hasTimeReactiveGraphics = ir.timeReactiveGraphics.length > 0;

  // Config TextLayer array (must be global, before window_load)
  if (hasConfig) {
    const staticTextCount = allTextElements.filter(te => !te.isDynamic).length;
    if (staticTextCount > 0) {
      lines.push(`static TextLayer *s_cfg_tl[${staticTextCount}];`);
    }
  }

  lines.push('');

  // =========================================================================
  // Animated sequence advance callbacks (APNG / PDC-sequence)
  // =========================================================================

  for (const ai of animatedImages) {
    const lower = ai.resName.toLowerCase();
    lines.push(`static void _seq_advance_${lower}(void *data) {`);
    if (ai.format === 'apng') {
      lines.push(`  if (!s_seq_${lower} || !s_seqframe_${lower}) return;`);
      lines.push(`  uint32_t delay_ms = 0;`);
      lines.push(`  bool has_next = gbitmap_sequence_update_bitmap_next_frame(s_seq_${lower}, s_seqframe_${lower}, &delay_ms);`);
      if (needsDrawLayer) {
        lines.push(`  if (s_draw_layer) layer_mark_dirty(s_draw_layer);`);
      }
      lines.push(`  if (has_next && delay_ms > 0) {`);
      lines.push(`    s_seqtimer_${lower} = app_timer_register(delay_ms, _seq_advance_${lower}, NULL);`);
      lines.push(`  } else {`);
      lines.push(`    s_seqtimer_${lower} = NULL;`);
      lines.push(`  }`);
    } else {
      lines.push(`  if (!s_seq_${lower}) return;`);
      lines.push(`  uint32_t nframes = gdraw_command_sequence_get_num_frames(s_seq_${lower});`);
      lines.push(`  if (nframes == 0) return;`);
      const step = ai.loop ? '(s_seqframe_' + lower + '_idx + 1) % nframes' : '(s_seqframe_' + lower + '_idx + 1 < nframes ? s_seqframe_' + lower + '_idx + 1 : nframes - 1)';
      lines.push(`  s_seqframe_${lower}_idx = ${step};`);
      const delay = Math.round(1000 / (ai.el.animFps && ai.el.animFps > 0 ? ai.el.animFps : 10));
      if (needsDrawLayer) {
        lines.push(`  if (s_draw_layer) layer_mark_dirty(s_draw_layer);`);
      }
      lines.push(`  s_seqtimer_${lower} = app_timer_register(${delay}, _seq_advance_${lower}, NULL);`);
    }
    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // draw_proc (custom drawing for rects, circles, lines)
  // =========================================================================

  if (needsDrawLayer) {
    lines.push('static void draw_proc(Layer *layer, GContext *ctx) {');

    // If we have time-reactive graphics, get current time at the top
    if (hasTimeReactiveGraphics) {
      lines.push('  time_t now = time(NULL);');
      lines.push('  struct tm *t = localtime(&now);');
      lines.push('');
    }

    if (branchClassifieds.length > 0) {
      // Draw graphics conditionally per branch
      for (const bc of branchClassifieds) {
        if (bc.classified.graphicsElements.length === 0) continue;
        const slotInfo = ir.stateSlots.find(s => s.index === bc.slotIndex);
        const cond = slotInfo?.type === 'string'
          ? `strcmp(s${bc.slotIndex}, "${bc.value}") == 0`
          : `s${bc.slotIndex} == ${JSON.stringify(bc.value)}`;
        lines.push(`  if (${cond}) {`);
        for (const ge of bc.classified.graphicsElements) {
          emitGraphicsDrawCall(ge, lines, '    ', ir, pathElements);
        }
        lines.push('  }');
      }
    } else {
      for (const ge of mainClassified.graphicsElements) {
        // If config has boolean visibility keys, wrap matching graphics in conditionals
        if (hasConfig) {
          const elColor = (ge.el.fill ?? ge.el.color ?? '').toLowerCase();
          // Find a boolean show* key whose related color key has this default
          let wrappedInIf = false;
          for (const boolKey of ir.configInfo!.keys.filter(k => k.type === 'boolean' && /show|display|enable|visible/i.test(k.key))) {
            // Find the domain: "showDate" → "date"
            const domain = boolKey.key.replace(/^(show|display|enable|visible)/i, '').toLowerCase();
            if (!domain) continue;
            // Find a color key with this domain in its name
            const relatedColorKey = ir.configInfo!.keys.find(
              k => k.type === 'color' && k.key.toLowerCase().includes(domain)
            );
            if (relatedColorKey && elColor === '#' + String(relatedColorKey.default).toLowerCase()) {
              lines.push(`  if (settings.${boolKey.key}) {`);
              emitGraphicsDrawCall(ge, lines, '    ', ir, pathElements);
              lines.push(`  }`);
              wrappedInIf = true;
              break;
            }
          }
          if (!wrappedInIf) {
            emitGraphicsDrawCall(ge, lines, '  ', ir, pathElements);
          }
        } else {
          emitGraphicsDrawCall(ge, lines, '  ', ir, pathElements);
        }
      }
    }

    // Emit time-reactive graphics after static elements
    if (hasTimeReactiveGraphics) {
      lines.push('');
      lines.push('  // Time-reactive graphics');
      for (const trg of ir.timeReactiveGraphics) {
        emitTimeReactiveGraphic(trg, lines, '  ', ir, pathElements, allGraphicsElements);
      }
    }

    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // refresh()
  // =========================================================================

  if (hasBehavior) {
    lines.push('static void refresh(void) {');

    // Time-dependent labels
    if (needsTick) {
      lines.push('  time_t now = time(NULL);');
      lines.push('  struct tm *t = localtime(&now);');
    }
    for (const [idx, fmt] of ir.timeDeps) {
      const te = allTextElements.find(t => t.el.labelIndex === idx && t.dynamicVar);
      if (te?.dynamicVar) {
        const dv = te.dynamicVar;

        // If there's a showSeconds config key and this is an HHMM format, make it conditional
        const showSecondsKey = hasConfig ? ir.configInfo!.keys.find(
          k => k.type === 'boolean' && k.key.toLowerCase().includes('second')
        ) : null;

        if (fmt === 'HHMM' && showSecondsKey) {
          lines.push(`  if (settings.${showSecondsKey.key}) {`);
          lines.push(`    strftime(${dv.bufName}, sizeof(${dv.bufName}), "%H:%M:%S", t);`);
          lines.push(`  } else {`);
          lines.push(`    strftime(${dv.bufName}, sizeof(${dv.bufName}), "%H:%M", t);`);
          lines.push(`  }`);
        } else {
          lines.push(`  strftime(${dv.bufName}, sizeof(${dv.bufName}), "${timeFormatToStrftime(fmt)}", t);`);
        }
        lines.push(`  text_layer_set_text(${dv.varName}, ${dv.bufName});`);
      }
    }

    // State-dependent labels — skip when branches are active, since branch
    // visibility toggling handles the visual changes. Without branches,
    // update labels normally.
    if (branchClassifieds.length === 0) {
      for (const [idx, dep] of ir.stateDeps) {
        const te = allTextElements.find(t => t.el.labelIndex === idx && t.dynamicVar);
        if (te?.dynamicVar) {
          const dv = te.dynamicVar;
          const translated = translateFormatExpr(dep.formatExpr, dv.bufName, dv.bufSize, ir.stateSlots);
          if (translated.kind === 'snprintf') {
            lines.push(`  ${translated.code};`);
            if (translated.code.includes('snprintf(')) {
              lines.push(`  text_layer_set_text(${dv.varName}, ${dv.bufName});`);
            }
          } else {
            lines.push(`  text_layer_set_text(${dv.varName}, ${translated.code});`);
          }
        }
      }
    }

    // Skin-dependent rects or time-reactive graphics (trigger redraw of custom layer)
    if ((ir.hasSkinDeps || hasTimeReactiveGraphics) && needsDrawLayer) {
      lines.push('  layer_mark_dirty(s_draw_layer);');
    }

    // Branch visibility toggling
    for (const bc of branchClassifieds) {
      const slotInfo = ir.stateSlots.find(s => s.index === bc.slotIndex);
      const cond = slotInfo?.type === 'string'
        ? `strcmp(s${bc.slotIndex}, "${bc.value}") == 0`
        : slotInfo?.type === 'boolean'
          ? (bc.value ? `s${bc.slotIndex}` : `!s${bc.slotIndex}`)
          : `s${bc.slotIndex} == ${JSON.stringify(bc.value)}`;
      lines.push(`  layer_set_hidden(${bc.layerVar}, !(${cond}));`);
    }

    // Redraw graphics if branches have graphics
    if (branchClassifieds.some(bc => bc.classified.graphicsElements.length > 0) && needsDrawLayer) {
      lines.push('  layer_mark_dirty(s_draw_layer);');
    }

    // List scroll updates
    if (ir.hasList && ir.listInfo && ir.listInfo.scrollSlotIndex >= 0) {
      const li = ir.listInfo;
      const lpi = li.labelsPerItem;
      lines.push(`  int _start = s${li.scrollSlotIndex};`);
      lines.push(`  for (int _i = 0; _i < ${li.visibleCount}; _i++) {`);
      lines.push(`    int _idx = _start + _i;`);
      if (lpi > 1 && li.propertyOrder) {
        for (let j = 0; j < lpi; j++) {
          const prop = li.propertyOrder[j]!;
          const lsIdx = `_i * ${lpi} + ${j}`;
          lines.push(`    if (_idx < _data_len) {`);
          lines.push(`      snprintf(s_ls_buf[${lsIdx}], sizeof(s_ls_buf[${lsIdx}]), "%s", _data_${prop}[_idx]);`);
          lines.push(`    } else {`);
          lines.push(`      s_ls_buf[${lsIdx}][0] = '\\0';`);
          lines.push(`    }`);
          lines.push(`    text_layer_set_text(s_ls[${lsIdx}], s_ls_buf[${lsIdx}]);`);
        }
      } else {
        lines.push(`    if (_idx < _data_len) {`);
        lines.push(`      snprintf(s_ls_buf[_i], sizeof(s_ls_buf[_i]), "%s", _data[_idx]);`);
        lines.push(`    } else {`);
        lines.push(`      s_ls_buf[_i][0] = '\\0';`);
        lines.push(`    }`);
        lines.push(`    text_layer_set_text(s_ls[_i], s_ls_buf[_i]);`);
      }
      lines.push('  }');
    }

    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // Button handlers
  // =========================================================================

  if (ir.hasButtons) {
    // Group by button name
    const byButton = new Map<string, typeof ir.buttonActions[0]>();
    for (const ba of ir.buttonActions) {
      byButton.set(ba.button, ba);
    }

    for (const [button, ba] of byButton) {
      if (button === 'back') continue; // handled separately below
      const handlerName = `${button}_handler`;
      lines.push(`static void ${handlerName}(ClickRecognizerRef ref, void *ctx) {`);

      const { action } = ba;
      const isListScroll = ir.hasList && ir.listInfo && action.slotIndex === ir.listInfo.scrollSlotIndex;

      switch (action.type) {
        case 'increment':
          lines.push(`  s${action.slotIndex} += ${action.value};`);
          if (isListScroll) {
            lines.push(`  if (s${action.slotIndex} > _data_len - ${ir.listInfo!.visibleCount}) s${action.slotIndex} = _data_len - ${ir.listInfo!.visibleCount};`);
          }
          break;
        case 'decrement':
          lines.push(`  s${action.slotIndex} -= ${action.value};`);
          if (isListScroll) {
            lines.push(`  if (s${action.slotIndex} < 0) s${action.slotIndex} = 0;`);
          }
          break;
        case 'reset':
          lines.push(`  s${action.slotIndex} = ${action.value};`);
          break;
        case 'toggle': {
          lines.push(`  s${action.slotIndex} = !s${action.slotIndex};`);
          const needsElapsed = [...ir.stateDeps.values()].some(d => d.slotIndex === action.slotIndex && d.needsTime);
          if (needsElapsed) {
            lines.push(`  if (s${action.slotIndex}) _startTime_s${action.slotIndex} = time(NULL);`);
          }
          break;
        }
        case 'set_string':
          lines.push(`  strncpy(s${action.slotIndex}, "${action.stringValue}", sizeof(s${action.slotIndex}) - 1);`);
          break;
      }

      lines.push('  refresh();');
      lines.push('}');
      lines.push('');
    }

    // Back button handler — if the app binds back, use that action but
    // fall through to window_stack_pop when already at the default state.
    // If the app doesn't bind back, just quit.
    const backBinding = byButton.get('back');
    lines.push('static void back_handler(ClickRecognizerRef ref, void *ctx) {');
    if (backBinding) {
      const { action } = backBinding;
      // Find the baseline value for this slot
      const slot = ir.stateSlots.find(s => s.index === action.slotIndex);
      const baselineValue = slot?.initialValue;
      const isBaseline = slot?.type === 'string'
        ? `strcmp(s${action.slotIndex}, "${baselineValue}") == 0`
        : `s${action.slotIndex} == ${JSON.stringify(baselineValue)}`;

      lines.push(`  if (${isBaseline}) {`);
      lines.push('    window_stack_pop(true);');
      lines.push('  } else {');
      switch (action.type) {
        case 'set_string':
          lines.push(`    strncpy(s${action.slotIndex}, "${action.stringValue}", sizeof(s${action.slotIndex}) - 1);`);
          break;
        case 'reset':
          lines.push(`    s${action.slotIndex} = ${action.value};`);
          break;
        case 'toggle':
          lines.push(`    s${action.slotIndex} = !s${action.slotIndex};`);
          break;
        default:
          lines.push(`    s${action.slotIndex} = ${JSON.stringify(baselineValue)};`);
      }
      lines.push('    refresh();');
      lines.push('  }');
    } else {
      lines.push('  window_stack_pop(true);');
    }
    lines.push('}');
    lines.push('');

    // click_config_provider
    lines.push('static void click_config(void *ctx) {');
    for (const [button] of byButton) {
      if (button === 'back') continue;
      const buttonId = BUTTON_MAP[button] ?? 'BUTTON_ID_SELECT';
      lines.push(`  window_single_click_subscribe(${buttonId}, ${button}_handler);`);
    }
    // Always subscribe back button
    lines.push('  window_single_click_subscribe(BUTTON_ID_BACK, back_handler);');
    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // tick_handler
  // =========================================================================

  if (needsTick) {
    lines.push('static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {');
    lines.push('  refresh();');
    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // inbox_received (AppMessage)
  // =========================================================================

  if (ir.messageInfo) {
    lines.push('static void inbox_received(DictionaryIterator *iter, void *ctx) {');
    lines.push(`  Tuple *t = dict_find(iter, MESSAGE_KEY_${ir.messageInfo.key});`);
    lines.push('  if (t && t->value->cstring) {');
    lines.push('    strncpy(_msg_buf, t->value->cstring, sizeof(_msg_buf) - 1);');
    lines.push('    // TODO: parse _msg_buf JSON and populate data');
    lines.push('    refresh();');
    lines.push('  }');
    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // Configuration: update UI + inbox handler (before window_load)
  // =========================================================================

  if (hasConfig) {
    const cfg = ir.configInfo!;

    // Forward declare refresh (only if not yet emitted)
    if (!hasBehavior) {
      lines.push('static void refresh(void) {}');
    }
    lines.push('');

    // prv_update_config — applies settings to UI
    lines.push('static void prv_update_config(void) {');

    const bgColorKey = cfg.keys.find(k => k.type === 'color' && /bg|background/i.test(k.key));
    if (bgColorKey) {
      lines.push(`  window_set_background_color(s_window, settings.${bgColorKey.key});`);
    }

    let cfgTlIdx = 0;
    for (const te of allTextElements) {
      if (te.isDynamic) continue;
      const color = te.el.color ?? '#ffffff';
      const matchingColorKey = cfg.keys.find(k => {
        if (k.type !== 'color') return false;
        return color.toLowerCase() === '#' + String(k.default).toLowerCase();
      });
      if (matchingColorKey) {
        lines.push(`  text_layer_set_text_color(s_cfg_tl[${cfgTlIdx}], settings.${matchingColorKey.key});`);
      }
      const text = te.el.text ?? '';
      const matchingStringKey = cfg.keys.find(k => k.type === 'string' && String(k.default) === text);
      if (matchingStringKey) {
        lines.push(`  text_layer_set_text(s_cfg_tl[${cfgTlIdx}], settings.${matchingStringKey.key});`);
      }
      cfgTlIdx++;
    }

    for (const te of allTextElements) {
      if (!te.isDynamic || !te.dynamicVar) continue;
      const color = te.el.color ?? '#ffffff';
      const matchingColorKey = cfg.keys.find(k => {
        if (k.type !== 'color') return false;
        return color.toLowerCase() === '#' + String(k.default).toLowerCase();
      });
      if (matchingColorKey) {
        lines.push(`  text_layer_set_text_color(${te.dynamicVar.varName}, settings.${matchingColorKey.key});`);
      }
    }

    // Boolean visibility toggles: showDate, showSeconds, etc.
    // Match "show<X>" booleans to TextLayers by time format or color relationship
    for (const boolKey of cfg.keys.filter(k => k.type === 'boolean')) {
      const keyLower = boolKey.key.toLowerCase();

      if (keyLower.includes('date')) {
        // Toggle date TextLayer(s) visibility
        for (const te of allTextElements) {
          if (!te.isDynamic || !te.dynamicVar) continue;
          const fmt = te.el.labelIndex !== undefined ? ir.timeDeps.get(te.el.labelIndex) : undefined;
          if (fmt === 'DATE') {
            lines.push(`  layer_set_hidden(text_layer_get_layer(${te.dynamicVar.varName}), !settings.${boolKey.key});`);
          }
        }
      }

      if (keyLower.includes('second')) {
        // showSeconds: switch time format and font to fit HH:MM:SS on screen
        for (const te of allTextElements) {
          if (!te.isDynamic || !te.dynamicVar) continue;
          const fmt = te.el.labelIndex !== undefined ? ir.timeDeps.get(te.el.labelIndex) : undefined;
          if (fmt === 'HHMM') {
            const originalFont = fontToC(te.el.font);
            // Pick a smaller font that fits "HH:MM:SS" on a basalt-width screen
            // Bitham 42 Bold → Bitham 34 Medium Numbers; other large fonts scale down similarly
            const smallerFont = originalFont.includes('42') ? 'FONT_KEY_BITHAM_34_MEDIUM_NUMBERS'
              : originalFont.includes('30') ? 'FONT_KEY_GOTHIC_28_BOLD'
              : originalFont;
            lines.push(`  // showSeconds toggle`);
            lines.push(`  if (settings.${boolKey.key}) {`);
            lines.push(`    text_layer_set_font(${te.dynamicVar.varName}, fonts_get_system_font(${smallerFont}));`);
            lines.push(`  } else {`);
            lines.push(`    text_layer_set_font(${te.dynamicVar.varName}, fonts_get_system_font(${originalFont}));`);
            lines.push(`  }`);
          }
        }
      }
    }

    if (needsDrawLayer) {
      lines.push('  layer_mark_dirty(s_draw_layer);');
    }
    lines.push('  refresh();');
    lines.push('}');
    lines.push('');

    // inbox_received_handler
    lines.push('static void prv_inbox_received(DictionaryIterator *iter, void *ctx) {');
    for (const k of cfg.keys) {
      lines.push(`  Tuple *${k.key}_t = dict_find(iter, MESSAGE_KEY_${k.key});`);
      switch (k.type) {
        case 'color':
          lines.push(`  if (${k.key}_t) settings.${k.key} = GColorFromHEX(${k.key}_t->value->int32);`);
          break;
        case 'boolean':
          lines.push(`  if (${k.key}_t) settings.${k.key} = ${k.key}_t->value->int32 == 1;`);
          break;
        case 'string':
          lines.push(`  if (${k.key}_t) strncpy(settings.${k.key}, ${k.key}_t->value->cstring, sizeof(settings.${k.key}) - 1);`);
          break;
      }
    }
    lines.push('  prv_save_settings();');
    lines.push('  prv_update_config();');
    lines.push('}');
    lines.push('');
  }

  // =========================================================================
  // window_load
  // =========================================================================

  lines.push('static void window_load(Window *window) {');
  lines.push('  Layer *root = window_get_root_layer(window);');
  lines.push(`  window_set_background_color(window, ${colorToGColor(classified.bgColor)});`);
  lines.push('');

  // Custom draw layer
  if (needsDrawLayer) {
    lines.push(`  s_draw_layer = layer_create(GRect(0, 0, ${ir.platform.width}, ${ir.platform.height}));`);
    lines.push('  layer_set_update_proc(s_draw_layer, draw_proc);');
    lines.push('  layer_add_child(root, s_draw_layer);');
    lines.push('');
  }

  // Create GPath objects
  for (let i = 0; i < pathElements.length; i++) {
    const pe = pathElements[i]!;
    lines.push(`  s_path${i} = gpath_create(&s_path${i}_info);`);
    lines.push(`  gpath_move_to(s_path${i}, GPoint(${pe.absX}, ${pe.absY}));`);
  }
  if (pathElements.length > 0) lines.push('');

  // Load image resources
  for (const resName of imageResNames) {
    const varName = `s_img_${resName.toLowerCase()}`;
    lines.push(`  ${varName} = gbitmap_create_with_resource(RESOURCE_ID_${resName});`);
  }
  if (imageResNames.length > 0) lines.push('');

  // Load custom fonts
  for (const fname of customFontNames) {
    lines.push(`  s_font_${fname.toLowerCase()} = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_${fname.toUpperCase()}));`);
  }
  if (customFontNames.size > 0) lines.push('');

  // Load animated sequence resources and start their advance timers.
  for (const ai of animatedImages) {
    const lower = ai.resName.toLowerCase();
    if (ai.format === 'apng') {
      lines.push(`  s_seq_${lower} = gbitmap_sequence_create_with_resource(RESOURCE_ID_${ai.resName});`);
      lines.push(`  if (s_seq_${lower}) {`);
      lines.push(`    GSize _sz = gbitmap_sequence_get_bitmap_size(s_seq_${lower});`);
      lines.push(`    s_seqframe_${lower} = gbitmap_create_blank(_sz, GBitmapFormat8Bit);`);
      lines.push(`    gbitmap_sequence_set_play_count(s_seq_${lower}, ${ai.loop ? 'PLAY_COUNT_INFINITE' : '1'});`);
      lines.push(`    _seq_advance_${lower}(NULL);`);
      lines.push(`  }`);
    } else {
      lines.push(`  s_seq_${lower} = gdraw_command_sequence_create_with_resource(RESOURCE_ID_${ai.resName});`);
      lines.push(`  s_seqframe_${lower}_idx = 0;`);
      lines.push(`  if (s_seq_${lower}) {`);
      lines.push(`    _seq_advance_${lower}(NULL);`);
      lines.push(`  }`);
    }
  }
  if (animatedImages.length > 0) lines.push('');

  // Helper to emit text layer creation
  function emitTextLayerCreate(te: typeof allTextElements[0], parentVar: string) {
    const el = te.el;
    if (el.isListSlot) return;

    // Use absolute position (accounting for parent group offsets)
    const ax = te.dynamicVar?.absX ?? (el as any)._absX ?? el.x;
    const ay = te.dynamicVar?.absY ?? (el as any)._absY ?? el.y;

    // Clamp width to screen — components may use emery (200px) dimensions
    const rawW = el.w > 0 ? el.w : ir.platform.width;
    const w = clampW(ax, rawW, ir.platform.width);
    const h = 50;
    const fontExpr = fontExprC(el.font);
    const color = colorToGColor(el.color ?? '#ffffff');
    const align = alignToC(el.align);
    const text = (el.text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    if (te.isDynamic && te.dynamicVar) {
      const dv = te.dynamicVar;
      lines.push(`  ${dv.varName} = text_layer_create(GRect(${ax}, ${ay}, ${w}, ${h}));`);
      lines.push(`  text_layer_set_background_color(${dv.varName}, GColorClear);`);
      lines.push(`  text_layer_set_text_color(${dv.varName}, ${color});`);
      lines.push(`  text_layer_set_font(${dv.varName}, ${fontExpr});`);
      if (align !== 'GTextAlignmentLeft') {
        lines.push(`  text_layer_set_text_alignment(${dv.varName}, ${align});`);
      }
      lines.push(`  layer_add_child(${parentVar}, text_layer_get_layer(${dv.varName}));`);
    } else if (hasConfig) {
      // Config mode: store in global array so prv_update_config can update colors/text
      const cfgIdx = _localTlIdx++;
      lines.push(`  s_cfg_tl[${cfgIdx}] = text_layer_create(GRect(${ax}, ${ay}, ${w}, ${h}));`);
      lines.push(`  text_layer_set_background_color(s_cfg_tl[${cfgIdx}], GColorClear);`);
      lines.push(`  text_layer_set_text_color(s_cfg_tl[${cfgIdx}], ${color});`);
      lines.push(`  text_layer_set_font(s_cfg_tl[${cfgIdx}], ${fontExpr});`);
      if (align !== 'GTextAlignmentLeft') {
        lines.push(`  text_layer_set_text_alignment(s_cfg_tl[${cfgIdx}], ${align});`);
      }
      lines.push(`  text_layer_set_text(s_cfg_tl[${cfgIdx}], "${text}");`);
      lines.push(`  layer_add_child(${parentVar}, text_layer_get_layer(s_cfg_tl[${cfgIdx}]));`);
    } else {
      const localVar = `tl_${_localTlIdx++}`;
      lines.push(`  TextLayer *${localVar} = text_layer_create(GRect(${ax}, ${ay}, ${w}, ${h}));`);
      lines.push(`  text_layer_set_background_color(${localVar}, GColorClear);`);
      lines.push(`  text_layer_set_text_color(${localVar}, ${color});`);
      lines.push(`  text_layer_set_font(${localVar}, ${fontExpr});`);
      if (align !== 'GTextAlignmentLeft') {
        lines.push(`  text_layer_set_text_alignment(${localVar}, ${align});`);
      }
      lines.push(`  text_layer_set_text(${localVar}, "${text}");`);
      lines.push(`  layer_add_child(${parentVar}, text_layer_get_layer(${localVar}));`);
    }
    lines.push('');
  }

  let _localTlIdx = 0;

  if (branchClassifieds.length > 0) {
    // Create branch parent layers and add elements to them
    for (const bc of branchClassifieds) {
      lines.push(`  // Branch: s${bc.slotIndex} == ${JSON.stringify(bc.value)}`);
      lines.push(`  ${bc.layerVar} = layer_create(GRect(0, 0, ${ir.platform.width}, ${ir.platform.height}));`);
      if (!bc.isBaseline) {
        lines.push(`  layer_set_hidden(${bc.layerVar}, true);`);
      }
      lines.push(`  layer_add_child(root, ${bc.layerVar});`);
      lines.push('');

      for (const te of bc.classified.textElements) {
        emitTextLayerCreate(te, bc.layerVar);
      }
    }
  } else {
    // No branches — add all text layers to root
    for (const te of mainClassified.textElements) {
      emitTextLayerCreate(te, 'root');
    }
  }

  // List slot text layers
  if (ir.hasList && ir.listInfo) {
    const li = ir.listInfo;
    const lpi = li.labelsPerItem;
    const listLabels = classified.textElements.filter(te => te.el.isListSlot);

    lines.push('  // List item layers');
    // Calculate item height from the first two template labels
    const firstY = listLabels[0]?.el?.y ?? 32;
    const itemHeight = lpi > 1 && listLabels.length >= lpi * 2
      ? ((listLabels[lpi]?.el?.y ?? firstY + 30) - firstY)
      : (listLabels.length > 1 ? ((listLabels[1]?.el?.y ?? firstY + 24) - firstY) : 24);
    for (let i = 0; i < li.visibleCount; i++) {
      for (let j = 0; j < lpi; j++) {
        const flatIdx = i * lpi + j;
        const templateLabel = listLabels[flatIdx]?.el;
        const x = templateLabel?.x ?? (listLabels[j]?.el?.x ?? 0);
        // Use the template label's actual position if available, otherwise
        // compute from firstY + item offset + sub-label offset within item
        const subLabelOffset = lpi > 1 && templateLabel && listLabels[j]?.el
          ? (templateLabel.y - (listLabels[j]!.el.y + Math.floor(flatIdx / lpi) * itemHeight))
          : 0;
        const y = templateLabel?.y ?? (firstY + i * itemHeight + subLabelOffset);
        const w = templateLabel?.w ?? ir.platform.width;
        const fontExpr = fontExprC(templateLabel?.font);
        const color = colorToGColor(templateLabel?.color ?? '#ffffff');
        const align = alignToC(templateLabel?.align);

        lines.push(`  s_ls[${flatIdx}] = text_layer_create(GRect(${x}, ${y}, ${w}, 24));`);
        lines.push(`  text_layer_set_background_color(s_ls[${flatIdx}], GColorClear);`);
        lines.push(`  text_layer_set_text_color(s_ls[${flatIdx}], ${color});`);
        lines.push(`  text_layer_set_font(s_ls[${flatIdx}], ${fontExpr});`);
        if (align !== 'GTextAlignmentLeft') {
          lines.push(`  text_layer_set_text_alignment(s_ls[${flatIdx}], ${align});`);
        }
        lines.push(`  layer_add_child(root, text_layer_get_layer(s_ls[${flatIdx}]));`);
      }
    }
    lines.push('');
  }

  // Initial refresh
  if (hasBehavior) {
    lines.push('  refresh();');
  }

  // Apply initial config settings to UI
  if (hasConfig) {
    lines.push('  prv_update_config();');
  }

  lines.push('}');
  lines.push('');

  // =========================================================================
  // window_unload
  // =========================================================================

  lines.push('static void window_unload(Window *window) {');
  if (hasConfig) {
    const staticCount = allTextElements.filter(te => !te.isDynamic).length;
    lines.push(`  for (int i = 0; i < ${staticCount}; i++) { text_layer_destroy(s_cfg_tl[i]); }`);
  }
  for (const te of allTextElements) {
    if (te.isDynamic && te.dynamicVar) {
      lines.push(`  text_layer_destroy(${te.dynamicVar.varName});`);
    }
  }
  if (ir.hasList && ir.listInfo) {
    const count = ir.listInfo.visibleCount * ir.listInfo.labelsPerItem;
    lines.push(`  for (int i = 0; i < ${count}; i++) { text_layer_destroy(s_ls[i]); }`);
  }
  for (const bc of branchClassifieds) {
    lines.push(`  layer_destroy(${bc.layerVar});`);
  }
  for (let i = 0; i < pathElements.length; i++) {
    lines.push(`  gpath_destroy(s_path${i});`);
  }
  for (const resName of imageResNames) {
    lines.push(`  gbitmap_destroy(s_img_${resName.toLowerCase()});`);
  }
  for (const fname of customFontNames) {
    lines.push(`  if (s_font_${fname.toLowerCase()}) { fonts_unload_custom_font(s_font_${fname.toLowerCase()}); s_font_${fname.toLowerCase()} = NULL; }`);
  }
  for (const ai of animatedImages) {
    const lower = ai.resName.toLowerCase();
    lines.push(`  if (s_seqtimer_${lower}) { app_timer_cancel(s_seqtimer_${lower}); s_seqtimer_${lower} = NULL; }`);
    if (ai.format === 'apng') {
      lines.push(`  if (s_seqframe_${lower}) { gbitmap_destroy(s_seqframe_${lower}); s_seqframe_${lower} = NULL; }`);
      lines.push(`  if (s_seq_${lower}) { gbitmap_sequence_destroy(s_seq_${lower}); s_seq_${lower} = NULL; }`);
    } else {
      lines.push(`  if (s_seq_${lower}) { gdraw_command_sequence_destroy(s_seq_${lower}); s_seq_${lower} = NULL; }`);
    }
  }
  if (needsDrawLayer) {
    lines.push('  layer_destroy(s_draw_layer);');
  }
  lines.push('}');
  lines.push('');

  // =========================================================================
  // init / deinit / main
  // =========================================================================

  lines.push('static void init(void) {');
  if (hasConfig) {
    lines.push('  prv_load_settings();');
  }
  lines.push('  s_window = window_create();');
  lines.push('  window_set_window_handlers(s_window, (WindowHandlers) {');
  lines.push('    .load = window_load,');
  lines.push('    .unload = window_unload,');
  lines.push('  });');
  if (ir.hasButtons) {
    lines.push('  window_set_click_config_provider(s_window, click_config);');
  }
  if (needsTick) {
    // If there's a showSeconds config key, always use SECOND_UNIT since user might enable it
    const hasShowSecondsConfig = hasConfig && ir.configInfo!.keys.some(
      k => k.type === 'boolean' && k.key.toLowerCase().includes('second')
    );
    const unit = (hasSeconds || hasShowSecondsConfig) ? 'SECOND_UNIT' : 'MINUTE_UNIT';
    lines.push(`  tick_timer_service_subscribe(${unit}, tick_handler);`);
  }
  if (ir.messageInfo) {
    lines.push('  app_message_register_inbox_received(inbox_received);');
    lines.push('  app_message_open(512, 64);');
  }
  if (hasConfig) {
    lines.push('  app_message_register_inbox_received(prv_inbox_received);');
    lines.push('  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());');
  }
  lines.push('  window_stack_push(s_window, true);');
  lines.push('}');
  lines.push('');

  lines.push('static void deinit(void) {');
  if (needsTick) {
    lines.push('  tick_timer_service_unsubscribe();');
  }
  lines.push('  window_destroy(s_window);');
  lines.push('}');
  lines.push('');

  lines.push('int main(void) {');
  lines.push('  init();');
  lines.push('  app_event_loop();');
  lines.push('  deinit();');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Graphics draw call emission
// ---------------------------------------------------------------------------

function clampW(x: number, w: number, screenW: number): number {
  return Math.max(0, Math.min(w, screenW - x));
}

function clampH(y: number, h: number, screenH: number): number {
  return Math.max(0, Math.min(h, screenH - y));
}

function emitGraphicsDrawCall(
  ge: CGraphicsElement, lines: string[], indent: string, ir: CompilerIR,
  pathElements: CGraphicsElement[],
): void {
  const el = ge.el;
  const ax = ge.absX;
  const ay = ge.absY;
  const sw = ir.platform.width;
  const sh = ir.platform.height;

  // Skip time-reactive elements here — they're handled separately in draw_proc
  if (el.elemIndex !== undefined) {
    const isTimeReactive = ir.timeReactiveGraphics.some(trg => trg.elemIndex === el.elemIndex);
    if (isTimeReactive) return;
  }

  switch (el.type) {
    case 'rect': {
      const fill = el.fill ?? '#000000';
      const w = clampW(ax, el.w, sw);
      const h = clampH(ay, el.h, sh);
      if (el.isSkinDynamic && el.rectIndex !== undefined) {
        const dep = ir.skinDeps.get(el.rectIndex);
        if (dep) {
          const slot = ir.stateSlots.find(s => s.index === dep.slotIndex);
          if (slot?.type === 'boolean') {
            lines.push(`${indent}graphics_context_set_fill_color(ctx, s${dep.slotIndex} ? ${colorToGColor(dep.skins[1])} : ${colorToGColor(dep.skins[0])});`);
          } else {
            lines.push(`${indent}graphics_context_set_fill_color(ctx, (s${dep.slotIndex} != ${JSON.stringify(slot?.initialValue)}) ? ${colorToGColor(dep.skins[1])} : ${colorToGColor(dep.skins[0])});`);
          }
        }
      } else {
        lines.push(`${indent}graphics_context_set_fill_color(ctx, ${colorToGColor(fill)});`);
      }
      lines.push(`${indent}graphics_fill_rect(ctx, GRect(${ax}, ${ay}, ${w}, ${h}), 0, GCornerNone);`);
      break;
    }

    case 'circle': {
      const fill = el.fill ?? '#ffffff';
      const r = el.radius ?? 0;
      const cx = ax + r;
      const cy = ay + r;
      lines.push(`${indent}graphics_context_set_fill_color(ctx, ${colorToGColor(fill)});`);
      lines.push(`${indent}graphics_fill_circle(ctx, GPoint(${cx}, ${cy}), ${r});`);
      break;
    }

    case 'line': {
      const color = el.color ?? '#ffffff';
      const strokeW = el.strokeWidth || 1;
      const lx1 = ax;
      const ly1 = ay;
      const lx2 = ax + (el.x2! - el.x);
      const ly2 = ay + (el.y2! - el.y);
      if (ly1 === ly2) {
        // Horizontal line
        const lx = Math.min(lx1, lx2);
        const lw = clampW(lx, Math.abs(lx2 - lx1) || 1, sw);
        lines.push(`${indent}graphics_context_set_fill_color(ctx, ${colorToGColor(color)});`);
        lines.push(`${indent}graphics_fill_rect(ctx, GRect(${lx}, ${ly1}, ${lw}, ${strokeW}), 0, GCornerNone);`);
      } else if (lx1 === lx2) {
        // Vertical line
        const ly = Math.min(ly1, ly2);
        const lh = clampH(ly, Math.abs(ly2 - ly1) || 1, sh);
        lines.push(`${indent}graphics_context_set_fill_color(ctx, ${colorToGColor(color)});`);
        lines.push(`${indent}graphics_fill_rect(ctx, GRect(${lx1}, ${ly}, ${strokeW}, ${lh}), 0, GCornerNone);`);
      } else {
        // Diagonal line — use graphics_draw_line
        lines.push(`${indent}graphics_context_set_stroke_color(ctx, ${colorToGColor(color)});`);
        lines.push(`${indent}graphics_context_set_stroke_width(ctx, ${strokeW});`);
        lines.push(`${indent}graphics_draw_line(ctx, GPoint(${lx1}, ${ly1}), GPoint(${lx2}, ${ly2}));`);
      }
      break;
    }

    case 'path': {
      // Static path — draw at its fixed position
      const pathIdx = pathElements.indexOf(ge);
      if (pathIdx >= 0) {
        const fill = el.fill ?? '#ffffff';
        lines.push(`${indent}graphics_context_set_fill_color(ctx, ${colorToGColor(fill)});`);
        if (el.rotation) {
          lines.push(`${indent}gpath_rotate_to(s_path${pathIdx}, DEG_TO_TRIGANGLE(${el.rotation}));`);
        }
        lines.push(`${indent}gpath_draw_filled(ctx, s_path${pathIdx});`);
      }
      break;
    }

    case 'image': {
      const src = el.src ?? '';
      const resName = src.replace(/^.*\//, '').replace(/\.[^.]+$/, '').toUpperCase();
      const lower = resName.toLowerCase();
      if (el.animated === 'apng') {
        // Native APNG playback — draws the current frame of the sequence.
        lines.push(`${indent}if (s_seqframe_${lower}) {`);
        lines.push(`${indent}  graphics_draw_bitmap_in_rect(ctx, s_seqframe_${lower}, GRect(${ax}, ${ay}, ${el.w}, ${el.h}));`);
        lines.push(`${indent}}`);
        break;
      }
      if (el.animated === 'pdcs') {
        // PDC-sequence playback — draws the current frame at millisecond offset.
        lines.push(`${indent}if (s_seq_${lower}) {`);
        lines.push(`${indent}  GDrawCommandFrame *_f = gdraw_command_sequence_get_frame_by_index(s_seq_${lower}, s_seqframe_${lower}_idx);`);
        lines.push(`${indent}  if (_f) gdraw_command_frame_draw(ctx, s_seq_${lower}, _f, GPoint(${ax}, ${ay}));`);
        lines.push(`${indent}}`);
        break;
      }
      const varName = `s_img_${lower}`;
      lines.push(`${indent}if (${varName}) {`);
      const rotation = typeof el.rotation === 'number' ? el.rotation : 0;
      if (rotation !== 0) {
        // Rotating a bitmap via draw_rotated_bitmap — uses the Poco
        // GDrawCommandImage-style API surfaced by `pebble.h`. The `src_ic`
        // is the rotation center *within* the source bitmap (pivotX/Y); the
        // `dest` point is where the center lands on screen.
        const pivotX = typeof el.pivotX === 'number' ? el.pivotX : Math.floor(el.w / 2);
        const pivotY = typeof el.pivotY === 'number' ? el.pivotY : Math.floor(el.h / 2);
        const centerX = ax + Math.floor(el.w / 2);
        const centerY = ay + Math.floor(el.h / 2);
        lines.push(`${indent}  // rotated bitmap: ${rotation}° around (${pivotX},${pivotY}) in source`);
        lines.push(`${indent}  graphics_draw_rotated_bitmap(ctx, ${varName}, GPoint(${pivotX}, ${pivotY}), DEG_TO_TRIGANGLE(${rotation}), GPoint(${centerX}, ${centerY}));`);
      } else {
        lines.push(`${indent}  graphics_draw_bitmap_in_rect(ctx, ${varName}, GRect(${ax}, ${ay}, ${el.w}, ${el.h}));`);
      }
      lines.push(`${indent}}`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Time-reactive graphic emission
// ---------------------------------------------------------------------------

function angleExprForTimeComponent(component: 'second' | 'minute' | 'hour'): string {
  switch (component) {
    case 'second':
      return 'TRIG_MAX_ANGLE * t->tm_sec / 60';
    case 'minute':
      return 'TRIG_MAX_ANGLE * (t->tm_min * 60 + t->tm_sec) / 3600';
    case 'hour':
      // Use int64_t to avoid overflow: 65536 * 43199 > INT32_MAX
      return '(int32_t)((int64_t)TRIG_MAX_ANGLE * ((t->tm_hour % 12) * 3600 + t->tm_min * 60 + t->tm_sec) / 43200)';
  }
}

function emitTimeReactiveGraphic(
  trg: IRTimeReactiveGraphic,
  lines: string[],
  indent: string,
  ir: CompilerIR,
  pathElements: CGraphicsElement[],
  allGraphicsElements: CGraphicsElement[],
): void {
  const angleExpr = angleExprForTimeComponent(trg.timeComponent);

  if (trg.type === 'path_rotation') {
    // Find the matching path element
    const pathIdx = pathElements.findIndex(pe => pe.el.elemIndex === trg.elemIndex);
    if (pathIdx < 0) return;
    const fill = pathElements[pathIdx]!.el.fill ?? '#ffffff';
    lines.push(`${indent}{`);
    lines.push(`${indent}  int32_t angle = ${angleExpr};`);
    lines.push(`${indent}  graphics_context_set_fill_color(ctx, ${colorToGColor(fill)});`);
    lines.push(`${indent}  gpath_rotate_to(s_path${pathIdx}, angle);`);
    lines.push(`${indent}  gpath_draw_filled(ctx, s_path${pathIdx});`);
    lines.push(`${indent}}`);
  } else if (trg.type === 'line_endpoint') {
    // Find the matching line element for its color/strokeWidth
    const ge = allGraphicsElements.find(g => g.el.elemIndex === trg.elemIndex);
    if (!ge) return;
    const color = ge.el.color ?? '#ffffff';
    const strokeW = ge.el.strokeWidth || 1;
    lines.push(`${indent}{`);
    lines.push(`${indent}  int32_t angle = ${angleExpr};`);
    lines.push(`${indent}  GPoint end = {`);
    lines.push(`${indent}    .x = ${trg.centerX} + (int16_t)(sin_lookup(angle) * (int32_t)${trg.radius} / TRIG_MAX_RATIO),`);
    lines.push(`${indent}    .y = ${trg.centerY} - (int16_t)(cos_lookup(angle) * (int32_t)${trg.radius} / TRIG_MAX_RATIO)`);
    lines.push(`${indent}  };`);
    lines.push(`${indent}  graphics_context_set_stroke_color(ctx, ${colorToGColor(color)});`);
    lines.push(`${indent}  graphics_context_set_stroke_width(ctx, ${strokeW});`);
    lines.push(`${indent}  graphics_draw_line(ctx, GPoint(${trg.centerX}, ${trg.centerY}), end);`);
    lines.push(`${indent}}`);
  }
}
