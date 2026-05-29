/**
 * ir-assembly.ts — Synthesis from perturbation observations to CompilerIR.
 *
 * Takes everything the Analyzer's perturbation engine harvested (state deps,
 * skin deps, animated elements, branches, the final tree, etc.) plus the
 * SourceScan result, and produces a typed CompilerIR. Convenience flags
 * (`hasX`) and per-element reactivity flags (`isStateDynamic`, `isTimeDynamic`,
 * `isSkinDynamic`, `isAnimated`, `isListSlot`) are reified here, not by a
 * second mutating walk after the IR is built.
 *
 * Pure with respect to globals and I/O — no file I/O, no globals, no Preact,
 * no Date mocking. Internally mutates the IRElement tree passed in (sets
 * names + reactivity flags inline via `reifyReactivityFlags`); the elements
 * are owned by this assembly pass once handed over. ADR 0006 records the
 * deferred pure-transform variant.
 *
 * See: docs/adr/0006-ir-assembly-extracted-from-analyzer.md
 */

import type {
  CompilerIR,
  IRAnimatedElement,
  IRBranch,
  IRButtonAction,
  IRConditionalChild,
  IRConfigInfo,
  IRElement,
  IRListInfo,
  IRMessageInfo,
  IRSkinDep,
  IRStateDep,
  IRStateSlot,
  IRTimeReactiveGraphic,
  TimeFormat,
  TimeGranularity,
} from '../compiler-ir.js';
import type { ScanResult } from './source-scan.js';
import type { PebblePlatform } from '../../src/platform.js';

/**
 * Everything the Analyzer's perturbation engine + SourceScan collected that
 * feeds the IR. Pure data — no functions, no mutable harness state.
 */
export interface IRAssemblyInput {
  platformSpec: PebblePlatform;
  scan: ScanResult;

  /** State slot metadata harvested via the useState interceptor. */
  stateSlots: ReadonlyArray<{ index: number; initialValue: unknown }>;

  /** Perturbation observations */
  stateDeps: Map<number, IRStateDep>;
  skinDeps: Map<number, IRSkinDep>;
  dynamicLabels: ReadonlySet<number>;
  labelFormats: Map<number, TimeFormat>;
  conditionalChildren: IRConditionalChild[];
  animatedElements: IRAnimatedElement[];
  timeReactiveGraphics: IRTimeReactiveGraphic[];
  branches: Map<number, IRBranch[]>;
  buttonActions: IRButtonAction[];

  /** Final tree from Pass 6 + the image resources it referenced. */
  finalTree: IRElement | null;
  imageResources: string[];

  /** List metadata that the scan can't know without perturbation. */
  listSlotLabels: Set<number>;
  listScrollSlotIndex: number;

  /** Message helper — captured at scan time but resolved here. */
  mockDataSource: string | null;

  /** Resolved explicit useTime() granularity (null when not present). */
  explicitGranularity: TimeGranularity | null;
}

/**
 * Derive the granularity that the watch needs to tick at, given the formats
 * the entry actually renders. `useTime(...)` argument is the override and
 * is resolved in the orchestrator (not here — file I/O does not belong in
 * pure assembly).
 */
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
  if (formats.some((f) => f === 'SS' || f === 'MMSS')) return 'second';
  if (formats.some((f) => f === 'HHMM')) return 'minute';
  if (formats.length > 0 && formats.every((f) => f === 'DATE')) return 'day';
  return 'minute';
}

/**
 * Walk a tree of IRElements and set per-element reactivity flags + names
 * inline. Mutates in place — the elements come from collectTree and are
 * owned by this assembly pass.
 */
function reifyReactivityFlags(
  elements: IRElement[],
  ctx: {
    listSlotLabels: Set<number>;
    listInfoRaw: ScanResult['list'];
    stateDeps: Map<number, IRStateDep>;
    dynamicLabels: ReadonlySet<number>;
    skinDeps: Map<number, IRSkinDep>;
    animatedElemIndices: Set<number>;
  },
): void {
  const orderedListSlots = [...ctx.listSlotLabels];
  for (const el of elements) {
    if (el.labelIndex !== undefined) {
      if (ctx.listSlotLabels.has(el.labelIndex)) {
        el.isListSlot = true;
        const flatIdx = orderedListSlots.indexOf(el.labelIndex);
        const lpi = ctx.listInfoRaw?.labelsPerItem ?? 1;
        const itemIdx = Math.floor(flatIdx / lpi);
        const labelIdx = flatIdx % lpi;
        el.name = lpi > 1 ? `ls${itemIdx}_${labelIdx}` : `ls${flatIdx}`;
      } else if (ctx.stateDeps.has(el.labelIndex)) {
        el.isStateDynamic = true;
        el.name = `sl${el.labelIndex}`;
      } else if (ctx.dynamicLabels.has(el.labelIndex)) {
        el.isTimeDynamic = true;
        el.name = `tl${el.labelIndex}`;
      }
    }
    if (el.rectIndex !== undefined && ctx.skinDeps.has(el.rectIndex)) {
      el.isSkinDynamic = true;
      el.name = `sr${el.rectIndex}`;
    }
    if (el.elemIndex !== undefined && ctx.animatedElemIndices.has(el.elemIndex)) {
      el.isAnimated = true;
      if (!el.name) el.name = `ae${el.elemIndex}`;
    }
    if (el.children) reifyReactivityFlags(el.children, ctx);
    // List group names depend on children having been named first.
    if (
      el.type === 'group' &&
      el.children &&
      ctx.listInfoRaw &&
      ctx.listInfoRaw.labelsPerItem > 1
    ) {
      const directListChildren = el.children.filter(
        (c) => c.isListSlot && c.name?.startsWith('ls'),
      );
      if (directListChildren.length > 0) {
        const m = directListChildren[0]!.name?.match(/^ls(\d+)/);
        if (m) el.listGroupName = `lg${m[1]}`;
      }
    }
  }
}

