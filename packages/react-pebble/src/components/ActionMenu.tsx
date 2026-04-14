import { React } from './internal/preact-compat.js';
import { useState, useButton } from '../hooks/index.js';
import { MenuLayer, type MenuSection } from './MenuLayer.js';
import type { ColorName } from './internal/shared-types.js';

export interface ActionMenuItem {
  label: string;
  action?: () => void;
  children?: ActionMenuItem[];
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  backgroundColor?: ColorName;
  highlightColor?: ColorName;
  onClose?: () => void;
}

export function ActionMenu({
  items,
  backgroundColor = 'black',
  highlightColor = 'white',
  onClose,
}: ActionMenuProps) {
  const [menuStack, setMenuStack] = useState<ActionMenuItem[][]>([items]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const currentItems = menuStack[menuStack.length - 1] ?? items;

  useButton('down', () => {
    setSelectedIdx((i) => Math.min(i + 1, currentItems.length - 1));
  });
  useButton('up', () => {
    setSelectedIdx((i) => Math.max(i - 1, 0));
  });
  useButton('select', () => {
    const item = currentItems[selectedIdx];
    if (!item) return;
    if (item.children && item.children.length > 0) {
      setMenuStack((s) => [...s, item.children!]);
      setSelectedIdx(0);
    } else {
      item.action?.();
    }
  });
  useButton('back', () => {
    if (menuStack.length > 1) {
      setMenuStack((s) => s.slice(0, -1));
      setSelectedIdx(0);
    } else {
      onClose?.();
    }
  });

  // Build as a simple MenuLayer with a single section
  const section: MenuSection = {
    items: currentItems.map((item) => ({
      title: item.label,
      subtitle: item.children ? `${item.children.length} items \u25B6` : undefined,
    })),
  };

  return React.createElement(MenuLayer, {
    sections: [section],
    highlightColor,
    backgroundColor,
    onSelect: (_s: number, i: number) => {
      const item = currentItems[i];
      if (!item) return;
      if (item.children && item.children.length > 0) {
        setMenuStack((s) => [...s, item.children!]);
        setSelectedIdx(0);
      } else {
        item.action?.();
      }
    },
  });
}
