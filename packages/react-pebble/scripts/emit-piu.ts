/**
 * scripts/emit-piu.ts — piu (Moddable/Alloy) code generation backend.
 *
 * Consumes a CompilerIR and produces piu Application.template JS code
 * for Pebble Alloy devices (emery/gabbro).
 */

import type { CompilerIR, IRElement, TimeFormat } from './compiler-ir.js';
import { colorToHex } from './analyze.js';

// ---------------------------------------------------------------------------
// Font mapping
// ---------------------------------------------------------------------------

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

function fontToPiu(name: string | undefined): string {
  if (!name) return '18px Gothic';
  const mapped = FONT_TO_PIU[name];
  if (mapped) return mapped;
  // Already a piu-style string like "18px Gothic" or "bold 14px Roboto"?
  if (/^(bold\s|light\s|black\s)?\d+px\s+\S/.test(name)) return name;
  // Unknown family — likely a Pebble C resource name (ROBOTO_24 etc.) that
  // isn't wired into the Moddable manifest. Piu renders nothing for unknown
  // families, so fall back to Gothic at a size derived from trailing digits
  // (e.g. ROBOTO_24 → 24px) and warn the user.
  const sizeMatch = name.match(/(\d+)$/);
  const size = sizeMatch ? sizeMatch[1] : '18';
  process.stderr.write(
    `warning: alloy target has no Moddable manifest integration for custom fonts — "${name}" falls back to ${size}px Gothic\n`,
  );
  return `${size}px Gothic`;
}

// ---------------------------------------------------------------------------
// Emit context (piu-specific: skins, styles, declarations)
// ---------------------------------------------------------------------------

interface EmitContext {
  skins: Map<string, string>;
  styles: Map<string, string>;
  textures: Map<string, { texVar: string; skinVar: string }>;
  declarations: string[];
  skinIdx: number;
  styleIdx: number;
  textureIdx: number;
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
  const hex = colorToHex(color);
  const key = `${font}|${hex}`;
  const existing = ctx.styles.get(key);
  if (existing) return existing;
  const name = `st${ctx.styleIdx++}`;
  ctx.styles.set(key, name);
  ctx.declarations.push(
    `const ${name} = new Style({ font: "${fontToPiu(font)}", color: "${hex}" });`,
  );
  return name;
}

