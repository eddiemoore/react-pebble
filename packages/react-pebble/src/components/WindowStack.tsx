import { h } from 'preact';
import { useContext, useCallback, useRef } from 'preact/hooks';
import { useState, useButton } from '../hooks/index.js';
import type { ReactNode } from './internal/preact-compat.js';
import {
  NavigationContext,
  type NavigationResult,
} from './internal/navigation-context.js';

export type { NavigationResult };

/**
 * Hook to access the navigation stack from within a WindowStack.
 */
export function useNavigation(): NavigationResult {
  const nav = useContext(NavigationContext);
  if (!nav) {
    // Fallback for components outside a WindowStack
    return {
      push: () => {},
      pop: () => {},
      replace: () => {},
      stackDepth: 1,
    };
  }
  return nav;
}

export interface WindowStackProps {
  initial: ReactNode;
}

/**
 * Multi-window navigation with push/pop/replace.
 * The back button automatically pops when stack depth > 1.
 */
export function WindowStack({ initial }: WindowStackProps) {
  const [stack, setStack] = useState<ReactNode[]>([initial]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const push = useCallback((element: ReactNode) => {
    setStack((s) => [...s, element]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback((element: ReactNode) => {
    setStack((s) => [...s.slice(0, -1), element]);
  }, []);

  // Back button auto-pops when stack has more than one window,
  // unless the top window defines its own onBack handler.
  useButton('back', () => {
    const s = stackRef.current;
    if (s.length > 1) {
      const top = s[s.length - 1];
      const onBack = top != null && typeof top === 'object' && 'props' in top
        ? (top as any).props?.onBack
        : undefined;
      if (typeof onBack === 'function') {
        onBack();
      } else {
        pop();
      }
    }
  });

  const nav: NavigationResult = {
    push,
    pop,
    replace,
    stackDepth: stack.length,
  };

  // Render only the top window, wrapped in navigation context
  const topWindow = stack[stack.length - 1];
  return h(NavigationContext.Provider, { value: nav }, topWindow);
}
