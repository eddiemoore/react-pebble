import { useCallback } from 'preact/hooks';
import { useState } from './internal/use-state.js';
import { useButton } from './useButton.js';

export interface ListNavigationOptions {
  wrap?: boolean;
}

export interface ListNavigationResult<T> {
  index: number;
  item: T | undefined;
  next: () => void;
  prev: () => void;
  setIndex: (index: number) => void;
}

export function useListNavigation<T>(
  items: readonly T[],
  options: ListNavigationOptions = {},
): ListNavigationResult<T> {
  const { wrap = false } = options;
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= items.length - 1) return wrap ? 0 : i;
      return i + 1;
    });
  }, [items.length, wrap]);

  const prev = useCallback(() => {
    setIndex((i) => {
      if (i <= 0) return wrap ? items.length - 1 : i;
      return i - 1;
    });
  }, [items.length, wrap]);

  useButton('down', next);
  useButton('up', prev);

  return {
    index,
    item: items[index],
    next,
    prev,
    setIndex,
  };
}
