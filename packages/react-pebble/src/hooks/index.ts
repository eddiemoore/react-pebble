/**
 * hooks/index.ts — barrel re-export for react-pebble hooks.
 *
 * Each hook lives in its own file under `src/hooks/<hookName>.ts`. Shared
 * helpers (button registry, easing, math, trig, app context, the useState
 * compiler patch point, the Moddable Pebble globals) live under
 * `src/hooks/internal/`.
 *
 * Add new hooks by creating a new file and adding a re-export here. Internal
 * helpers used only by hooks should not be re-exported.
 *
 * See `pebble-render.ts` for the runtime wiring that lets `useTime` and
 * `useButton` actually fire on-device — hooks publish to registries that the
 * renderer connects to Moddable's `watch` event source.
 */

// Internal shared helpers (publicly re-exported for backwards compatibility)
export {
  useState,
  _setUseStateImpl,
  _restoreUseState,
} from './internal/use-state.js';
export { PebbleAppContext, useApp } from './internal/context.js';
export {
  ButtonRegistry,
  type ButtonRegistryKey,
  type PebbleButton,
  type PebbleButtonHandler,
} from './internal/button-registry.js';
export { Easing, type EasingFn } from './internal/easing.js';
export {
  angleBetweenPoints,
  degreesToRadians,
  lerp,
  polarPoint,
  radiansToDegrees,
} from './internal/math.js';
export {
  TRIG_MAX_ANGLE,
  atan2Lookup,
  cosLookup,
  sinLookup,
} from './internal/trig.js';

