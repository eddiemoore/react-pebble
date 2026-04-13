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
  AppExitReason,
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
  Column,
  Row,
  StatusBar,
  ActionBar,
  Card,
  Badge,
  Path,
  Scrollable,
  MenuLayer,
  NumberWindow,
  ActionMenu,
  Arc,
  TextFlow,
  RoundSafeArea,
  SimpleMenu,
  WindowStack,
  useNavigation,
  AnimatedImage,
  SVGImage,
  Canvas,
} from './components/index.js';
export type {
  WindowProps,
  RectProps,
  CircleProps,
  TextProps,
  LineProps,
  ImageProps,
  GroupProps,
  ColumnProps,
  RowProps,
  StatusBarProps,
  ActionBarProps,
  CardProps,
  BadgeProps,
  PathProps,
  ScrollableProps,
  MenuItem,
  MenuSection,
  MenuLayerProps,
  NumberWindowProps,
  ActionMenuItem,
  ActionMenuProps,
  PositionProps,
  SizeProps,
  ButtonHandlerProps,
  ColorName,
  FontName,
  Alignment,
  ArcProps,
  TextFlowProps,
  RoundSafeAreaProps,
  SimpleMenuItem,
  SimpleMenuProps,
  WindowStackProps,
  NavigationResult,
  AnimatedImageProps,
  CompositeOp,
  SVGImageProps,
  CanvasProps,
  CanvasDrawContext,
  BorderInsets,
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
  useBattery,
  useConnection,
  useLocalStorage,
  useFetch,
  useAnimation,
  useAccelerometer,
  useCompass,
  useWebSocket,
  useKVStorage,
  useVibration,
  useLight,
  useHealth,
  useTimer,
  useWatchInfo,
  useLocale,
  useUnobstructedArea,
  useMultiClick,
  useRepeatClick,
  useWakeup,
  useDictation,
  useAnimationSequence,
  useAnimationSpawn,
  useDataLogging,
  useAppGlance,
  useTimeline,
  useQuietTime,
  useAppFocus,
  useContentSize,
  useDisplayBounds,
  useConfiguration,
  useAppSync,
  pebbleLog,
  useLocation,
  useLaunchReason,
  useFileStorage,
  useHTTPClient,
  usePreferredResultDuration,
  Easing,
  lerp,
  polarPoint,
  degreesToRadians,
  radiansToDegrees,
  angleBetweenPoints,
  sinLookup,
  cosLookup,
  atan2Lookup,
  TRIG_MAX_ANGLE,
  ButtonRegistry,
  PebbleAppContext,
} from './hooks/index.js';
export type {
  PebbleButton,
  PebbleButtonHandler,
  ListNavigationOptions,
  ListNavigationResult,
  BatteryState,
  ConnectionState,
  UseFetchOptions,
  UseFetchResult,
  UseAnimationOptions,
  UseAnimationResult,
  EasingFn,
  AccelerometerData,
  UseAccelerometerOptions,
  CompassData,
  UseWebSocketResult,
  UseVibrationResult,
  UseLightResult,
  HealthData,
  UseTimerResult,
  WatchInfo,
  LocaleInfo,
  UnobstructedArea,
  MultiClickOptions,
  RepeatClickOptions,
  UseWakeupResult,
  DictationStatus,
  UseDictationResult,
  AnimationSequenceStep,
  UseAnimationSequenceResult,
  UseAnimationSpawnResult,
  UseDataLoggingResult,
  AppGlanceSlice,
  UseAppGlanceResult,
  TimelinePin,
  UseTimelineResult,
  AppFocusOptions,
  AppFocusResult,
  ContentSize,
  DisplayBounds,
  UseConfigurationOptions,
  UseConfigurationResult,
  UseAppSyncOptions,
  UseAppSyncResult,
  LogLevel,
  LocationData,
  UseLocationOptions,
  UseLocationResult,
  LaunchReason,
  UseFileStorageResult,
  HTTPClientRequestOptions,
  UseHTTPClientResult,
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
  colorFromHex,
  colorDistance,
  nearestColorName,
  registerFont,
  lookupFontSpec,
  getTextWidth,
} from './pebble-output.js';
export type {
  RGB,
  FontSpec,
  RenderOptions as PocoRenderOptions,
} from './pebble-output.js';

// Configuration page builder
export {
  ConfigColor,
  ConfigToggle,
  ConfigText,
  ConfigSelect,
  ConfigSection,
  ConfigPage,
  renderConfigPage,
  configPageToDataUri,
} from './config/index.js';
export type {
  ConfigColorItem,
  ConfigToggleItem,
  ConfigTextItem,
  ConfigSelectItem,
  ConfigItem,
  ConfigSectionSpec,
  ConfigPageSpec,
} from './config/index.js';
