/**
 * scripts/targets/rocky.ts — Rocky.js Target Adapter.
 *
 * Self-contained: owns its font table, draw-call lowering, blocked-hook
 * guardrails, and emission entry. Rocky.js is a canvas runtime — no scene
 * graph — so emission unrolls the IR tree into a flat `rocky.on('draw', ...)`
 * handler that redraws every frame.
 *
 * Limitations:
 *  - Rocky.js on basalt/chalk does NOT support button events (watchface-only)
 *  - Rocky.js has ~24KB memory — complex apps may exceed this
 *  - No persistent scene graph — full redraw on every state change
 *
 * See: docs/adr/0001-target-adapter-seam.md, docs/adr/0004-adapters-absorb-emit-shells.md
 */

import type { CompilerIR, IRElement, TimeFormat } from '../compiler-ir.js';
import { stripThisPrefix } from '../compiler-ir.js';
import type { Target, TargetContext, TargetResult, Diagnostic } from './types.js';
import { needsPKJS, buildPKJS } from './pkjs.js';
import type { FontKey } from './fonts.js';

// ---------------------------------------------------------------------------
// Font mapping
// ---------------------------------------------------------------------------

const FONT_TO_ROCKY: Record<FontKey, string> = {
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
  const mapped = FONT_TO_ROCKY[name as FontKey];
  if (mapped) return mapped;
  if (/^(bold\s|light\s|black\s)?\d+px\s+\S/.test(name)) return name;
  process.stderr.write(`warning: rocky target has no custom-font support — "${name}" falls back to 18px Gothic\n`);
  return '18px Gothic';
}

// ---------------------------------------------------------------------------
// Blocked-hook guardrails (validate())
// ---------------------------------------------------------------------------

const ROCKY_BLOCKED_HOOKS: Record<string, string> = {
  useButton: 'button events',
  useLongButton: 'button events',
  useMultiClick: 'button events',
  useRepeatClick: 'button events',
  useRawClick: 'button events',
  useFetch: 'on-watch network APIs (route network requests through PKJS via useMessage)',
  useHTTPClient: 'on-watch network APIs (route network requests through PKJS via useMessage)',
  useWebSocket: 'on-watch network APIs (route network requests through PKJS via useMessage)',
  useLocalStorage: 'on-watch storage',
  useKVStorage: 'on-watch storage',
  useFileStorage: 'on-watch storage',
};

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
 * Rocky.js canvas is flat — no nested Containers. The IR stores each element's
 * x/y local to its parent Group; we thread offsetX/offsetY through recursion
 * and add them to every draw coordinate.
 */
