import { React } from './internal/preact-compat.js';
import type { ColorName } from './internal/shared-types.js';

export interface ActionBarProps {
  upIcon?: unknown;
  selectIcon?: unknown;
  downIcon?: unknown;
  backgroundColor?: ColorName;
}

export function ActionBar(props: ActionBarProps) {
  return React.createElement('pbl-actionbar', props);
}
