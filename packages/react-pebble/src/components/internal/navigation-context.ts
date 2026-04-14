/**
 * Shared navigation context used by `WindowStack` (provider) and
 * `useNavigation` (consumer). Kept in `internal/` so both can import it
 * without a circular dependency.
 */

import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';

export interface NavigationResult {
  push: (element: ComponentChildren) => void;
  pop: () => void;
  replace: (element: ComponentChildren) => void;
  stackDepth: number;
}

export const NavigationContext = createContext<NavigationResult | null>(null);
