import { React, type ReactNode } from './internal/preact-compat.js';
import { useDisplayBounds } from '../hooks/index.js';

export interface RoundSafeAreaProps {
  padding?: number;
  children?: ReactNode;
}

/**
 * Wrapper that automatically insets children to avoid clipping on
 * round displays. On rectangular displays, renders with zero inset.
 */
export function RoundSafeArea({ padding = 0, children }: RoundSafeAreaProps) {
  const bounds = useDisplayBounds(padding);
  return React.createElement(
    'pbl-group',
    { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
    children,
  );
}
