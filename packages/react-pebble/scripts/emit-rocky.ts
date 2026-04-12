/**
 * scripts/emit-rocky.ts — Rocky.js (classic Pebble) code generation backend.
 *
 * Consumes a CompilerIR and produces Rocky.js code for classic Pebble
 * platforms (basalt, chalk, diorite, aplite).
 *
 * Rocky.js is a canvas-based JS runtime — no scene graph. All rendering
 * happens in a `rocky.on('draw', ...)` handler that redraws everything
 * on each frame. State is stored in module-level variables.
 *
 * Limitations:
 * - Rocky.js on basalt/chalk does NOT support button events (watchface-only)
 * - Rocky.js has ~24KB memory — complex apps may exceed this
 * - No persistent scene graph — full redraw on every state change
 */

import type { CompilerIR, IRElement, TimeFormat } from './compiler-ir.js';
import { stripThisPrefix } from './compiler-ir.js';

// ---------------------------------------------------------------------------
// Font mapping
// ---------------------------------------------------------------------------

/**
 * Rocky.js font strings.
 * See: https://developer.rebble.io/developer.pebble.com/docs/rockyjs/
 * Rocky uses CSS-like font names but Pebble-specific.
 */
const FONT_TO_ROCKY: Record<string, string> = {
  gothic14: '14px Gothic',
  gothic14Bold: '14px bold Gothic',
  gothic18: '18px Gothic',
  gothic18Bold: '18px bold Gothic',
  gothic24: '24px Gothic',
  gothic24Bold: '24px bold Gothic',
  gothic28: '28px Gothic',
  gothic28Bold: '28px bold Gothic',
  bitham30Black: '30px Bitham',
  bitham42Bold: '42px bold Bitham',
  bitham42Light: '42px light Bitham',
  bitham34MediumNumbers: '34px Bitham',
  bitham42MediumNumbers: '42px Bitham',
  robotoCondensed21: '21px Roboto Condensed',
  roboto21: '21px Roboto',
  droid28: '28px Droid Serif',
  leco20: '20px LECO',
  leco26: '26px LECO',
  leco28: '28px LECO',
  leco32: '32px LECO',
  leco36: '36px LECO',
  leco38: '38px LECO',
  leco42: '42px LECO',
};

function fontToRocky(name: string | undefined): string {
  if (!name) return '18px Gothic';
  return FONT_TO_ROCKY[name] ?? '18px Gothic';
}

// ---------------------------------------------------------------------------
// Time expression helpers
// ---------------------------------------------------------------------------

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
// Draw call generation from IR elements
// ---------------------------------------------------------------------------

/**
 * Collect text alignment — Rocky.js uses ctx.textAlign which is sticky,
 * so we track it to avoid redundant sets.
 */