function ensureTexture(ctx: EmitContext, src: string, w: number, h: number): { texVar: string; skinVar: string } {
  const existing = ctx.textures.get(src);
  if (existing) return existing;
  const texVar = `tex${ctx.textureIdx}`;
  const skinVar = `tsk${ctx.textureIdx}`;
  ctx.textureIdx++;
  const resourceName = src.replace(/^.*\//, '');
  ctx.declarations.push(`const ${texVar} = new Texture("${resourceName}");`);
  ctx.declarations.push(`const ${skinVar} = new Skin({ texture: ${texVar}, x: 0, y: 0, width: ${w}, height: ${h} });`);
  ctx.textures.set(src, { texVar, skinVar });
  return { texVar, skinVar };
}

function buildSizeProps(x: number, y: number, w: number, h: number, screenW: number, screenH: number): string {
  const parts: string[] = [];

  // Negative w/h is the analyzer's "fill parent" sentinel for containers
  // (pbl-root, pbl-group, pbl-scrollable, pbl-textflow) without explicit
  // dimensions. w === 0 is left as-is because it's a legitimate runtime
  // value (e.g. the baseline frame of an animated width).
  if (w < 0 || (w >= screenW && x === 0)) {
    parts.push('left: 0', 'right: 0');
  } else {
    if (x !== 0) parts.push(`left: ${x}`);
    else parts.push('left: 0');
    parts.push(`width: ${w}`);
  }

  if (h < 0 || (h >= screenH && y === 0)) {
    parts.push('top: 0', 'bottom: 0');
  } else {
    parts.push(`top: ${y}`);
    parts.push(`height: ${h}`);
  }

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Emit piu tree from IR elements
// ---------------------------------------------------------------------------

function emitIRNode(
  el: IRElement,
  ctx: EmitContext,
  indent: string,
  ir: CompilerIR,
  conditionalDepth: number,
): string | null {
  switch (el.type) {
    case 'root': {
      const kids = (el.children ?? [])
        .map(c => emitIRNode(c, ctx, indent + '  ', ir, conditionalDepth))
        .filter(Boolean);
      return kids.join(',\n');
    }

    case 'group': {
      const depth = conditionalDepth + 1;
      const kids = (el.children ?? [])
        .map((c, childIdx) => {
          const emitted = emitIRNode(c, ctx, indent + '  ', ir, depth);
          if (!emitted) return null;

          // Wrap per-subtree conditionals
          if (ir.hasConditionals && depth === 1) {
            const cond = ir.conditionalChildren.find(
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

      const x = el.x;
      const y = el.y;
      const layout = (x === 0 && y === 0)
        ? 'left: 0, right: 0, top: 0, bottom: 0, '
        : `left: ${x}, right: 0, top: ${y}, `;

      let groupNameProp = '';
      if (el.listGroupName) {
        groupNameProp = `name: "${el.listGroupName}", `;
      }

      return `${indent}new Container(null, { ${groupNameProp}${layout}contents: [\n${kids.join(',\n')}\n${indent}] })`;
    }

    case 'rect': {
      const nameProp = el.name ? `, name: "${el.name}"` : '';
      const sizeProps = buildSizeProps(el.x, el.y, el.w, el.h, ir.platform.width, ir.platform.height);

      // Determine skin: texture-based or color-based
      let skinVar: string;
      if (el.texture) {
        // Texture-based skin with optional borders/tiles/variant
        const tex = ensureTexture(ctx, el.texture, el.w, el.h);
        // If borders or tiles are specified, create an extended texture skin
        if (el.borders || el.tiles) {
          const extSkinVar = `tsk_ext${ctx.textureIdx++}`;
          const bordersStr = el.borders
            ? `, borders: { left: ${el.borders.left}, right: ${el.borders.right}, top: ${el.borders.top}, bottom: ${el.borders.bottom} }`
            : '';
          const tilesStr = el.tiles
            ? `, tiles: { left: ${el.tiles.left}, right: ${el.tiles.right}, top: ${el.tiles.top}, bottom: ${el.tiles.bottom} }`
            : '';
          const variantStr = el.variant ? `, variants: ${el.variant}` : '';
          ctx.declarations.push(
            `const ${extSkinVar} = new Skin({ texture: ${tex.texVar}, x: 0, y: 0, width: ${el.w}, height: ${el.h}${bordersStr}${tilesStr}${variantStr} });`
          );
          skinVar = extSkinVar;
        } else {
          skinVar = tex.skinVar;
        }
      } else {
        skinVar = ensureSkin(ctx, el.fill ?? '#000000');
      }

      const kids = (el.children ?? [])
        .map(c => emitIRNode(c, ctx, indent + '  ', ir, conditionalDepth))
        .filter(Boolean);
      if (kids.length > 0) {
        return `${indent}new Container(null, { ${sizeProps}, skin: ${skinVar}${nameProp}, contents: [\n${kids.join(',\n')}\n${indent}] })`;
      }
      return `${indent}new Content(null, { ${sizeProps}, skin: ${skinVar}${nameProp} })`;
    }

    case 'text': {
      const text = el.text ?? '';
      const styleVar = ensureStyle(ctx, el.font ?? 'gothic18', el.color ?? '#ffffff');
      const posProps: string[] = [`top: ${el.y}`];
      posProps.push(`left: ${el.x}`);
      if (el.w > 0) posProps.push(`width: ${el.w}`);
      const horizProp = el.align && el.align !== 'left' ? `, horizontal: "${el.align}"` : '';
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const nameProp = el.name ? `, name: "${el.name}"` : '';

      // Use piu Text for wrapping multi-line text, Label for single-line
      if (el.isWrapping) {
        const heightProp = el.h > 0 ? `, height: ${el.h}` : '';
        return `${indent}new Text(null, { ${posProps.join(', ')}${heightProp}, style: ${styleVar}${horizProp}${nameProp}, string: "${escaped}" })`;
      }
      return `${indent}new Label(null, { ${posProps.join(', ')}, style: ${styleVar}${horizProp}${nameProp}, string: "${escaped}" })`;
    }

    case 'line': {
      const color = el.color ?? '#ffffff';
      const skinVar = ensureSkin(ctx, color);
      const sw = el.strokeWidth || 1;
      const x1 = el.x, y1 = el.y, x2 = el.x2!, y2 = el.y2!;

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

    case 'circle': {
      const fill = el.fill!;
      const skinVar = ensureSkin(ctx, fill);
      const r = el.radius!;
      const size = r * 2;
      const animName = el.name ? `, name: "${el.name}"` : '';
      return `${indent}new RoundRect(null, { left: ${el.x}, top: ${el.y}, width: ${size}, height: ${size}, radius: ${r}, skin: ${skinVar}${animName} })`;
    }

    case 'path': {
      // Path/polygon: emit as bounding-box Content (piu doesn't support native paths)
      const pts = el.points ?? [];
      if (pts.length < 2) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of pts) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      const fill = el.fill ?? '#ffffff';
      const skinVar = ensureSkin(ctx, fill);
      const bx = el.x + minX;
      const by = el.y + minY;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const sizeProps = buildSizeProps(bx, by, bw, bh, ir.platform.width, ir.platform.height);
      return `${indent}new Content(null, { ${sizeProps}, skin: ${skinVar} })`;
    }

    case 'arc': {
      // Arc rendering via piu Port with drawSkin scanline fill.
      const r = el.radius ?? 40;
      const innerR = el.innerRadius ?? 0;
      const startAngle = el.startAngle ?? 0;
      const endAngle = el.endAngle ?? 360;
      const size = r * 2;
      const fillHex = el.fill;
      const strokeHex = el.stroke;
      const sw = el.strokeWidth ?? 1;

      const behaviorName = `_ab${ctx.declarations.length}`;
      const fillSkinVar = fillHex ? ensureSkin(ctx, fillHex) : null;
      const strokeSkinVar = strokeHex ? ensureSkin(ctx, strokeHex) : null;

      const lines: string[] = [];
      lines.push(`class ${behaviorName} extends Behavior {`);
      lines.push(`  onDraw(port, x, y, w, h) {`);
      lines.push(`    const cx = ${r}, cy = ${r}, oR = ${r}, iR = ${innerR};`);
      lines.push(`    const sA = ${startAngle}, eA = ${endAngle};`);
      lines.push(`    const rSq = oR * oR, iSq = iR * iR;`);
      if (fillSkinVar) {
        lines.push(`    for (let dy = -oR; dy <= oR; dy++) {`);
        lines.push(`      let ss = -1, sp = false;`);
        lines.push(`      for (let dx = -oR; dx <= oR; dx++) {`);
        lines.push(`        const d = dx*dx + dy*dy;`);
        lines.push(`        if (d <= rSq && d >= iSq) {`);
        lines.push(`          const a = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;`);
        lines.push(`          const s = ((sA%360)+360)%360, e = ((eA%360)+360)%360;`);
        lines.push(`          const ok = s<=e ? (a>=s&&a<=e) : (a>=s||a<=e);`);
        lines.push(`          if (ok) { if (!sp) { ss = cx+dx; sp = true; } }`);
        lines.push(`          else if (sp) { port.drawSkin(${fillSkinVar}, ss, cy+dy, (cx+dx)-ss, 1); sp = false; }`);
        lines.push(`        } else if (sp) { port.drawSkin(${fillSkinVar}, ss, cy+dy, (cx+dx)-ss, 1); sp = false; }`);
        lines.push(`      }`);
        lines.push(`      if (sp) port.drawSkin(${fillSkinVar}, ss, cy+dy, (cx+oR+1)-ss, 1);`);
        lines.push(`    }`);
      }
      if (strokeSkinVar) {
        lines.push(`    const steps = Math.max(Math.round(2*Math.PI*oR*2), 60);`);
        lines.push(`    const sR = (sA-90)*Math.PI/180, eR = (eA-90)*Math.PI/180;`);
        lines.push(`    let tR = eR - sR; if (tR<=0) tR += 2*Math.PI;`);
        lines.push(`    for (let i=0; i<=steps; i++) {`);
        lines.push(`      const r = sR + (i/steps)*tR;`);
        lines.push(`      port.drawSkin(${strokeSkinVar}, Math.round(cx+oR*Math.cos(r)), Math.round(cy+oR*Math.sin(r)), ${sw}, ${sw});`);
        lines.push(`    }`);
      }
      lines.push(`  }`);
      lines.push(`}`);
      ctx.declarations.push(...lines);

      return `${indent}new Port(null, { left: ${el.x}, top: ${el.y}, width: ${size}, height: ${size}, Behavior: ${behaviorName} })`;
    }

    case 'image': {
      // Moddable's piu `Texture` only decodes PNG/JPEG; APNG and PDC-sequence
      // fall back to a static `.png` sibling with the same basename. Warn so
      // the user provides the fallback (or builds with the `c` target where
      // native animation is supported).
      let src = el.src!;
      if (el.animated && /\.(apng|pdcs)$/i.test(src)) {
        src = src.replace(/\.(apng|pdcs)$/i, '.png');
        process.stderr.write(
          `warning: alloy target can't decode animated ${el.animated} — falling back to ${src.replace(/^.*\//, '')} (first-frame PNG sibling)\n`,
        );
      }
      const { skinVar } = ensureTexture(ctx, src, el.w, el.h);
      const sizeProps = buildSizeProps(el.x, el.y, el.w, el.h, ir.platform.width, ir.platform.height);
      const nameProp = el.name ? `, name: "${el.name}"` : '';

      // Rotation support: Piu Content nodes accept `rotation` (radians).
      // The IR stores degrees; convert to radians for the emitted code.
      const extraProps: string[] = [];
      if (el.rotation) {
        const rad = (el.rotation * Math.PI) / 180;
        extraProps.push(`rotation: ${rad}`);
      }
      if (el.pivotX != null) extraProps.push(`anchor: { x: ${el.pivotX}, y: ${el.pivotY ?? (el.h / 2)} }`);
      else if (el.pivotY != null) extraProps.push(`anchor: { x: ${el.w / 2}, y: ${el.pivotY} }`);
      const extraStr = extraProps.length > 0 ? `, ${extraProps.join(', ')}` : '';

      return `${indent}new Content(null, { ${sizeProps}, skin: ${skinVar}${nameProp}${extraStr} })`;
    }

    case 'svg': {
      // SVGImage — Piu vector graphics with transforms
      const src = el.src ?? '';
      const resourceName = src.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
      const sizeProps = buildSizeProps(el.x, el.y, el.w, el.h, ir.platform.width, ir.platform.height);
      const nameProp = el.name ? `, name: "${el.name}"` : '';

      // Build SVGImage options
      const svgOpts: string[] = [];
      if (el.rotation) svgOpts.push(`r: ${el.rotation}`);
      if (el.svgScale && el.svgScale !== 1) svgOpts.push(`s: ${el.svgScale}`);
      if (el.svgScaleX && el.svgScaleX !== 1) svgOpts.push(`sx: ${el.svgScaleX}`);
      if (el.svgScaleY && el.svgScaleY !== 1) svgOpts.push(`sy: ${el.svgScaleY}`);
      if (el.svgTranslateX) svgOpts.push(`tx: ${el.svgTranslateX}`);
      if (el.svgTranslateY) svgOpts.push(`ty: ${el.svgTranslateY}`);
      if (el.w) svgOpts.push(`width: ${el.w}`);
      if (el.h) svgOpts.push(`height: ${el.h}`);

      const optsStr = svgOpts.length > 0 ? `, { ${svgOpts.join(', ')} }` : '';
      ctx.declarations.push(`import ${resourceName}_pdc from "./${resourceName}-image";`);

      return `${indent}new SVGImage(${resourceName}_pdc${optsStr}, { ${sizeProps}${nameProp} })`;
    }

    case 'canvas': {
      // Canvas → Piu Port with empty Behavior (the onDraw callback is runtime-only
      // and cannot be compiled ahead-of-time since it contains arbitrary JS).
      // In compiled mode, Canvas emits a Port placeholder that users can populate
      // with a Behavior at runtime.
      const sizeProps = buildSizeProps(el.x, el.y, el.w, el.h, ir.platform.width, ir.platform.height);
      const nameProp = el.name ? `, name: "${el.name}"` : '';
      return `${indent}new Port(null, { ${sizeProps}${nameProp} })`;
    }

    default:
      return null;
  }
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
// Main entry point
// ---------------------------------------------------------------------------

export function emitPiu(ir: CompilerIR, exampleName?: string): string {
  const ctx: EmitContext = {
    skins: new Map(),
    styles: new Map(),
    textures: new Map(),
    declarations: [],
    skinIdx: 0,
    styleIdx: 0,
    textureIdx: 0,
  };

  const hasBehavior = ir.hasTimeDeps || ir.hasStateDeps || ir.hasButtons ||
    ir.hasBranches || ir.hasSkinDeps || ir.hasList || ir.hasConditionals;

  // Build contents: either branched or single tree
  // (tree walk registers skins/styles in order; skin deps are registered after)
  let contents: string;
  if (ir.hasBranches && ir.branches.size > 0) {
    const branchLines: string[] = [];
    for (const [si, branchList] of ir.branches) {
      for (let bi = 0; bi < branchList.length; bi++) {
        const branch = branchList[bi]!;
        const name = `br_s${si}_v${bi}`;
        const visible = ir.messageInfo ? !branch.isBaseline : branch.isBaseline;

        // Emit branch tree
        const branchContent = branch.tree
          .map(el => emitIRNode(el, ctx, '      ', ir, 0))
          .filter(Boolean)
          .join(',\n');

        branchLines.push(
          `    new Container(null, { name: "${name}", visible: ${visible}, left: 0, right: 0, top: 0, bottom: 0, contents: [\n${branchContent}\n    ] })`,
        );
      }
    }
    contents = branchLines.join(',\n');
  } else {
    const treeContent = ir.tree
      .map(el => emitIRNode(el, ctx, '    ', ir, 0))
      .filter(Boolean)
      .join(',\n');
    contents = treeContent || '    /* empty */';
  }

  // Pre-register skin deps so declarations are complete before output
  for (const [, dep] of ir.skinDeps) {
    ensureSkin(ctx, dep.skins[0]);
    ensureSkin(ctx, dep.skins[1]);
  }

  // --- Build output ---
  const lines: string[] = [
    '// Auto-generated by react-pebble compile-to-piu (v3 with state reactivity)',
    exampleName ? `// Source: examples/${exampleName}.tsx rendered in Node mock mode.` : '//',
    '//',
    '// Regenerate: npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js',
    '',
    'import {} from "piu/MC";',
    ir.hasButtons ? 'import PebbleButton from "pebble/button";' : '',
    ir.messageInfo ? 'import Message from "pebble/message";' : '',
    '',
  ];

  lines.push(
    ...ctx.declarations,
    '',
    `const bgSkin = new Skin({ fill: "${colorToHex('black')}" });`,
    '',
  );

  // Keyframe arrays
  if (ir.hasAnimatedElements) {
    for (const ae of ir.animatedElements) {
      lines.push(`const _kf_e${ae.elemIndex}_${ae.prop} = [${ae.keyframes.join(',')}];`);
    }
    lines.push('');
  }

  // Time helpers
  if (ir.hasTimeDeps) {
    lines.push('function pad(n) { return n < 10 ? "0" + n : "" + n; }');
    lines.push(
      'const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];',
      'const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];',
    );
    lines.push('');
  }

  // Data arrays
  if (ir.messageInfo) {
    lines.push('let _data = [];');
    lines.push('');
  }
  if (ir.hasList && !ir.messageInfo) {
    const li = ir.listInfo!;
    if (li.dataArrayObjects) {
      lines.push(`const _data = ${JSON.stringify(li.dataArrayObjects)};`);
    } else if (li.dataArrayValues) {
      lines.push(`const _data = ${JSON.stringify(li.dataArrayValues)};`);
    }
    lines.push('');
  }

  // AppBehavior
  if (hasBehavior) {
    lines.push('class AppBehavior extends Behavior {');
    lines.push('  onCreate(app) {');

    if (ir.hasBranches) {
      const firstSlot = [...ir.branches.keys()][0]!;
      const baselineIdx = ir.branches.get(firstSlot)![0]?.isBaseline ? 0 : 1;
      lines.push(`    const c = app.content("br_s${firstSlot}_v${baselineIdx}").first;`);
    } else {
      lines.push('    const c = app.first;');
    }

    // State fields
    for (const slot of ir.stateSlots) {
      const v = slot.initialValue;
      if (v instanceof Date || (typeof v === 'object' && v !== null && !(Array.isArray(v)))) continue;
      lines.push(`    this.s${slot.index} = ${JSON.stringify(v)};`);
    }

    // Elapsed-time start markers
    for (const [, dep] of ir.stateDeps) {
      if (dep.needsTime) {
        lines.push(`    this._startTime_s${dep.slotIndex} = Date.now();`);
      }
    }

    // Time label refs
    for (const [idx] of ir.timeDeps) {
      lines.push(`    this.tl${idx} = c.content("tl${idx}");`);
    }

    // State label refs
    for (const [idx] of ir.stateDeps) {
      lines.push(`    this.sl${idx} = c.content("sl${idx}");`);
    }

    // Skin-reactive rect refs
    for (const [rIdx] of ir.skinDeps) {
      lines.push(`    this.sr${rIdx} = c.content("sr${rIdx}");`);
    }

    // Animated element refs
    const animElemIndices = [...new Set(ir.animatedElements.map(a => a.elemIndex))];
    for (const eIdx of animElemIndices) {
      lines.push(`    this.ae${eIdx} = c.content("ae${eIdx}");`);
    }

    // Branch refs
    for (const [si, branchList] of ir.branches) {
      for (let bi = 0; bi < branchList.length; bi++) {
        lines.push(`    this.br_s${si}_v${bi} = app.content("br_s${si}_v${bi}");`);
      }
    }

    // Conditional refs
    if (ir.hasConditionals) for (const cc of ir.conditionalChildren) {
      if (cc.type === 'removed') {
        const name = `cv_s${cc.stateSlot}_${cc.childIndex}`;
        lines.push(`    this.${name} = c.content("${name}");`);
      }
    }

    // List slot refs
    if (ir.hasList) {
      const li = ir.listInfo!;
      const lpi = li.labelsPerItem;
      lines.push(`    this._ls = [];`);
      for (let i = 0; i < li.visibleCount; i++) {
        if (lpi > 1) {
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
    if (!ir.messageInfo) {
      lines.push('    this.refresh();');
    }
    if (ir.hasTimeDeps) {
      const g = ir.timeGranularity ?? 'minute';
      // Bind listener once per behavior instance; store on `this` so
      // onUndisplaying can removeEventListener with the exact same reference.
      lines.push(`    this._tick = () => this.onTimeChanged();`);
      lines.push(`    watch.addEventListener('${g}change', this._tick);`);
    }
    if (ir.hasButtons) {
      const usedButtons = [...new Set(ir.buttonActions.map(b => b.button))];
      for (const btn of usedButtons) {
        lines.push(`    new PebbleButton({ type: "${btn}", onPush: (pushed, name) => { if (pushed) this.onButton({ button: name }); } });`);
      }
    }
    if (ir.messageInfo) {
      const mi = ir.messageInfo;
      lines.push(`    const self = this;`);
      lines.push(`    new Message({`);
      lines.push(`      keys: ["${mi.key}"],`);
      lines.push(`      onReadable() {`);
      lines.push(`        const map = this.read();`);
      lines.push(`        const json = map.get("${mi.key}");`);
      lines.push(`        if (json) {`);
      lines.push(`          try {`);
      lines.push(`            _data = JSON.parse(json);`);

      if (ir.branches.size > 0) {
        for (const [si, branchList] of ir.branches) {
          for (let bi = 0; bi < branchList.length; bi++) {
            lines.push(`            self.br_s${si}_v${bi}.visible = ${bi === 0 ? 'true' : 'false'};`);
          }
        }
      }

      const contentRoot = ir.branches.size > 0
        ? `self.br_s${[...ir.branches.keys()][0]}_v0.first`
        : 'app.first';

      if (ir.listInfo && ir.listInfo.labelsPerItem > 1) {
        const li = ir.listInfo;
        lines.push(`            const c = ${contentRoot};`);
        for (let i = 0; i < li.visibleCount; i++) {
          lines.push(`            const g${i} = c.content("lg${i}");`);
          for (let j = 0; j < li.labelsPerItem; j++) {
            const accessor = li.propertyOrder ? `_data[${i}].${li.propertyOrder[j]}` : `Object.values(_data[${i}] || {})[${j}]`;
            lines.push(`            if (g${i}) { const l = g${i}.content("ls${i}_${j}"); if (l) l.string = _data[${i}] ? ${accessor} || "" : ""; }`);
          }
        }
      } else if (ir.listInfo) {
        lines.push(`            const c = ${contentRoot};`);
        for (let i = 0; i < ir.listInfo.visibleCount; i++) {
          lines.push(`            const l${i} = c.content("ls${i}"); if (l${i}) l${i}.string = _data[${i}] || "";`);
        }
      } else {
        for (const cc of ir.conditionalChildren) {
          if (cc.type === 'removed') {
            const name = `cv_s${cc.stateSlot}_${cc.childIndex}`;
            lines.push(`            if (self.${name}) self.${name}.visible = true;`);
          }
        }
        for (const [idx, dep] of ir.stateDeps) {
          lines.push(`            if (self.sl${idx}) self.sl${idx}.string = JSON.stringify(_data);`);
        }
      }

      lines.push(`          } catch (e) { console.log("Parse error: " + e.message); }`);
      lines.push(`        }`);
      lines.push(`      }`);
      lines.push(`    });`);
    }
    lines.push('  }');

    // onTimeChanged
    if (ir.hasTimeDeps) {
      lines.push('  onTimeChanged() {');
      lines.push('    this.refresh();');
      lines.push('  }');
    }

    // onUndisplaying — remove the watch listener so we don't leak across
    // Application rebuilds (watchface Applications are long-lived in
    // practice; this is defensive).
    if (ir.hasTimeDeps) {
      const g = ir.timeGranularity ?? 'minute';
      lines.push('  onUndisplaying(app) {');
      lines.push(`    if (this._tick) watch.removeEventListener('${g}change', this._tick);`);
      lines.push('  }');
    }

    // onButton
    if (ir.hasButtons) {
      lines.push('  onButton(e) {');
      lines.push('    const name = e && e.button;');
      for (const { button, action } of ir.buttonActions) {
        const cond = `name === "${button}"`;
        let stmt: string;
        const isListScroll = ir.hasList && ir.listInfo && action.slotIndex === ir.listInfo.scrollSlotIndex;

        switch (action.type) {
          case 'increment':
            if (isListScroll) {
              stmt = `this.s${action.slotIndex} = Math.min(_data.length - ${ir.listInfo!.visibleCount}, this.s${action.slotIndex} + ${action.value}); this.refresh();`;
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
            const needsElapsed = [...ir.stateDeps.values()].some(d => d.slotIndex === action.slotIndex && d.needsTime);
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
    if (ir.hasTimeDeps) {
      lines.push('    const d = new Date();');
    }
    for (const [idx, fmt] of ir.timeDeps) {
      lines.push(`    if (this.tl${idx}) this.tl${idx}.string = ${emitTimeExpr(fmt)};`);
    }
    for (const [idx, dep] of ir.stateDeps) {
      lines.push(`    if (this.sl${idx}) this.sl${idx}.string = ${dep.formatExpr};`);
    }
    for (const [rIdx, dep] of ir.skinDeps) {
      const baseSkinVar = ensureSkin(ctx, dep.skins[0]);
      const pertSkinVar = ensureSkin(ctx, dep.skins[1]);
      const slot = ir.stateSlots.find(s => s.index === dep.slotIndex);
      if (slot?.type === 'boolean') {
        lines.push(`    if (this.sr${rIdx}) this.sr${rIdx}.skin = this.s${dep.slotIndex} ? ${pertSkinVar} : ${baseSkinVar};`);
      } else {
        lines.push(`    if (this.sr${rIdx}) this.sr${rIdx}.skin = (this.s${dep.slotIndex} !== ${JSON.stringify(slot?.initialValue)}) ? ${pertSkinVar} : ${baseSkinVar};`);
      }
    }
    if (ir.hasConditionals) for (const cc of ir.conditionalChildren) {
      if (cc.type === 'removed') {
        const name = `cv_s${cc.stateSlot}_${cc.childIndex}`;
        lines.push(`    this.${name}.visible = !!this.s${cc.stateSlot};`);
      }
    }
    for (const [si, branchList] of ir.branches) {
      for (let bi = 0; bi < branchList.length; bi++) {
        const branch = branchList[bi]!;
        const cond = `this.s${si} === ${JSON.stringify(branch.value)}`;
        lines.push(`    this.br_s${si}_v${bi}.visible = (${cond});`);
      }
    }
    if (ir.hasList && ir.listInfo && ir.listInfo.scrollSlotIndex >= 0) {
      const li = ir.listInfo;
      const lpi = li.labelsPerItem;
      lines.push(`    const _start = this.s${li.scrollSlotIndex};`);
      lines.push(`    for (let _i = 0; _i < ${li.visibleCount}; _i++) {`);
      lines.push(`      const _item = _data[_start + _i];`);
      if (lpi > 1 && li.propertyOrder) {
        lines.push(`      const _slot = this._ls[_i];`);
        lines.push(`      if (_slot) {`);
        for (let j = 0; j < lpi; j++) {
          const prop = li.propertyOrder[j]!;
          lines.push(`        _slot[${j}].string = _item ? _item.${prop} : "";`);
          lines.push(`        _slot[${j}].visible = !!_item;`);
        }
        lines.push(`      }`);
      } else {
        lines.push(`      if (this._ls[_i]) {`);
        lines.push(`        this._ls[_i].string = _item !== undefined ? "" + _item : "";`);
        lines.push(`        this._ls[_i].visible = (_item !== undefined);`);
        lines.push(`      }`);
      }
      lines.push(`    }`);
    }
    if (ir.hasAnimatedElements) {
      lines.push('    const _s = d.getSeconds();');
      for (const ae of ir.animatedElements) {
        const propMap: Record<string, string> = { top: 'y', width: 'width', height: 'height', radius: 'radius' };
        const piuProp = propMap[ae.prop] ?? ae.prop;
        lines.push(`    this.ae${ae.elemIndex}.${piuProp} = _kf_e${ae.elemIndex}_${ae.prop}[_s];`);
      }
    }
    lines.push('  }');

    // refreshList
    if (ir.messageInfo && ir.listInfo) {
      const li = ir.listInfo;
      const lpi = li.labelsPerItem;
      lines.push('  refreshList() {');
      lines.push(`    for (let i = 0; i < ${li.visibleCount}; i++) {`);
      lines.push(`      const item = _data[i];`);
      if (lpi > 1 && li.propertyOrder) {
        lines.push(`      const slot = this._ls[i];`);
        lines.push(`      if (slot) {`);
        for (let j = 0; j < lpi; j++) {
          const prop = li.propertyOrder[j]!;
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
    contents,
    '  ],',
    '}));',
    '',
    'export default new WatchApp(null, { touchCount: 0, pixels: screen.width * 4 });',
    '',
  );

  return lines.join('\n');
}
