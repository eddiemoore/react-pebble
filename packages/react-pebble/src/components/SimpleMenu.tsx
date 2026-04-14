import { React } from './internal/preact-compat.js';
import { MenuLayer, type MenuSection } from './MenuLayer.js';
import type { ColorName } from './internal/shared-types.js';

export interface SimpleMenuItem {
  title: string;
  subtitle?: string;
  icon?: string;
  onSelect?: () => void;
}

export interface SimpleMenuProps {
  items: SimpleMenuItem[];
  backgroundColor?: ColorName;
  highlightColor?: ColorName;
}

/**
 * A simpler menu for quick selection without custom row rendering.
 * Wraps MenuLayer with a single auto-generated section.
 */
export function SimpleMenu({
  items,
  backgroundColor = 'black',
  highlightColor = 'white',
}: SimpleMenuProps) {
  const section: MenuSection = {
    items: items.map((item) => ({
      title: item.title,
      subtitle: item.subtitle,
    })),
  };

  return React.createElement(MenuLayer, {
    sections: [section],
    backgroundColor,
    highlightColor,
    onSelect: (_s: number, i: number) => {
      items[i]?.onSelect?.();
    },
  });
}
