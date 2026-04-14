import { React, type ReactNode } from './internal/preact-compat.js';
import { useState, useButton, useLongButton } from '../hooks/index.js';
import type {
  ColorName,
  PositionProps,
  SizeProps,
} from './internal/shared-types.js';

export interface MenuItem {
  title: string;
  subtitle?: string;
  icon?: unknown;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export interface MenuLayerProps extends PositionProps, SizeProps {
  sections: MenuSection[];
  onSelect?: (section: number, item: number) => void;
  onLongSelect?: (section: number, item: number) => void;
  highlightColor?: ColorName;
  backgroundColor?: ColorName;
  textColor?: ColorName;
  highlightTextColor?: ColorName;
  rowHeight?: number;
  headerHeight?: number;
}

export function MenuLayer({
  x = 0,
  y = 0,
  w,
  h,
  width,
  height,
  sections,
  onSelect,
  onLongSelect,
  highlightColor = 'white',
  backgroundColor = 'black',
  textColor = 'white',
  highlightTextColor = 'black',
  rowHeight = 36,
  headerHeight = 24,
}: MenuLayerProps) {
  const viewW = w ?? width ?? 200;
  const viewH = h ?? height ?? 228;

  // Flatten sections into a linear list of entries for navigation
  type Entry =
    | { kind: 'header'; section: number; title: string }
    | { kind: 'item'; section: number; item: number; data: MenuItem };

  const entries: Entry[] = [];
  const itemEntryIndices: number[] = [];  // indices into entries that are items

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s]!;
    if (sec.title) {
      entries.push({ kind: 'header', section: s, title: sec.title });
    }
    for (let i = 0; i < sec.items.length; i++) {
      itemEntryIndices.push(entries.length);
      entries.push({ kind: 'item', section: s, item: i, data: sec.items[i]! });
    }
  }

  const [selectedIdx, setSelectedIdx] = useState(0);

  useButton('down', () => {
    setSelectedIdx((i) => Math.min(i + 1, itemEntryIndices.length - 1));
  });
  useButton('up', () => {
    setSelectedIdx((i) => Math.max(i - 1, 0));
  });
  useButton('select', () => {
    const entryIdx = itemEntryIndices[selectedIdx];
    if (entryIdx !== undefined) {
      const entry = entries[entryIdx]!;
      if (entry.kind === 'item' && onSelect) {
        onSelect(entry.section, entry.item);
      }
    }
  });
  useLongButton('select', () => {
    const entryIdx = itemEntryIndices[selectedIdx];
    if (entryIdx !== undefined) {
      const entry = entries[entryIdx]!;
      if (entry.kind === 'item' && onLongSelect) {
        onLongSelect(entry.section, entry.item);
      }
    }
  });

  // Compute content height
  let totalHeight = 0;
  for (const entry of entries) {
    totalHeight += entry.kind === 'header' ? headerHeight : rowHeight;
  }

  // Compute scroll offset to keep selected item visible
  let selectedEntryTop = 0;
  const selectedEntryIdx = itemEntryIndices[selectedIdx] ?? 0;
  for (let i = 0; i < selectedEntryIdx; i++) {
    selectedEntryTop += entries[i]!.kind === 'header' ? headerHeight : rowHeight;
  }
  const selectedEntryH = rowHeight;

  // Ensure selected item is within viewport
  const [scrollOffset, setScrollOffset] = useState(0);
  let newScroll = scrollOffset;
  if (selectedEntryTop < newScroll) {
    newScroll = selectedEntryTop;
  }
  if (selectedEntryTop + selectedEntryH > newScroll + viewH) {
    newScroll = selectedEntryTop + selectedEntryH - viewH;
  }
  if (newScroll !== scrollOffset) {
    // Schedule scroll update for next render
    setTimeout(() => setScrollOffset(newScroll), 0);
  }

  // Build row elements
  let rowY = 0;
  let itemIdx = 0;
  const elements: unknown[] = [];

  for (const entry of entries) {
    if (entry.kind === 'header') {
      elements.push(
        React.createElement('pbl-rect', {
          x: 0, y: rowY, w: viewW, h: headerHeight,
          fill: 'darkGray', key: `h-${entry.section}`,
        }),
        React.createElement('pbl-text', {
          x: 4, y: rowY + 2, w: viewW - 8, h: headerHeight,
          font: 'gothic14Bold', color: 'white',
          key: `ht-${entry.section}`,
        }, entry.title),
      );
      rowY += headerHeight;
    } else {
      const isSelected = itemIdx === selectedIdx;
      const bgColor = isSelected ? highlightColor : backgroundColor;
      const fgColor = isSelected ? highlightTextColor : textColor;

      elements.push(
        React.createElement('pbl-rect', {
          x: 0, y: rowY, w: viewW, h: rowHeight,
          fill: bgColor, key: `r-${entry.section}-${entry.item}`,
        }),
        React.createElement('pbl-text', {
          x: 8, y: rowY + (entry.data.subtitle ? 2 : 8), w: viewW - 16, h: 20,
          font: 'gothic18Bold', color: fgColor,
          key: `t-${entry.section}-${entry.item}`,
        }, entry.data.title),
      );

      if (entry.data.subtitle) {
        elements.push(
          React.createElement('pbl-text', {
            x: 8, y: rowY + 20, w: viewW - 16, h: 16,
            font: 'gothic14', color: fgColor,
            key: `s-${entry.section}-${entry.item}`,
          }, entry.data.subtitle),
        );
      }

      rowY += rowHeight;
      itemIdx++;
    }
  }

  return React.createElement(
    'pbl-group',
    { x, y },
    React.createElement(
      'pbl-scrollable',
      { x: 0, y: 0, w: viewW, h: viewH, scrollOffset: newScroll },
      ...(elements as ReactNode[]),
    ),
  );
}