function emitDrawCalls(
  el: IRElement,
  lines: string[],
  indent: string,
  ir: CompilerIR,
  activeBranch?: { slotIndex: number; value: unknown },
  offsetX = 0,
  offsetY = 0,
): void {
  switch (el.type) {
    case 'root':
    case 'group': {
      const gx = offsetX + (el.x ?? 0);
      const gy = offsetY + (el.y ?? 0);
      for (const child of el.children ?? []) {
        emitDrawCalls(child, lines, indent, ir, activeBranch, gx, gy);
      }
      break;
    }

    case 'rect': {
      const fill = el.fill ?? '#000000';
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
      lines.push(`${indent}ctx.fillRect(${el.x + offsetX}, ${el.y + offsetY}, ${el.w}, ${el.h});`);

      const childOffsetX = offsetX + el.x;
      const childOffsetY = offsetY + el.y;
      for (const child of el.children ?? []) {
        emitDrawCalls(child, lines, indent, ir, activeBranch, childOffsetX, childOffsetY);
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

      let textExpr: string;
      if (el.isListSlot && el.name) {
        return; // List slots handled by the list loop below
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

      const textAlign = el.align ?? 'left';
      const absX = el.x + offsetX;
      const absY = el.y + offsetY;
      let drawX = absX;
      if (textAlign === 'center' && el.w > 0) {
        drawX = absX + Math.floor(el.w / 2);
      } else if (textAlign === 'right' && el.w > 0) {
        drawX = absX + el.w;
      }

      lines.push(`${indent}ctx.textAlign = '${textAlign}';`);
      lines.push(`${indent}ctx.fillText(${textExpr}, ${drawX}, ${absY});`);
      break;
    }

    case 'line': {
      const color = el.color ?? '#ffffff';
      const sw = el.strokeWidth || 1;
      if (el.y === el.y2!) {
        const left = Math.min(el.x, el.x2!) + offsetX;
        const w = Math.abs(el.x2! - el.x) || 1;
        lines.push(`${indent}ctx.fillStyle = '${color}';`);
        lines.push(`${indent}ctx.fillRect(${left}, ${el.y + offsetY}, ${w}, ${sw});`);
      } else if (el.x === el.x2!) {
        const top = Math.min(el.y, el.y2!) + offsetY;
        const h = Math.abs(el.y2! - el.y) || 1;
        lines.push(`${indent}ctx.fillStyle = '${color}';`);
        lines.push(`${indent}ctx.fillRect(${el.x + offsetX}, ${top}, ${sw}, ${h});`);
      }
      break;
    }

    case 'circle': {
      // Rocky.js fill() doesn't accept arc paths — use rockyFillRadial.
      const fill = el.fill ?? '#ffffff';
      const r = el.radius ?? 0;
      const cx = el.x + offsetX + r;
      const cy = el.y + offsetY + r;

      lines.push(`${indent}ctx.fillStyle = '${fill}';`);
      lines.push(`${indent}ctx.rockyFillRadial(${cx}, ${cy}, 0, ${r}, 0, 2 * Math.PI);`);
      break;
    }

    case 'path': {
      const pts = el.points ?? [];
      if (pts.length < 2) break;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of pts) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      const fill = el.fill ?? '#ffffff';
      lines.push(`${indent}ctx.fillStyle = '${fill}';`);
      lines.push(`${indent}ctx.fillRect(${el.x + offsetX + minX}, ${el.y + offsetY + minY}, ${maxX - minX}, ${maxY - minY});`);
      break;
    }

    case 'image': {
      // Rocky.js can't load bitmap resources on-watch; images come from PKJS
      // and are drawn via a host-provided _images[src].
      const src = el.src ?? '';
      const rotation = typeof el.rotation === 'number' ? el.rotation : 0;
      const pivotX = typeof el.pivotX === 'number' ? el.pivotX : Math.floor(el.w / 2);
      const pivotY = typeof el.pivotY === 'number' ? el.pivotY : Math.floor(el.h / 2);
      const absX = el.x + offsetX;
      const absY = el.y + offsetY;
      const centerX = absX + Math.floor(el.w / 2);
      const centerY = absY + Math.floor(el.h / 2);
      lines.push(`${indent}// image: ${src}${rotation ? ` (rotated ${rotation}°)` : ''}`);
      lines.push(`${indent}if (typeof _images !== 'undefined' && _images[${JSON.stringify(src)}]) {`);
      if (rotation !== 0) {
        lines.push(`${indent}  ctx.save();`);
        lines.push(`${indent}  ctx.translate(${centerX}, ${centerY});`);
        lines.push(`${indent}  ctx.rotate(${rotation} * Math.PI / 180);`);
        lines.push(`${indent}  ctx.translate(-${pivotX}, -${pivotY});`);
        lines.push(`${indent}  ctx.drawImage(_images[${JSON.stringify(src)}], 0, 0);`);
        lines.push(`${indent}  ctx.restore();`);
      } else {
        lines.push(`${indent}  ctx.drawImage(_images[${JSON.stringify(src)}], ${absX}, ${absY});`);
      }
      lines.push(`${indent}} else {`);
      lines.push(`${indent}  ctx.fillStyle = '#aaaaaa';`);
      lines.push(`${indent}  ctx.fillRect(${absX}, ${absY}, ${el.w}, ${el.h});`);
      lines.push(`${indent}}`);
      break;
    }
  }
}

function emitDrawCallsWithConditionals(
  el: IRElement,
  lines: string[],
  indent: string,
  ir: CompilerIR,
  offsetX = 0,
  offsetY = 0,
): void {
  if (el.type === 'root' || el.type === 'group') {
    const gx = offsetX + (el.x ?? 0);
    const gy = offsetY + (el.y ?? 0);
    for (let i = 0; i < (el.children ?? []).length; i++) {
      const child = el.children![i]!;
      const cond = ir.conditionalChildren.find(
        cc => cc.childIndex === i && cc.type === 'removed'
      );
      if (cond) {
        lines.push(`${indent}if (s${cond.stateSlot}) {`);
        emitDrawCalls(child, lines, indent + '  ', ir, undefined, gx, gy);
        lines.push(`${indent}}`);
      } else {
        emitDrawCalls(child, lines, indent, ir, undefined, gx, gy);
      }
    }
  } else {
    emitDrawCalls(el, lines, indent, ir, undefined, offsetX, offsetY);
  }
}

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
// Emission entry
// ---------------------------------------------------------------------------

function emitRocky(ir: CompilerIR): string {
  const lines: string[] = [];

  lines.push('// Auto-generated by react-pebble (Rocky.js backend for classic Pebble)');
  lines.push('//');
  lines.push('// Target: ' + ir.platform.name + ' (' + ir.platform.width + 'x' + ir.platform.height + ')');
  lines.push('');
  lines.push("var rocky = require('rocky');");
  lines.push('');

  if (ir.hasButtons && (ir.platform.name === 'basalt' || ir.platform.name === 'chalk')) {
    lines.push('// WARNING: Rocky.js on ' + ir.platform.name + ' does not support button events.');
    lines.push('// Interactive features (buttons, scrolling) will not work.');
    lines.push('');
    process.stderr.write(`WARNING: Rocky.js on ${ir.platform.name} does not support button events. This app uses buttons.\n`);
  }

  const needsTime = ir.hasTimeDeps;
  if (needsTime) {
    lines.push('function pad(n) { return n < 10 ? "0" + n : "" + n; }');
    lines.push('var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];');
    lines.push('var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];');
    lines.push('');
  }

  for (const slot of ir.stateSlots) {
    const v = slot.initialValue;
    if (v instanceof Date || (typeof v === 'object' && v !== null && !(Array.isArray(v)))) continue;
    lines.push(`var s${slot.index} = ${JSON.stringify(v)};`);
  }

  for (const [, dep] of ir.stateDeps) {
    if (dep.needsTime) {
      lines.push(`var _startTime_s${dep.slotIndex} = Date.now();`);
    }
  }

  if (ir.stateSlots.length > 0) lines.push('');

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

  if (ir.hasAnimatedElements) {
    for (const ae of ir.animatedElements) {
      lines.push(`var _kf_e${ae.elemIndex}_${ae.prop} = [${ae.keyframes.join(',')}];`);
    }
    lines.push('');
  }

  lines.push('rocky.on(\'draw\', function(event) {');
  lines.push('  var ctx = event.context;');

  if (needsTime) {
    lines.push('  var d = new Date();');
  }

  lines.push('');

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
    for (const el of ir.tree) {
      const drawLines: string[] = [];
      emitDrawCallsWithConditionals(el, drawLines, '  ', ir);
      lines.push(...drawLines);
    }
  } else {
    for (const el of ir.tree) {
      const drawLines: string[] = [];
      emitDrawCalls(el, drawLines, '  ', ir);
      lines.push(...drawLines);
    }
  }

  if (ir.hasList && ir.listInfo) {
    const li = ir.listInfo;
    const lpi = li.labelsPerItem;
    lines.push('');
    lines.push('  // List items');

    const listLabels = findListLabels(ir.tree);

    if (listLabels.length > 0) {
      const startExpr = li.scrollSlotIndex >= 0 ? `s${li.scrollSlotIndex}` : '0';
      lines.push(`  var _start = ${startExpr};`);
      lines.push(`  for (var _i = 0; _i < ${li.visibleCount}; _i++) {`);
      lines.push(`    var _item = _data[_start + _i];`);
      lines.push(`    if (_item !== undefined) {`);

      if (lpi > 1 && li.propertyOrder) {
        for (let j = 0; j < lpi; j++) {
          const label = listLabels[j];
          if (label) {
            const font = fontToRocky(label.font);
            const color = label.color ?? '#ffffff';
            const align = label.align ?? 'left';
            const prop = li.propertyOrder[j]!;
            const yOffset = label.y;
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

  if (ir.hasAnimatedElements) {
    lines.push('');
    lines.push('  // Note: animations use pre-computed keyframe tables');
    lines.push('  // Rocky.js redraws fully, so animated positions are computed inline above');
  }

  lines.push('});');
  lines.push('');

  if (needsTime) {
    // ir.timeGranularity is authoritative (analyzer honors explicit useTime(arg)).
    const event = `${ir.timeGranularity ?? 'minute'}change`;
    lines.push(`rocky.on('${event}', function(event) {`);
    lines.push('  rocky.requestDraw();');
    lines.push('});');
    lines.push('');
  }

  if (ir.messageInfo) {
    const key = ir.messageInfo.key;
    lines.push('// Phone → watch data (Rocky postMessage: native objects, no JSON.parse)');
    lines.push("rocky.on('message', function(event) {");
    lines.push('  var data = event.data;');
    lines.push(`  if (data && data['${key}'] !== undefined) {`);
    lines.push(`    _data = data['${key}'];`);

    if (ir.hasBranches) {
      for (const [si, branchList] of ir.branches) {
        if (branchList[0]?.isBaseline) {
          lines.push(`    s${si} = ${JSON.stringify(branchList[0].value)};`);
        }
      }
    }

    lines.push('    rocky.requestDraw();');
    lines.push('  }');
    lines.push('});');
    lines.push('');

    lines.push("rocky.postMessage({'ready': true});");
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Target Adapter
// ---------------------------------------------------------------------------

export const rockyTarget: Target = {
  name: 'rocky',

  validate(ir: CompilerIR): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const usage of ir.hooksUsed) {
      const reason = ROCKY_BLOCKED_HOOKS[usage.name];
      if (reason) {
        diagnostics.push({
          severity: 'error',
          hookName: usage.name,
          message: `${usage.name} is not supported on the Rocky.js target (no ${reason}).`,
        });
      }
    }
    return diagnostics;
  },

  emit(ir: CompilerIR, _ctx: TargetContext): TargetResult {
    const code = emitRocky(ir);
    const result: TargetResult = { code, diagnostics: [] };
    if (needsPKJS(ir)) {
      result.pkjsCode = buildPKJS({ ir, target: 'rocky' });
    }
    return result;
  },
};