// Hooks
export { useButton } from './useButton.js';
export { useLongButton } from './useLongButton.js';
export {
  clockIs24HourStyle,
  clockToTimestamp,
  resolveGranularity,
  startOfToday,
  useTime,
} from './useTime.js';
export type { TimeGranularity } from './useTime.js';
export { useFormattedTime } from './useFormattedTime.js';
export { useInterval } from './useInterval.js';
export {
  useListNavigation,
  type ListNavigationOptions,
  type ListNavigationResult,
} from './useListNavigation.js';
export {
  useMessage,
  type UseMessageOptions,
  type UseMessageResult,
} from './useMessage.js';
export { useBattery, type BatteryState } from './useBattery.js';
export { useConnection, type ConnectionState } from './useConnection.js';
export { useLocalStorage } from './useLocalStorage.js';
export {
  useFetch,
  type UseFetchOptions,
  type UseFetchResult,
} from './useFetch.js';
export {
  useAnimation,
  type UseAnimationOptions,
  type UseAnimationResult,
} from './useAnimation.js';
export {
  useAccelerometer,
  type AccelerometerData,
  type UseAccelerometerOptions,
} from './useAccelerometer.js';
export {
  useAccelerometerRaw,
  type AccelerometerRawSample,
  type UseAccelerometerRawOptions,
} from './useAccelerometerRaw.js';
export {
  useAccelerometerTap,
  type AccelAxis,
  type AccelDirection,
  type AccelerometerTapEvent,
} from './useAccelerometerTap.js';
export {
  useCompass,
  type CompassData,
  type CompassResult,
  type CompassStatus,
} from './useCompass.js';
export { useWebSocket, type UseWebSocketResult } from './useWebSocket.js';
export { useKVStorage } from './useKVStorage.js';
export { useVibration, type UseVibrationResult } from './useVibration.js';
export { useLight, type UseLightResult } from './useLight.js';
export {
  useHealth,
  type HealthActivity,
  type HealthData,
  type UseHealthResult,
} from './useHealth.js';
export {
  useHealthAlert,
  type HealthMetric,
  type UseHealthAlertOptions,
} from './useHealthAlert.js';
export {
  useHeartRateMonitor,
  type UseHeartRateMonitorOptions,
  type UseHeartRateMonitorResult,
} from './useHeartRateMonitor.js';
export {
  useHealthHistory,
  type UseHealthHistoryOptions,
} from './useHealthHistory.js';
export {
  useMeasurementSystem,
  type MeasurementSystem,
} from './useMeasurementSystem.js';
export { useTimer, type UseTimerResult } from './useTimer.js';
export { useWatchInfo, type WatchInfo } from './useWatchInfo.js';
export { useScreen, getScreen, type ScreenInfo } from './useScreen.js';
export { useLocale, type LocaleInfo } from './useLocale.js';
export { useUnobstructedArea, type UnobstructedArea } from './useUnobstructedArea.js';
export { useMultiClick, type MultiClickOptions } from './useMultiClick.js';
export { useRepeatClick, type RepeatClickOptions } from './useRepeatClick.js';
export { useRawClick, type UseRawClickOptions } from './useRawClick.js';
export { useWakeup, type UseWakeupResult } from './useWakeup.js';
export {
  useDictation,
  type DictationStatus,
  type UseDictationResult,
} from './useDictation.js';
export {
  useAnimationSequence,
  type AnimationSequenceStep,
  type UseAnimationSequenceResult,
} from './useAnimationSequence.js';
export {
  useAnimationSpawn,
  type UseAnimationSpawnResult,
} from './useAnimationSpawn.js';
export { useDataLogging, type UseDataLoggingResult } from './useDataLogging.js';
export {
  appGlanceTimeSince,
  appGlanceTimeUntil,
  useAppGlance,
  type AppGlanceSlice,
  type UseAppGlanceResult,
} from './useAppGlance.js';
export {
  TimelineAction,
  useTimeline,
  type TimelineColor,
  type TimelinePin,
  type TimelinePinAction,
  type TimelinePinActionHttp,
  type TimelinePinActionOpenWatchApp,
  type TimelinePinActionRemove,
  type TimelinePinLayout,
  type TimelinePinLayoutType,
  type TimelinePinNotification,
  type TimelinePinReminder,
  type UseTimelineResult,
} from './useTimeline.js';
export { useQuietTime } from './useQuietTime.js';
export {
  useAppFocus,
  type AppFocusOptions,
  type AppFocusResult,
} from './useAppFocus.js';
export { useContentSize, type ContentSize } from './useContentSize.js';
export { useDisplayBounds, type DisplayBounds } from './useDisplayBounds.js';
export {
  useConfiguration,
  type UseConfigurationOptions,
  type UseConfigurationResult,
} from './useConfiguration.js';
export {
  useAppSync,
  type UseAppSyncOptions,
  type UseAppSyncResult,
} from './useAppSync.js';
export { pebbleLog, type LogLevel } from './pebble-log.js';
export {
  useLocation,
  type LocationData,
  type UseLocationOptions,
  type UseLocationResult,
} from './useLocation.js';
export { useLaunchReason } from './useLaunchReason.js';
export {
  useLaunchInfo,
  type LaunchInfo,
  type LaunchReason,
} from './useLaunchInfo.js';
export {
  useExitReason,
  type ExitReasonCode,
  type UseExitReasonResult,
} from './useExitReason.js';
export {
  useNotification,
  type SimpleNotification,
  type UseNotificationResult,
} from './useNotification.js';
export { useFileStorage, type UseFileStorageResult } from './useFileStorage.js';
export {
  useHTTPClient,
  type HTTPClientRequestOptions,
  type UseHTTPClientResult,
} from './useHTTPClient.js';
export { usePreferredResultDuration } from './usePreferredResultDuration.js';
export { useMemoryStats, type MemoryStats } from './useMemoryStats.js';
export {
  useMemoryPressure,
  type MemoryPressureLevel,
} from './useMemoryPressure.js';
export {
  useSports,
  type SportsState,
  type SportsUnits,
  type SportsUpdate,
  type UseSportsOptions,
  type UseSportsResult,
} from './useSports.js';
export {
  defineTranslations,
  useTranslation,
  type TranslationDict,
} from './useTranslation.js';
export { useAccountToken } from './useAccountToken.js';
export { useWatchToken } from './useWatchToken.js';
export {
  useTimelineToken,
  type UseTimelineTokenResult,
} from './useTimelineToken.js';
export {
  useTimelineSubscriptions,
  type UseTimelineSubscriptionsResult,
} from './useTimelineSubscriptions.js';
export { useRawResource } from './useRawResource.js';
export {
  useSmartstrap,
  type SmartstrapAttributeOpts,
  type SmartstrapResult,
} from './useSmartstrap.js';
export {
  useWorkerLaunch,
  type UseWorkerLaunchResult,
  type WorkerMessage,
  type WorkerResult,
} from './useWorkerLaunch.js';
export { useWorkerMessage } from './useWorkerMessage.js';
export {
  useWorkerSender,
  type UseWorkerSenderResult,
} from './useWorkerSender.js';
