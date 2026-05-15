/**
 * scripts/targets/index.ts — Target registry.
 *
 * Maps target name → Adapter. The orchestrator looks up an Adapter here
 * and never branches on target. Adding a fourth Target = add an Adapter
 * file and one line in this map.
 */

import { piuTarget } from './piu.js';
import { rockyTarget } from './rocky.js';
import { cTarget } from './c.js';
import type { Target, TargetName } from './types.js';

export const targets: Record<TargetName, Target> = {
  alloy: piuTarget,
  rocky: rockyTarget,
  c: cTarget,
};

export function getTarget(name: string): Target {
  if (name in targets) {
    return targets[name as TargetName];
  }
  throw new Error(`Unknown compile target: ${name}. Valid: ${Object.keys(targets).join(', ')}`);
}

export type { Target, TargetName, TargetContext, TargetResult, Diagnostic } from './types.js';
