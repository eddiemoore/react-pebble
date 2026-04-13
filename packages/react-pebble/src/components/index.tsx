/**
 * components/index.tsx — React component wrappers for Pebble primitives
 *
 * These provide a friendly JSX API that maps to the underlying
 * pbl-* element types the reconciler handles.
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import type { PebbleButtonHandler } from '../hooks/index.js';
import { useState, useButton, useLongButton, useDisplayBounds } from '../hooks/index.js';
import { createContext } from 'preact';
import { useContext, useCallback, useRef } from 'preact/hooks';

// Use Preact's `h` as a stand-in for `React.createElement` so we can keep
// the factory-based element construction that was in the react version.
const React = { createElement: h } as const;

// Unify ReactNode with Preact's ComponentChildren so we don't have to
// rename every prop type.
type ReactNode = ComponentChildren;

// ---------------------------------------------------------------------------
// Shared prop types
// ---------------------------------------------------------------------------

export interface PositionProps {
  x?: number;
  y?: number;
}

export interface SizeProps {
  w?: number;
  h?: number;
  /** Alias for `w`. */
  width?: number;
  /** Alias for `h`. */
  height?: number;
}

export interface ButtonHandlerProps {
  onUp?: PebbleButtonHandler;
  onDown?: PebbleButtonHandler;
  onSelect?: PebbleButtonHandler;
  onBack?: PebbleButtonHandler;
  onLongUp?: PebbleButtonHandler;
  onLongDown?: PebbleButtonHandler;
  onLongSelect?: PebbleButtonHandler;
}

export type ColorName =
  | 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'orange'
  | 'cyan' | 'magenta' | 'clear' | 'lightGray' | 'darkGray'
  // Pass-through for raw GColor / hex values
  | (string & {});

export type FontName =
  | 'gothic14' | 'gothic14Bold' | 'gothic18' | 'gothic18Bold'
  | 'gothic24' | 'gothic24Bold' | 'gothic28' | 'gothic28Bold'
  | 'bitham30Black' | 'bitham42Bold' | 'bitham42Light'
  | 'bitham34MediumNumbers' | 'bitham42MediumNumbers'
  | 'robotoCondensed21' | 'roboto21' | 'droid28'
  | 'leco20' | 'leco26' | 'leco28' | 'leco32' | 'leco36' | 'leco38' | 'leco42'
  | (string & {});

export type Alignment = 'left' | 'center' | 'right';

// ---------------------------------------------------------------------------
// JSX intrinsic element declarations for the pbl-* tags
// ---------------------------------------------------------------------------

declare module 'preact' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'pbl-root': IntrinsicPblProps;
      'pbl-rect': IntrinsicPblProps;
      'pbl-circle': IntrinsicPblProps;
      'pbl-text': IntrinsicPblProps;
      'pbl-line': IntrinsicPblProps;
      'pbl-image': IntrinsicPblProps;
      'pbl-group': IntrinsicPblProps;
      'pbl-statusbar': IntrinsicPblProps;
      'pbl-actionbar': IntrinsicPblProps;
      'pbl-path': IntrinsicPblProps;
      'pbl-scrollable': IntrinsicPblProps;
      'pbl-arc': IntrinsicPblProps;
      'pbl-textflow': IntrinsicPblProps;
    }
  }
}

interface IntrinsicPblProps {
  children?: ReactNode;
  // Loose escape hatch — wrappers below provide the typed surface.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export interface WindowProps extends ButtonHandlerProps {
  backgroundColor?: ColorName;
  fullscreen?: boolean;
  children?: ReactNode;
}

export function Window({ children, ...props }: WindowProps) {
  return React.createElement('pbl-group', props, children);
}

export interface BorderInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RectProps extends PositionProps, SizeProps {
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
  borderRadius?: number;
  /** Texture resource path for bitmap-based skins (tiled backgrounds, sprite sheets). */
  texture?: string;
  /** Horizontal variant index (for sprite sheet textures). */
  variant?: number;
  /** Border insets for nine-patch-style skins. */
  borders?: BorderInsets;
  /** Tile insets for repeating texture regions. */
  tiles?: BorderInsets;
  children?: ReactNode;
}