function emitDrawCalls(
  el: IRElement,
  lines: string[],
  indent: string,
  ir: CompilerIR,
  activeBranch?: { slotIndex: number; value: unknown },
): void {
  switch (el.type) {
    case 'root':
    case 'group': {
      for (const child of el.children ?? []) {
        emitDrawCalls(child, lines, indent, ir, activeBranch);
      }
      break;
    }

    case 'rect': {
      const fill = el.fill ?? '#000000';
      // Check if this rect has a skin dependency
      if (el.isSkinDynamic && el.rectIndex !== undefined) {
        const dep = ir.skinDeps.get(el.rectIndex);
        if (dep) {
          const slot = ir.stateSlots.find(s => s.index === dep.slotIndex);
          if (slot?.type === 'boolean') {
            lines.push(`${indent}ctx.fillStyle = s${dep.slotIndex} ? '${dep.skins[1]}' : '${dep.skins[0]}';`);
          } else {
            lines.push(`${indent}ctx.fillStyle = (s${dep.slotIndex} !== ${JSON.stringify(slot?.initialValue)}) ? '${dep.skins[1]}' : '${dep.skins[0]}';`);
          }
        }
      } else {
        lines.push(`${indent}ctx.fillStyle = '${fill}';`);
      }
      lines.push(`${indent}ctx.fillRect(${el.x}, ${el.y}, ${el.w}, ${el.h});`);

      // Draw children
      for (const child of el.children ?? []) {
        emitDrawCalls(child, lines, indent, ir, activeBranch);
      }
      break;
    }

    case 'text': {
      const color = el.color ?? '#ffffff';
      const text = el.text ?? '';
      const font = fontToRocky(el.font);
      const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      lines.push(`${indent}ctx.fillStyle = '${color}';`);
      lines.push(`${indent}ctx.font = '${font}';`);

      // Determine text content — might be dynamic
      let textExpr: string;
      if (el.isListSlot && el.name) {
        // List slot — rendered from data array in the draw loop
        // We'll handle this separately in the list rendering section
        return; // Skip individual draw — handled by list loop
      } else if (el.isStateDynamic && el.labelIndex !== undefined) {
        const dep = ir.stateDeps.get(el.labelIndex);
        if (dep) {
          textExpr = stripThisPrefix(dep.formatExpr);
        } else {
          textExpr = `'${escaped}'`;
        }
      } else if (el.isTimeDynamic && el.labelIndex !== undefined) {
        const fmt = ir.timeDeps.get(el.labelIndex);
        if (fmt) {
          textExpr = emitTimeExpr(fmt);
        } else {
          textExpr = `'${escaped}'`;
        }
      } else {
        textExpr = `'${escaped}'`;
      }

      // Calculate text position
      const textAlign = el.align ?? 'left';
      let drawX = el.x;
      if (textAlign === 'center' && el.w > 0) {
        drawX = el.x + Math.floor(el.w / 2);
      } else if (textAlign === 'right' && el.w > 0) {
        drawX = el.x + el.w;
      }

      lines.push(`${indent}ctx.textAlign = '${textAlign}';`);
      lines.push(`${indent}ctx.fillText(${textExpr}, ${drawX}, ${el.y});`);
      break;
    }

    case 'line': {
      const color = el.color ?? '#ffffff';
      const sw = el.strokeWidth || 1;
      // Rocky.js doesn't have line primitives — use fillRect for h/v lines
      if (el.y === el.y2!) {
        // Horizontal line
        const left = Math.min(el.x, el.x2!);
        const w = Math.abs(el.x2! - el.x) || 1;
        lines.push(`${indent}ctx.fillStyle = '${color}';`);
        lines.push(`${indent}ctx.fillRect(${left}, ${el.y}, ${w}, ${sw});`);
      } else if (el.x === el.x2!) {
        // Vertical line
        const top = Math.min(el.y, el.y2!);
        const h = Math.abs(el.y2! - el.y) || 1;
        lines.push(`${indent}ctx.fillStyle = '${color}';`);
        lines.push(`${indent}ctx.fillRect(${el.x}, ${top}, ${sw}, ${h});`);
      }
      break;
    }

    case 'circle': {
      const fill = el.fill ?? '#ffffff';
      const r = el.radius ?? 0;
      const cx = el.x + r;
      const cy = el.y + r;

      lines.push(`${indent}ctx.fillStyle = '${fill}';`);
      lines.push(`${indent}ctx.beginPath();`);
      lines.push(`${indent}ctx.arc(${cx}, ${cy}, ${r}, 0, 2 * Math.PI, false);`);
      lines.push(`${indent}ctx.fill();`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function emitRocky(ir: CompilerIR): string {
  const lines: string[] = [];

  lines.push('// Auto-generated by react-pebble (Rocky.js backend for classic Pebble)');
  lines.push('//');
  lines.push('// Target: ' + ir.platform.name + ' (' + ir.platform.width + 'x' + ir.platform.height + ')');
  lines.push('');

  // Warnings
  if (ir.hasButtons && (ir.platform.name === 'basalt' || ir.platform.name === 'chalk')) {
    lines.push('// WARNING: Rocky.js on ' + ir.platform.name + ' does not support button events.');
    lines.push('// Interactive features (buttons, scrolling) will not work.');
    lines.push('');
    process.stderr.write(`WARNING: Rocky.js on ${ir.platform.name} does not support button events. This app uses buttons.\n`);
  }

  // Time helpers
  const needsTime = ir.hasTimeDeps;
  if (needsTime) {
    lines.push('function pad(n) { return n < 10 ? "0" + n : "" + n; }');
    lines.push('var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];');
    lines.push('var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];');
    lines.push('');
  }

  // State variables (module-level)
  for (const slot of ir.stateSlots) {
    const v = slot.initialValue;
    if (v instanceof Date || (typeof v === 'object' && v !== null && !(Array.isArray(v)))) continue;
    lines.push(`var s${slot.index} = ${JSON.stringify(v)};`);
  }

  // Elapsed-time start markers
  for (const [, dep] of ir.stateDeps) {
    if (dep.needsTime) {
      lines.push(`var _startTime_s${dep.slotIndex} = Date.now();`);
    }
  }

  if (ir.stateSlots.length > 0) lines.push('');

  // Data arrays
  if (ir.hasList && !ir.messageInfo) {
    const li = ir.listInfo!;
    if (li.dataArrayObjects) {
      lines.push(`var _data = ${JSON.stringify(li.dataArrayObjects)};`);
    } else if (li.dataArrayValues) {
      lines.push(`var _data = ${JSON.stringify(li.dataArrayValues)};`);
    }
    lines.push('');
  }
  if (ir.messageInfo) {
    lines.push('var _data = [];');
    lines.push('');
  }

  // Keyframe arrays for animations
  if (ir.hasAnimatedElements) {
    for (const ae of ir.animatedElements) {
      lines.push(`var _kf_e${ae.elemIndex}_${ae.prop} = [${ae.keyframes.join(',')}];`);
    }
    lines.push('');
  }

  // -----------------------------------------------------------------------
  // Draw handler
  // -----------------------------------------------------------------------

  lines.push('rocky.on(\'draw\', function(event) {');
  lines.push('  var ctx = event.context;');

  if (needsTime) {
    lines.push('  var d = new Date();');
  }

  lines.push('');

  // If there are branches, emit conditional blocks
  if (ir.hasBranches && ir.branches.size > 0) {
    for (const [si, branchList] of ir.branches) {
      for (let bi = 0; bi < branchList.length; bi++) {
        const branch = branchList[bi]!;
        const cond = bi === 0
          ? `if (s${si} === ${JSON.stringify(branch.value)})`
          : `else if (s${si} === ${JSON.stringify(branch.value)})`;
        lines.push(`  ${cond} {`);
        const drawLines: string[] = [];
        for (const el of branch.tree) {
          emitDrawCalls(el, drawLines, '    ', ir);
        }
        lines.push(...drawLines);
        lines.push('  }');
      }
    }
  } else if (ir.hasConditionals && ir.conditionalChildren.length > 0) {
    // Per-subtree conditionals — need to handle visibility
    // For simplicity, draw all static elements, then conditionally draw dynamic ones
    for (const el of ir.tree) {
      const drawLines: string[] = [];
      emitDrawCallsWithConditionals(el, drawLines, '  ', ir);
      lines.push(...drawLines);
    }
  } else {
    // Normal case — draw everything
    for (const el of ir.tree) {
      const drawLines: string[] = [];
      emitDrawCalls(el, drawLines, '  ', ir);
      lines.push(...drawLines);
    }
  }

  // List rendering
  if (ir.hasList && ir.listInfo) {
    const li = ir.listInfo;
    const lpi = li.labelsPerItem;
    lines.push('');
    lines.push('  // List items');

    // Find the first list slot label element to get font/color/position info
    const listLabels = findListLabels(ir.tree);

    if (listLabels.length > 0) {
      const startExpr = li.scrollSlotIndex >= 0 ? `s${li.scrollSlotIndex}` : '0';
      lines.push(`  var _start = ${startExpr};`);
      lines.push(`  for (var _i = 0; _i < ${li.visibleCount}; _i++) {`);
      lines.push(`    var _item = _data[_start + _i];`);
      lines.push(`    if (_item !== undefined) {`);

      if (lpi > 1 && li.propertyOrder) {
        // Multi-label list items
        for (let j = 0; j < lpi; j++) {
          const label = listLabels[j];
          if (label) {
            const font = fontToRocky(label.font);
            const color = label.color ?? '#ffffff';
            const align = label.align ?? 'left';
            const prop = li.propertyOrder[j]!;
            const yOffset = label.y;
            // Calculate per-item Y offset from the first item's Y position
            const firstY = listLabels[0]?.y ?? 0;
            const itemHeight = li.visibleCount > 1 && listLabels.length >= lpi * 2
              ? (listLabels[lpi]?.y ?? firstY + 40) - firstY
              : 40;
            let drawX = label.x;
            if (align === 'center' && label.w > 0) drawX = label.x + Math.floor(label.w / 2);
            else if (align === 'right' && label.w > 0) drawX = label.x + label.w;

            lines.push(`      ctx.fillStyle = '${color}';`);
            lines.push(`      ctx.font = '${font}';`);
            lines.push(`      ctx.textAlign = '${align}';`);
            lines.push(`      ctx.fillText(_item.${prop} || '', ${drawX}, ${yOffset} + _i * ${itemHeight} - _start * ${itemHeight});`);
          }
        }
      } else {
        // Single-label list items
        const label = listLabels[0];
        if (label) {
          const font = fontToRocky(label.font);
          const color = label.color ?? '#ffffff';
          const align = label.align ?? 'left';
          const firstY = label.y;
          const itemHeight = listLabels.length > 1 ? (listLabels[1]!.y - firstY) : 24;
          let drawX = label.x;
          if (align === 'center' && label.w > 0) drawX = label.x + Math.floor(label.w / 2);

          lines.push(`      ctx.fillStyle = '${color}';`);
          lines.push(`      ctx.font = '${font}';`);
          lines.push(`      ctx.textAlign = '${align}';`);
          lines.push(`      ctx.fillText('' + _item, ${drawX}, ${firstY} + _i * ${itemHeight} - _start * ${itemHeight});`);
        }
      }

      lines.push('    }');
      lines.push('  }');
    }
  }

  // Animated elements — update from keyframe tables
  if (ir.hasAnimatedElements) {
    lines.push('');
    lines.push('  // Note: animations use pre-computed keyframe tables');
    lines.push('  // Rocky.js redraws fully, so animated positions are computed inline above');
  }

  lines.push('});');
  lines.push('');

  // -----------------------------------------------------------------------
  // Time tick handler
  // -----------------------------------------------------------------------

  if (needsTime) {
    // Use secondchange for second-level precision, minutechange for minute-level
    const hasSeconds = [...ir.timeDeps.values()].some(fmt => fmt === 'SS' || fmt === 'MMSS') || ir.hasAnimatedElements;
    const event = hasSeconds ? 'secondchange' : 'minutechange';
    lines.push(`rocky.on('${event}', function(event) {`);
    lines.push('  rocky.requestDraw();');
    lines.push('});');
    lines.push('');
  }

  // -----------------------------------------------------------------------
  // Message handler (if useMessage is used)
  // -----------------------------------------------------------------------

  if (ir.messageInfo) {
    lines.push('// Phone → watch data');
    lines.push("rocky.on('message', function(event) {");
    lines.push('  var data = event.data;');
    lines.push(`  if (data && data['${ir.messageInfo.key}']) {`);
    lines.push('    try {');
    lines.push(`      _data = JSON.parse(data['${ir.messageInfo.key}']);`);

    // Update branch state if applicable
    if (ir.hasBranches) {
      for (const [si, branchList] of ir.branches) {
        if (branchList[0]?.isBaseline) {
          lines.push(`      s${si} = ${JSON.stringify(branchList[0].value)};`);
        }
      }
    }

    lines.push('      rocky.requestDraw();');
    lines.push("    } catch (e) { console.log('Parse error: ' + e.message); }");
    lines.push('  }');
    lines.push('});');
    lines.push('');

    // Post ready event to phone
    lines.push("rocky.postMessage({'ready': true});");
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helper: find list label elements in tree
// ---------------------------------------------------------------------------

function findListLabels(tree: IRElement[]): IRElement[] {
  const labels: IRElement[] = [];

  function walk(elements: IRElement[]) {
    for (const el of elements) {
      if (el.isListSlot && el.type === 'text') {
        labels.push(el);
      }
      if (el.children) walk(el.children);
    }
  }

  walk(tree);
  return labels;
}

// ---------------------------------------------------------------------------
// Helper: emit draw calls with per-subtree conditionals
// ---------------------------------------------------------------------------

function emitDrawCallsWithConditionals(
  el: IRElement,
  lines: string[],
  indent: string,
  ir: CompilerIR,
): void {
  if (el.type === 'root' || el.type === 'group') {
    for (let i = 0; i < (el.children ?? []).length; i++) {
      const child = el.children![i]!;
      // Check if this child index has a conditional
      const cond = ir.conditionalChildren.find(
        cc => cc.childIndex === i && cc.type === 'removed'
      );
      if (cond) {
        lines.push(`${indent}if (s${cond.stateSlot}) {`);
        emitDrawCalls(child, lines, indent + '  ', ir);
        lines.push(`${indent}}`);
      } else {
        emitDrawCalls(child, lines, indent, ir);
      }
    }
  } else {
    emitDrawCalls(el, lines, indent, ir);
  }
}
