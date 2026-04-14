/**
 * components/index.tsx — barrel re-export for react-pebble components.
 *
 * Each component lives in its own file under `src/components/<Name>.tsx`.
 * Shared helpers (prop types, `toArray`, the Preact `React.createElement`
 * alias, the pbl-* JSX intrinsic declarations, and the navigation context)
 * live under `src/components/internal/`.
 *
 * Add new components by creating a new file and adding a re-export here.
 * Internal helpers used only by components should not be re-exported.
 *
 * The side-effect import below applies the `declare module 'preact'` JSX
 * augmentation so the underlying `pbl-*` element tags are recognised
 * anywhere the components barrel is imported.
 */

import './internal/jsx-intrinsics.js';

// Shared prop types (publicly re-exported for backwards compatibility)
export type {
  PositionProps,
  SizeProps,
  ButtonHandlerProps,
  ColorName,
  FontName,
  Alignment,
  CompositeOp,
  BorderInsets,
} from './internal/shared-types.js';

// Layout primitives
export { Window, type WindowProps } from './Window.js';
export { Rect, type RectProps } from './Rect.js';
export { Circle, type CircleProps } from './Circle.js';
export { Text, type TextProps } from './Text.js';
export { Line, type LineProps } from './Line.js';
export { Image, type ImageProps } from './Image.js';
export { SVGImage, type SVGImageProps } from './SVGImage.js';
export { Canvas, type CanvasProps, type CanvasDrawContext } from './Canvas.js';
export { Group, type GroupProps } from './Group.js';

// Flow layout containers
export { Column, type ColumnProps } from './Column.js';
export { Row, type RowProps } from './Row.js';

// Bars
export { StatusBar, type StatusBarProps } from './StatusBar.js';
export { ActionBar, type ActionBarProps } from './ActionBar.js';

// Convenience composites
export { Card, type CardProps } from './Card.js';
export { Badge, type BadgeProps } from './Badge.js';
export { Path, type PathProps } from './Path.js';
export { Scrollable, type ScrollableProps } from './Scrollable.js';
export {
  MenuLayer,
  type MenuItem,
  type MenuSection,
  type MenuLayerProps,
} from './MenuLayer.js';
export { NumberWindow, type NumberWindowProps } from './NumberWindow.js';
export {
  ActionMenu,
  type ActionMenuItem,
  type ActionMenuProps,
} from './ActionMenu.js';
export { Arc, type ArcProps } from './Arc.js';
export { TextFlow, type TextFlowProps } from './TextFlow.js';
export { RoundSafeArea, type RoundSafeAreaProps } from './RoundSafeArea.js';
export {
  SimpleMenu,
  type SimpleMenuItem,
  type SimpleMenuProps,
} from './SimpleMenu.js';

// Navigation
export {
  WindowStack,
  useNavigation,
  type WindowStackProps,
  type NavigationResult,
} from './WindowStack.js';

// Animation
export { AnimatedImage, type AnimatedImageProps } from './AnimatedImage.js';