export function Rect({ children, ...props }: RectProps) {
  return React.createElement('pbl-rect', props, children);
}

export interface CircleProps extends PositionProps {
  r?: number;
  /** Alias for `r`. */
  radius?: number;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
}

export function Circle(props: CircleProps) {
  return React.createElement('pbl-circle', props);
}

export interface TextProps extends PositionProps, SizeProps {
  font?: FontName;
  color?: ColorName;
  align?: Alignment;
  children?: ReactNode;
}

export function Text({ children, ...props }: TextProps) {
  return React.createElement('pbl-text', props, children);
}

export interface LineProps extends PositionProps {
  x2?: number;
  y2?: number;
  color?: ColorName;
  strokeWidth?: number;
}

export function Line(props: LineProps) {
  return React.createElement('pbl-line', props);
}

export type CompositeOp = 'assign' | 'set' | 'and' | 'or' | 'clear';

export interface ImageProps extends PositionProps, SizeProps {
  /** Image file path (resolved at compile time). */
  src?: string;
  /** Raw bitmap object (runtime use only). */
  bitmap?: unknown;
  /** Rotation in radians. */
  rotation?: number;
  /** Scale factor (1 = original size). */
  scale?: number;
  /** Bitmap compositing mode for blending. */
  compositeOp?: CompositeOp;
  /** X pivot point for rotation (default: center of image). */
  pivotX?: number;
  /** Y pivot point for rotation (default: center of image). */
  pivotY?: number;
}

export function Image(props: ImageProps) {
  return React.createElement('pbl-image', props);
}

// ---------------------------------------------------------------------------
// SVGImage — PDC/vector graphics with transforms
// ---------------------------------------------------------------------------

export interface SVGImageProps extends PositionProps, SizeProps {
  /** PDC/SVG resource path (resolved at compile time). */
  src: string;
  /** Rotation in radians. */
  rotation?: number;
  /** Uniform scale factor (1 = original size). */
  scale?: number;
  /** Horizontal scale factor. */
  scaleX?: number;
  /** Vertical scale factor. */
  scaleY?: number;
  /** Horizontal translation offset. */
  translateX?: number;
  /** Vertical translation offset. */
  translateY?: number;
  /** Tint color for monochrome PDC images. */
  color?: ColorName;
}

/**
 * Renders a vector image (Pebble Draw Command / SVG) with optional transforms.
 *
 * On Alloy: emits as Piu SVGImage with rotation, scale, and translation.
 * In mock mode: renders a placeholder rectangle with the source label.
 */
export function SVGImage(props: SVGImageProps) {
  return React.createElement('pbl-svg', props);
}

// ---------------------------------------------------------------------------
// Canvas — custom Poco drawing via Piu Port
// ---------------------------------------------------------------------------

export interface CanvasDrawContext {
  /** Fill a rectangle. */
  fillRect: (color: string, x: number, y: number, w: number, h: number) => void;
  /** Draw text at a position. */
  drawText: (text: string, font: string, color: string, x: number, y: number) => void;
  /** Draw a line between two points. */
  drawLine: (color: string, x1: number, y1: number, x2: number, y2: number, thickness?: number) => void;
  /** Draw a filled circle. */
  drawCircle: (color: string, cx: number, cy: number, radius: number) => void;
  /** Draw a rounded rectangle. */
  drawRoundRect: (x: number, y: number, w: number, h: number, color: string, radius: number) => void;
  /** Measure the width of text in a given font. */
  getTextWidth: (text: string, font: string) => number;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
}

export interface CanvasProps extends PositionProps, SizeProps {
  /** Drawing callback — called with a context that provides Poco drawing methods. */
  onDraw: (ctx: CanvasDrawContext) => void;
  /** Redraw interval in milliseconds (for animated canvases). 0 = draw once. */
  interval?: number;
}

/**
 * Custom drawing surface using Piu Port + Poco graphics.
 *
 * This is the escape hatch for anything not covered by built-in components.
 * The `onDraw` callback receives a drawing context with methods like
 * `fillRect`, `drawText`, `drawCircle`, etc.
 *
 * On Alloy: compiles to a Piu Port with a Behavior containing `onDraw`.
 * In mock mode: calls `onDraw` with a wrapper around the PocoRenderer.
 */
