/**
 * react-pebble — A React renderer for Pebble Alloy (Moddable XS / Poco).
 *
 * Usage on Alloy:
 *   import Poco from 'commodetto/Poco';
 *   import React from 'react';
 *   import { render, Group, Rect, Text } from 'react-pebble';
 *   import { useTime } from 'react-pebble/hooks';
 *
 *   function WatchFace() {
 *     const time = useTime();
 *     return (
 *       <Group>
 *         <Rect x={0} y={0} w={200} h={228} fill="black" />
 *         <Text x={0} y={90} w={200} font="bitham42Bold" color="white" align="center">
 *           {time.getHours()}:{time.getMinutes().toString().padStart(2, '0')}
 *         </Text>
 *       </Group>
 *     );
 *   }
 *
 *   render(<WatchFace />, { poco: Poco });
 */

// Platform / screen dimensions
export { SCREEN, PLATFORMS, _setPlatform } from './platform.js';
export type { PebblePlatform } from './platform.js';

// Core render API
export { render } from './pebble-render.js';
export type {
  PebbleApp,
  PebblePlatformInfo,
  RenderOptions,
  RenderOptionsExt,
  DrawCall,
} from './pebble-render.js';

// Component wrappers
export {
  Window,
  Rect,
  Circle,
  Text,
  Line,
  Image,
  Group,
  StatusBar,
  ActionBar,
  Card,
  Badge,
} from './components/index.js';
export type {
  WindowProps,
  RectProps,
  CircleProps,
  TextProps,
  LineProps,
  ImageProps,
  GroupProps,
  StatusBarProps,
  ActionBarProps,
  CardProps,
  BadgeProps,
  PositionProps,
  SizeProps,
  ButtonHandlerProps,
  ColorName,
  FontName,
  Alignment,
} from './components/index.js';

// Hooks
export {
  useApp,
  useButton,
  useLongButton,
  useTime,
  useFormattedTime,
  useInterval,
  useListNavigation,
  ButtonRegistry,
  PebbleAppContext,
} from './hooks/index.js';
export type {
  PebbleButton,
  PebbleButtonHandler,
  ListNavigationOptions,
  ListNavigationResult,
} from './hooks/index.js';

// Low-level access (for advanced usage / custom renderers / tests)
export { default as reconciler } from './pebble-reconciler.js';
export {
  ELEMENT_TYPES,
  appendChildNode,
  createNode,
  createTextNode,
  findRoot,
  getTextContent,
  insertBeforeNode,
  removeChildNode,
  setAttribute,
  setTextNodeValue,
  walkTree,
} from './pebble-dom.js';
export type {
  AnyNode,
  DOMElement,
  ElementType,
  NodeProps,
  TextNode,
  Visitor,
} from './pebble-dom.js';
export {
  PocoRenderer,
  COLOR_PALETTE,
  FONT_PALETTE,
  resolveColorName,
  resolveFontName,
} from './pebble-output.js';
export type {
  RGB,
  FontSpec,
  RenderOptions as PocoRenderOptions,
} from './pebble-output.js';
