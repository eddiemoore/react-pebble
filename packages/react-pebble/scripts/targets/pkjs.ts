/**
 * scripts/targets/pkjs.ts — Shared PKJS sub-output helper.
 *
 * PKJS is a sub-output of each Target (see ADR-0002). This module is the
 * shared implementation each Adapter calls when its IR demands phone-side
 * code (useMessage, useConfiguration, timeline hooks, identity tokens).
 *
 * It also owns the config-page → data URI rendering that used to live inline
 * in the orchestrator — Locality with the rest of PKJS generation.
 */

import type { CompilerIR, IRConfigKey } from '../compiler-ir.js';
import { emitPKJS } from '../emit-pkjs.js';
import {
  ConfigPage,
  ConfigSection,
  ConfigColor,
  ConfigToggle,
  ConfigText,
  configPageToDataUri,
} from '../../src/config/index.js';
import type { TargetName } from './types.js';

/** Hook names that require PKJS to be emitted even without messageInfo/configInfo. */
const PKJS_REQUIRING_HOOKS = new Set([
  'useAccountToken',
  'useWatchToken',
  'useTimelineToken',
  'useTimeline',
  'useTimelineSubscriptions',
]);

/** Does this IR require a PKJS sub-output? */
export function needsPKJS(ir: CompilerIR): boolean {
  if (ir.messageInfo) return true;
  if (ir.configInfo) return true;
  return ir.hooksUsed.some((u) => PKJS_REQUIRING_HOOKS.has(u.name));
}

/**
 * Build PKJS sub-output for a Target.
 *
 * Resolves the config-page data URI (if the app declares `useConfiguration`)
 * and delegates code generation to `emitPKJS`.
 */
export function buildPKJS(args: {
  ir: CompilerIR;
  target: TargetName;
}): string {
  const { ir, target } = args;
  const configUrl = ir.configInfo?.url ? renderConfigDataUri(ir) : undefined;
  const hooksUsed = [...new Set(ir.hooksUsed.map((u) => u.name))];
  return emitPKJS({ ir, configUrl, hooksUsed, target });
}

function renderConfigDataUri(ir: CompilerIR): string | undefined {
  if (!ir.configInfo) return undefined;

  const sectionTitles = ir.configInfo.sectionTitles.length > 0
    ? ir.configInfo.sectionTitles
    : ['Settings'];

  const colorKeys = ir.configInfo.keys.filter((k) => k.type === 'color');
  const otherKeys = ir.configInfo.keys.filter((k) => k.type !== 'color');

  const makeItem = (k: IRConfigKey) => {
    switch (k.type) {
      case 'color': return ConfigColor(k.key, k.label, String(k.default));
      case 'boolean': return ConfigToggle(k.key, k.label, k.default as boolean);
      case 'string': return ConfigText(k.key, k.label, String(k.default));
      default: return ConfigText(k.key, k.label, String(k.default));
    }
  };

  const sections =
    sectionTitles.length >= 2 && colorKeys.length > 0 && otherKeys.length > 0
      ? [
          ConfigSection(sectionTitles[0]!, colorKeys.map(makeItem)),
          ConfigSection(sectionTitles[1]!, otherKeys.map(makeItem)),
        ]
      : [ConfigSection(sectionTitles[0]!, ir.configInfo.keys.map(makeItem))];

  const spec = ConfigPage(sections, {
    appName: ir.configInfo.appName ?? undefined,
  });
  return configPageToDataUri(spec);
}