export function Canvas(props: CanvasProps) {
  return React.createElement('pbl-canvas', props);
}

export interface GroupProps extends PositionProps, SizeProps {
  children?: ReactNode;
}

export function Group({ children, ...props }: GroupProps) {
  return React.createElement('pbl-group', props, children);
}

// ---------------------------------------------------------------------------
// Flow layout containers
// ---------------------------------------------------------------------------

export interface ColumnProps extends PositionProps, SizeProps {
  /** Gap between children in pixels (default 0). */
  gap?: number;
  children?: ReactNode;
}

/**
 * Stacks children vertically, auto-computing each child's `y` offset.
 * Children should specify `h` (or `height`) for correct stacking;
 * children without a height are given a default of 20px.
 */
export function Column({ x = 0, y = 0, gap = 0, children, ...props }: ColumnProps) {
  let offsetY = 0;
  const mapped = toArray(children).map((child, i) => {
    if (!child || typeof child !== 'object') return child;
    const vnode = child as { type: unknown; props: Record<string, unknown> };
    if (!vnode.type || !vnode.props) return child;
    const childH = (vnode.props.h ?? vnode.props.height ?? 20) as number;
    const el = React.createElement(
      vnode.type as string,
      { ...(vnode.props as object), y: offsetY, key: i },
    );
    offsetY += childH + gap;
    return el;
  });

  return React.createElement('pbl-group', { x, y, ...props }, ...(mapped as ReactNode[]));
}

export interface RowProps extends PositionProps, SizeProps {
  /** Gap between children in pixels (default 0). */
  gap?: number;
  children?: ReactNode;
}

/**
 * Stacks children horizontally, auto-computing each child's `x` offset.
 * Children should specify `w` (or `width`) for correct stacking;
 * children without a width are given a default of 40px.
 */
export function Row({ x = 0, y = 0, gap = 0, children, ...props }: RowProps) {
  let offsetX = 0;
  const mapped = toArray(children).map((child, i) => {
    if (!child || typeof child !== 'object') return child;
    const vnode = child as { type: unknown; props: Record<string, unknown> };
    if (!vnode.type || !vnode.props) return child;
    const childW = (vnode.props.w ?? vnode.props.width ?? 40) as number;
    const el = React.createElement(
      vnode.type as string,
      { ...(vnode.props as object), x: offsetX, key: i },
    );
    offsetX += childW + gap;
    return el;
  });

  return React.createElement('pbl-group', { x, y, ...props }, ...(mapped as ReactNode[]));
}

/** Flatten ComponentChildren into an array, filtering nulls. */
function toArray(children: ReactNode): unknown[] {
  if (children == null) return [];
  if (Array.isArray(children)) return children.filter(Boolean);
  return [children];
}

export interface StatusBarProps {
  color?: ColorName;
  backgroundColor?: ColorName;
  separator?: 'dotted' | 'line' | 'none';
}

export function StatusBar(props: StatusBarProps) {
  return React.createElement('pbl-statusbar', props);
}

export interface ActionBarProps {
  upIcon?: unknown;
  selectIcon?: unknown;
  downIcon?: unknown;
  backgroundColor?: ColorName;
}

export function ActionBar(props: ActionBarProps) {
  return React.createElement('pbl-actionbar', props);
}

// ---------------------------------------------------------------------------
// Convenience composites
// ---------------------------------------------------------------------------

export interface CardProps extends PositionProps {
  title: ReactNode;
  body?: ReactNode;
  titleFont?: FontName;
  bodyFont?: FontName;
  w?: number;
}

export function Card({
  title,
  body,
  titleFont,
  bodyFont,
  x = 0,
  y = 0,
  w = 144,
  ...props
}: CardProps) {
  const titleH = 28;
  const bodyY = titleH + 4;

  return React.createElement(
    'pbl-group',
    { x, y, ...props },
    React.createElement('pbl-rect', { x: 0, y: 0, w, h: titleH, fill: 'white' }),
    React.createElement(
      'pbl-text',
      {
        x: 4,
        y: 2,
        w: w - 8,
        h: titleH,
        font: titleFont ?? 'gothic18Bold',
        color: 'black',
      },
      title,
    ),
    body
      ? React.createElement(
          'pbl-text',
          {
            x: 4,
            y: bodyY,
            w: w - 8,
            h: 120,
            font: bodyFont ?? 'gothic14',
            color: 'white',
          },
          body,
        )
      : null,
  );
}

