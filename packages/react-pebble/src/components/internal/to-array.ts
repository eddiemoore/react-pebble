import type { ReactNode } from './preact-compat.js';

/** Flatten ComponentChildren into an array, filtering nulls. */
export function toArray(children: ReactNode): unknown[] {
  if (children == null) return [];
  if (Array.isArray(children)) return children.filter(Boolean);
  return [children];
}