export function assembleIR(input: IRAssemblyInput): CompilerIR {
  const {
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
    imageResources,
    listSlotLabels,
    listScrollSlotIndex,
    mockDataSource,
    explicitGranularity,
  } = input;

  const listInfoRaw = scan.list;
  const messageInfoRaw = scan.message;
  const configInfoRaw = scan.config;

  const animatedElemIndices = new Set(animatedElements.map((a) => a.elemIndex));

  // -------------------------------------------------------------------------
  // Convenience flags
  // -------------------------------------------------------------------------
  const stateNeedsTime = [...stateDeps.values()].some((d) => d.needsTime);
  const hasAnimatedElements = animatedElements.length > 0;
  const hasTimeReactiveGraphics = timeReactiveGraphics.length > 0;
  const hasTimeDeps =
    dynamicLabels.size > 0 ||
    stateNeedsTime ||
    hasAnimatedElements ||
    hasTimeReactiveGraphics;

  const detectedGranularity = detectGranularity(
    labelFormats,
    hasAnimatedElements,
    hasTimeReactiveGraphics,
  );
  const timeGranularity: TimeGranularity | null = hasTimeDeps
    ? explicitGranularity ?? detectedGranularity ?? 'minute'
    : null;

  const hasStateDeps = stateDeps.size > 0;
  const hasButtons = buttonActions.length > 0;
  const hasBranches = branches.size > 0;
  const hasConditionals = conditionalChildren.length > 0 && !messageInfoRaw;
  const hasSkinDeps = skinDeps.size > 0;
  const hasList = listInfoRaw !== null && listSlotLabels.size > 0;

  // -------------------------------------------------------------------------
  // Sub-IR projections
  // -------------------------------------------------------------------------
  const irStateSlots: IRStateSlot[] = stateSlots.map((s) => ({
    index: s.index,
    initialValue: s.initialValue,
    type:
      typeof s.initialValue === 'number'
        ? 'number'
        : typeof s.initialValue === 'boolean'
          ? 'boolean'
          : typeof s.initialValue === 'string'
            ? 'string'
            : 'unknown',
  }));

  const irListInfo: IRListInfo | null =
    listInfoRaw && hasList ? { ...listInfoRaw, scrollSlotIndex: listScrollSlotIndex } : null;

  const irMessageInfo: IRMessageInfo | null = messageInfoRaw
    ? {
        key: messageInfoRaw.key,
        mockDataArrayName: messageInfoRaw.mockDataArrayName,
        mockDataSource,
      }
    : null;

  const irConfigInfo: IRConfigInfo | null = configInfoRaw
    ? {
        keys: configInfoRaw.keys,
        url: configInfoRaw.url,
        appName: configInfoRaw.appName,
        sectionTitles: configInfoRaw.sectionTitles,
      }
    : null;

  // -------------------------------------------------------------------------
  // Tree + reactivity flag reification
  // -------------------------------------------------------------------------
  const tree = finalTree ? [finalTree] : [];
  const reifyCtx = {
    listSlotLabels,
    listInfoRaw,
    stateDeps,
    dynamicLabels,
    skinDeps,
    animatedElemIndices,
  };
  reifyReactivityFlags(tree, reifyCtx);

  // Only flag baseline branch trees — perturbed branches have baked-in text
  // and don't need runtime references.
  for (const [, branchList] of branches) {
    for (const branch of branchList) {
      if (branch.isBaseline) reifyReactivityFlags(branch.tree, reifyCtx);
    }
  }

  // -------------------------------------------------------------------------
  // Final CompilerIR
  // -------------------------------------------------------------------------
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
    hasImages: imageResources.length > 0,
    imageResources,
    hooksUsed: scan.hooks,
  };
}
