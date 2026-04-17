import { useCallback } from 'preact/hooks';
import { useExitReason } from './useExitReason.js';
import { useNavigation } from '../components/WindowStack.js';

/**
 * Convenience hook for the Pebble "one-click action" pattern.
 * Returns a function that: runs an optional action callback, sets exit
 * reason to 'actionPerformed' (APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY),
 * and pops the window stack.
 */
export function useOneClickAction(): (action?: () => void) => void {
  const { setReason } = useExitReason();
  const { pop } = useNavigation();
  return useCallback(
    (action?: () => void) => {
      action?.();
      setReason('actionPerformed');
      pop();
    },
    [setReason, pop],
  );
}