export interface BadgeProps extends PositionProps {
  r?: number;
  color?: ColorName;
  textColor?: ColorName;
  children?: ReactNode;
}

export function Badge({
  x = 0,
  y = 0,
  r = 12,
  color = 'red',
  textColor = 'white',
  children,
}: BadgeProps) {
  return React.createElement(
    'pbl-group',
    { x, y },
    React.createElement('pbl-circle', { x: 0, y: 0, r, fill: color }),
    React.createElement(
      'pbl-text',
      {
        x: 0,
        y: r - 8,
        w: r * 2,
        h: 16,
        font: 'gothic14Bold',
        color: textColor,
        align: 'center',
      },
      children,
    ),
  );
}

// ---------------------------------------------------------------------------
// Path — arbitrary polygon shapes
// ---------------------------------------------------------------------------

export interface PathProps extends PositionProps {
  /** Array of [x, y] coordinate pairs forming the polygon. */
  points: Array<[number, number]>;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
  /** Rotation in degrees around the centroid. */
  rotation?: number;
  /** Translation offset [dx, dy] applied after rotation. */
  offset?: [number, number];
}

export function Path(props: PathProps) {
  return React.createElement('pbl-path', props);
}

// ---------------------------------------------------------------------------
// Scrollable — clip-based scrolling container
// ---------------------------------------------------------------------------

export interface ScrollableProps extends PositionProps, SizeProps {
  /** Total content height (scrollable area). */
  contentHeight: number;
  /** Pixels to scroll per button press (default: 20). */
  scrollStep?: number;
  /** Show scroll indicators at top/bottom (default: true). */
  showIndicators?: boolean;
  children?: ReactNode;
}

export function Scrollable({
  x = 0,
  y = 0,
  w,
  h,
  width,
  height,
  contentHeight,
  scrollStep = 20,
  showIndicators = true,
  children,
}: ScrollableProps) {
  const viewW = w ?? width ?? 200;
  const viewH = h ?? height ?? 228;
  const maxOffset = Math.max(0, contentHeight - viewH);

  const [scrollOffset, setScrollOffset] = useState(0);

  useButton('down', () => {
    setScrollOffset((o) => Math.min(o + scrollStep, maxOffset));
  });
  useButton('up', () => {
    setScrollOffset((o) => Math.max(o - scrollStep, 0));
  });

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxOffset;

  return React.createElement(
    'pbl-group',
    { x, y },
    // Scrollable viewport with clip
    React.createElement(
      'pbl-scrollable',
      { x: 0, y: 0, w: viewW, h: viewH, scrollOffset },
      children,
    ),
    // Scroll indicators
    showIndicators && canScrollUp
      ? React.createElement('pbl-rect', { x: viewW / 2 - 10, y: 1, w: 20, h: 3, fill: 'white' })
      : null,
    showIndicators && canScrollDown
      ? React.createElement('pbl-rect', { x: viewW / 2 - 10, y: viewH - 4, w: 20, h: 3, fill: 'white' })
      : null,
  );
}

// ---------------------------------------------------------------------------
// MenuLayer — scrollable list with sections and selection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// NumberWindow — numeric input via buttons
// ---------------------------------------------------------------------------

export interface NumberWindowProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  initial?: number;
  onSelect?: (value: number) => void;
  onCancel?: () => void;
  backgroundColor?: ColorName;
  textColor?: ColorName;
}

