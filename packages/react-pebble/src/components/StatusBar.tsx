import { React } from './internal/preact-compat.js';
import type { ColorName } from './internal/shared-types.js';

export interface StatusBarProps {
  color?: ColorName;
  backgroundColor?: ColorName;
  separator?: 'dotted' | 'line' | 'none';
}

export function StatusBar(props: StatusBarProps) {
  return React.createElement('pbl-statusbar', props);
}
