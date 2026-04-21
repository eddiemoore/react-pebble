import { React, type ReactNode } from './internal/preact-compat.js';
import { toArray } from './internal/to-array.js';
import type { PositionProps, SizeProps } from './internal/shared-types.js';

export interface GroupProps extends PositionProps, SizeProps {
  children?: ReactNode;
}

/**
 * Generic container with no automatic layout.
 *
 * Children with a `zIndex` prop are sorted so higher values render on top
 * (later in the Pebble layer tree = visually above).
 */
export function Group({ children, ...props }: GroupProps) {
  const arr = toArray(children);
  // If any child has a zIndex prop, sort by it (stable sort preserves
  // document order among equal zIndex values).
  const hasZIndex = arr.some(
    (c) => c && typeof c === 'object' && (c as { props?: Record<string, unknown> }).props?.zIndex != null,
  );
  const sorted = hasZIndex
    ? [...arr].sort((a, b) => {
        const az = (a && typeof a === 'object' ? (a as { props?: Record<string, unknown> }).props?.zIndex : undefined) as number | undefined;
        const bz = (b && typeof b === 'object' ? (b as { props?: Record<string, unknown> }).props?.zIndex : undefined) as number | undefined;
        return (az ?? 0) - (bz ?? 0);
      })
    : arr;
  return React.createElement('pbl-group', props, ...(sorted as ReactNode[]));
}