export function NumberWindow({
  label,
  min = 0,
  max = 100,
  step = 1,
  initial = 0,
  onSelect,
  onCancel,
  backgroundColor = 'black',
  textColor = 'white',
}: NumberWindowProps) {
  const [value, setValue] = useState(Math.max(min, Math.min(max, initial)));

  useButton('up', () => {
    setValue((v) => Math.min(v + step, max));
  });
  useButton('down', () => {
    setValue((v) => Math.max(v - step, min));
  });
  useButton('select', () => {
    onSelect?.(value);
  });
  useButton('back', () => {
    onCancel?.();
  });

  return React.createElement(
    'pbl-group',
    { x: 0, y: 0 },
    // Background
    React.createElement('pbl-rect', { x: 0, y: 0, w: 200, h: 228, fill: backgroundColor }),
    // Label
    React.createElement('pbl-text', {
      x: 0, y: 40, w: 200, h: 28,
      font: 'gothic24Bold', color: textColor, align: 'center',
    }, label),
    // Value
    React.createElement('pbl-text', {
      x: 0, y: 85, w: 200, h: 50,
      font: 'bitham42Bold', color: textColor, align: 'center',
    }, String(value)),
    // Up arrow indicator
    React.createElement('pbl-text', {
      x: 0, y: 145, w: 200, h: 20,
      font: 'gothic18', color: 'darkGray', align: 'center',
    }, `\u25B2 / \u25BC`),
  );
}

// ---------------------------------------------------------------------------
// ActionMenu — multi-level action selection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Arc — circular arcs, pie slices, and donut/ring shapes
// ---------------------------------------------------------------------------

export interface ArcProps extends PositionProps {
  /** Outer radius */
  r: number;
  /** Inner radius (0 = pie slice, >0 = donut/ring) */
  innerR?: number;
  /** Start angle in degrees (0 = 12 o'clock / north, clockwise) */
  startAngle: number;
  /** End angle in degrees */
  endAngle: number;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
}

export function Arc(props: ArcProps) {
  return React.createElement('pbl-arc', props);
}

// ---------------------------------------------------------------------------
// TextFlow — text that flows around round display edges
// ---------------------------------------------------------------------------

export interface TextFlowProps extends PositionProps, SizeProps {
  font?: FontName;
  color?: ColorName;
  align?: Alignment;
  /** Enable flow around round display edges (default: true) */
  flowAroundDisplay?: boolean;
  children?: ReactNode;
}

export function TextFlow({ children, ...props }: TextFlowProps) {
  return React.createElement('pbl-textflow', { flowAroundDisplay: true, ...props }, children);
}

// ---------------------------------------------------------------------------
// RoundSafeArea — auto-insets children on round displays
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SimpleMenu — flat list menu without manual section setup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// WindowStack — multi-window push/pop navigation
// ---------------------------------------------------------------------------

export interface NavigationResult {
  push: (element: ReactNode) => void;
  pop: () => void;
  replace: (element: ReactNode) => void;
  stackDepth: number;
}

const NavigationContext = createContext<NavigationResult | null>(null);

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

  // Back button auto-pops when stack has more than one window
  useButton('back', () => {
    if (stackRef.current.length > 1) {
      pop();
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

// ---------------------------------------------------------------------------
// AnimatedImage — frame sequence animation
// ---------------------------------------------------------------------------

export interface AnimatedImageProps extends PositionProps, SizeProps {
  /** Array of bitmap frame references */
  frames: unknown[];
  /** Frames per second (default: 10) */
  fps?: number;
  /** Loop the animation (default: true) */
  loop?: boolean;
}

/**
 * Displays an animated sequence of bitmap frames.
 * Uses a timer to cycle through frames at the given FPS.
 */
export function AnimatedImage({
  frames,
  fps = 10,
  loop = true,
  ...posProps
}: AnimatedImageProps) {
  const [frameIdx, setFrameIdx] = useState(0);

  // Advance frames using a simple interval
  // (useInterval is available but to avoid circular imports, use raw effect)
  const frameRef = useRef(frameIdx);
  frameRef.current = frameIdx;

  // Manual interval using the available hooks system
  useState(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Timer) {
      const T = (globalThis as Record<string, unknown>).Timer as {
        repeat?: (callback: () => void, interval: number) => number;
      };
      T.repeat?.(() => {
        setFrameIdx((i) => {
          const next = i + 1;
          if (next >= frames.length) return loop ? 0 : i;
          return next;
        });
      }, Math.round(1000 / fps));
    }
    return 0;
  });

  const currentFrame = frames[frameIdx];
  return React.createElement('pbl-image', { ...posProps, bitmap: currentFrame });
}
