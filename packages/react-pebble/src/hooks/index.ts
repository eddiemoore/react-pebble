/**
 * hooks/index.ts — React hooks for react-pebble.
 *
 * This set intentionally covers only what the Alloy runtime can support
 * today. Sensor / connectivity hooks (battery, BT connection, accelerometer,
 * phone↔watch messaging) used to live here based on a fictional `Pebble`
 * global; they've been removed until we've identified the real Moddable
 * module shape for each one.
 *
 * See `pebble-render.ts` for the runtime wiring that lets `useTime` and
 * `useButton` actually fire on-device — hooks publish to registries that the
 * renderer connects to Moddable's `watch` event source.
 */

import { createContext } from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState as _preactUseState,
} from 'preact/hooks';

// Wrap useState so the compiler can swap the implementation at compile time.
// Direct ESM re-exports are sealed (getter-only), so we use a mutable
// internal reference that the compiler patches via _setUseStateImpl().
type UseStateFn = <T>(init: T | (() => T)) => [T, (v: T | ((p: T) => T)) => void];
let _useStateImpl: UseStateFn = _preactUseState;

export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  return _useStateImpl(init);
}

/** @internal — called by the compiler to intercept useState calls. */
export function _setUseStateImpl(impl: UseStateFn): void {
  _useStateImpl = impl;
}

/** @internal — restore original useState after compilation. */
export function _restoreUseState(): void {
  _useStateImpl = _preactUseState;
}
import type { PebbleApp } from '../pebble-render.js';

// ---------------------------------------------------------------------------
// Button types
// ---------------------------------------------------------------------------

export type PebbleButton = 'up' | 'down' | 'select' | 'back';
export type PebbleButtonHandler = () => void;

// ---------------------------------------------------------------------------
// App context — provides access to the render app from nested components.
// ---------------------------------------------------------------------------

export const PebbleAppContext = createContext<PebbleApp | null>(null);

export function useApp(): PebbleApp {
  const app = useContext(PebbleAppContext);
  if (!app) {
    throw new Error('useApp must be used inside a react-pebble render tree');
  }
  return app;
}

// ---------------------------------------------------------------------------
// Button registry
//
// Buttons are delivered to react-pebble two ways:
//   (a) via props on elements (onUp/onDown/onSelect/onBack), collected and
//       subscribed to Moddable's `watch` in pebble-render.ts; or
//   (b) via this hook registry, which the renderer pumps from `watch` events.
//
// The registry is the substrate for both `useButton` and `useLongButton`.
// The exact `watch` event names for buttons are not yet confirmed — the
// renderer normalizes them into our four logical buttons before emitting.
// ---------------------------------------------------------------------------

type ButtonRegistryKey =
  | PebbleButton
  | `long_${PebbleButton}`
  | `raw_down_${PebbleButton}`
  | `raw_up_${PebbleButton}`;

interface ButtonRegistryShape {
  _listeners: Map<ButtonRegistryKey, Set<PebbleButtonHandler>>;
  subscribe(button: ButtonRegistryKey, fn: PebbleButtonHandler): void;
  unsubscribe(button: ButtonRegistryKey, fn: PebbleButtonHandler): void;
  emit(button: ButtonRegistryKey): void;
}

export const ButtonRegistry: ButtonRegistryShape = {
  _listeners: new Map<ButtonRegistryKey, Set<PebbleButtonHandler>>(),

  subscribe(button, fn) {
    let set = this._listeners.get(button);
    if (!set) {
      set = new Set();
      this._listeners.set(button, set);
    }
    set.add(fn);
  },

  unsubscribe(button, fn) {
    const set = this._listeners.get(button);
    if (set) {
      set.delete(fn);
      if (set.size === 0) this._listeners.delete(button);
    }
  },

  emit(button) {
    const set = this._listeners.get(button);
    if (set) {
      for (const fn of set) fn();
    }
  },
};

export function useButton(button: PebbleButton, handler: PebbleButtonHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener: PebbleButtonHandler = () => handlerRef.current();
    ButtonRegistry.subscribe(button, listener);
    return () => {
      ButtonRegistry.unsubscribe(button, listener);
    };
  }, [button]);
}

export function useLongButton(button: PebbleButton, handler: PebbleButtonHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener: PebbleButtonHandler = () => handlerRef.current();
    const key: ButtonRegistryKey = `long_${button}`;
    ButtonRegistry.subscribe(key, listener);
    return () => ButtonRegistry.unsubscribe(key, listener);
  }, [button]);
}

// ---------------------------------------------------------------------------
// Time hooks
//
// On Alloy, `watch.addEventListener('secondchange'|'minutechange', fn)` is
// the canonical tick source — it fires exactly on boundaries and is far more
// battery-efficient than setInterval. In Node mock mode we fall back to
// setInterval.
// ---------------------------------------------------------------------------

export function useTime(intervalMs = 1000): Date {
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setTime(new Date());

    // On Alloy: use watch tick events for battery efficiency
    if (typeof watch !== 'undefined' && watch) {
      const event = intervalMs <= 1000 ? 'secondchange' : 'minutechange';
      watch.addEventListener(event, tick);
      return () => watch!.removeEventListener(event, tick);
    }

    // Mock mode: fall back to setInterval
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return time;
}

/**
 * Returns `true` when the watch is configured to display time in 24-hour
 * format. Mirrors C SDK `clock_is_24h_style()` and Rocky `userPreferences.clock24h`.
 *
 * On Alloy: reads `clock_is_24h_style()` or `userPreferences.clock24h`.
 * In mock mode: falls back to `Intl.DateTimeFormat` (best-effort).
 */
export function clockIs24HourStyle(): boolean {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.clock_is_24h_style === 'function') {
      return Boolean((g.clock_is_24h_style as () => boolean)());
    }
    const rocky = (g as { rocky?: { userPreferences?: { clock24h?: boolean } } }).rocky;
    if (rocky?.userPreferences && typeof rocky.userPreferences.clock24h === 'boolean') {
      return rocky.userPreferences.clock24h;
    }
  }
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
      return opts.hour12 === false;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Format the current time. `format` uses the Pebble/strftime-ish tokens:
 *   HH — 24-hour hour (00-23)
 *   hh — 12-hour hour (01-12)
 *   mm — minute (00-59)
 *   ss — second (00-59)
 *   a  — AM/PM marker
 *
 * Pass `'auto'` to use the user's preferred 24h/12h style.
 */
export function useFormattedTime(format: string = 'HH:mm'): string {
  const resolvedFormat = format === 'auto'
    ? (clockIs24HourStyle() ? 'HH:mm' : 'hh:mm a')
    : format;
  const time = useTime(resolvedFormat.includes('ss') ? 1000 : 60000);

  const hours24 = time.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ampm = hours24 < 12 ? 'AM' : 'PM';

  let result = resolvedFormat;
  result = result.replace('HH', hours24.toString().padStart(2, '0'));
  result = result.replace('hh', hours12.toString().padStart(2, '0'));
  result = result.replace('mm', minutes);
  result = result.replace('ss', seconds);
  result = result.replace('a', ampm);

  return result;
}

// ---------------------------------------------------------------------------
// Time utility functions (pure; not hooks)
// ---------------------------------------------------------------------------

/**
 * Returns a Unix timestamp (seconds) for midnight local time today.
 * Mirrors C SDK `time_start_of_today()`.
 */
export function startOfToday(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.floor(midnight.getTime() / 1000);
}

/**
 * Convert a `Date` (or local Y/M/D/H/M/S tuple) to a Unix timestamp (seconds).
 * Mirrors C SDK `clock_to_timestamp()`.
 */
export function clockToTimestamp(date: Date): number;
export function clockToTimestamp(
  year: number,
  month: number,
  day: number,
  hour?: number,
  minute?: number,
  second?: number,
): number;
export function clockToTimestamp(
  dateOrYear: Date | number,
  month: number = 0,
  day: number = 1,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
): number {
  const d = dateOrYear instanceof Date
    ? dateOrYear
    : new Date(dateOrYear, month, day, hour, minute, second);
  return Math.floor(d.getTime() / 1000);
}

// ---------------------------------------------------------------------------
// useInterval
// ---------------------------------------------------------------------------

export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ---------------------------------------------------------------------------
// List navigation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// useMessage — runtime data loading via phone→watch messaging
// ---------------------------------------------------------------------------

export interface UseMessageOptions<T> {
  /** Message key name (must match PebbleKit JS sendAppMessage key) */
  key: string;
  /** Mock data returned at compile time so the compiler can render the loaded state */
  mockData: T;
  /** Delay in ms before mock data appears (for SETTLE_MS) */
  mockDelay?: number;
}

export interface UseMessageResult<T> {
  data: T | null;
  loading: boolean;
}

/**
 * Load data from the phone at runtime via Pebble's Message API.
 *
 * At compile time (Node mock mode): returns mockData after mockDelay ms.
 * At runtime (Alloy): the compiler emits a Message subscription that
 * populates data when the phone sends it.
 *
 * Usage:
 *   const { data, loading } = useMessage({
 *     key: 'items',
 *     mockData: [{ title: 'Fix bug', status: 'Open' }],
 *   });
 */
export function useMessage<T>(options: UseMessageOptions<T>): UseMessageResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In mock mode (compile time), simulate async data arrival
    const timer = setTimeout(() => {
      setData(options.mockData);
      setLoading(false);
    }, options.mockDelay ?? 100);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading };
}

// ---------------------------------------------------------------------------
// Battery hook — reads Alloy's Battery sensor (percent, charging, plugged)
// ---------------------------------------------------------------------------

export interface BatteryState {
  percent: number;
  charging: boolean;
  plugged: boolean;
}

/**
 * Returns the current battery state. On Alloy, reads the `Battery` global.
 * In mock mode (Node), returns a static default (100%, not charging).
 *
 * Re-reads on each render; battery updates arrive via watch tick events
 * which trigger redraws, so the value stays fresh.
 */
export function useBattery(): BatteryState {
  if (typeof Battery !== 'undefined' && Battery) {
    return {
      percent: Battery.percent,
      charging: Battery.charging,
      plugged: Battery.plugged,
    };
  }
  // Mock mode — return a sensible default
  return { percent: 100, charging: false, plugged: false };
}

// ---------------------------------------------------------------------------
// Connection hook — reads watch.connected (app + pebblekit)
// ---------------------------------------------------------------------------

export interface ConnectionState {
  app: boolean;
  pebblekit: boolean;
}

/**
 * Returns the current phone connection state. On Alloy, reads
 * `watch.connected`. In mock mode, returns connected for both.
 */
export function useConnection(): ConnectionState {
  if (typeof watch !== 'undefined' && watch?.connected) {
    return {
      app: watch.connected.app,
      pebblekit: watch.connected.pebblekit,
    };
  }
  // Mock mode
  return { app: true, pebblekit: true };
}

// ---------------------------------------------------------------------------
// localStorage hook — persists state across app restarts and reboots
// ---------------------------------------------------------------------------

/**
 * Like useState, but backed by localStorage so the value persists across
 * app restarts and watch reboots.
 *
 * On Alloy, `localStorage` is a standard Web API global.
 * In mock mode (Node), falls back to a plain in-memory useState.
 *
 * Values are JSON-serialized. Only use with JSON-safe types.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) as T : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setAndPersist = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or unavailable — silently ignore
        }
      }
      return next;
    });
  }, [key]);

  return [value, setAndPersist];
}

// ---------------------------------------------------------------------------
// useFetch — HTTP data loading via pebbleproxy
// ---------------------------------------------------------------------------

export interface UseFetchOptions<T> {
  /** Mock data returned in Node mock mode so the compiler can render. */
  mockData?: T;
  /** Delay in ms before mock data appears (default 100). */
  mockDelay?: number;
  /** fetch() RequestInit options (method, headers, body). */
  init?: RequestInit;
}

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch JSON data from a URL.
 *
 * On Alloy: uses the standard `fetch()` API (proxied via @moddable/pebbleproxy).
 * In mock mode (Node): returns `mockData` after `mockDelay` ms.
 *
 * Usage:
 *   const { data, loading, error } = useFetch<Weather>(
 *     'https://api.example.com/weather',
 *     { mockData: { temp: 72, condition: 'Sunny' } }
 *   );
 */
export function useFetch<T>(url: string, options: UseFetchOptions<T> = {}): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // On Alloy (real device): use fetch()
    if (typeof globalThis.fetch === 'function') {
      globalThis.fetch(url, options.init)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<T>;
        })
        .then((json) => {
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
      return;
    }

    // Mock mode: return mockData after delay
    if (options.mockData !== undefined) {
      const timer = setTimeout(() => {
        setData(options.mockData!);
        setLoading(false);
      }, options.mockDelay ?? 100);
      return () => clearTimeout(timer);
    }

    // No fetch and no mock data
    setError('fetch() not available');
    setLoading(false);
  }, [url]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// useAnimation — property interpolation with easing
// ---------------------------------------------------------------------------

/** Standard easing functions matching Alloy's Timeline API. */
export const Easing = {
  linear: (t: number) => t,
  quadEaseIn: (t: number) => t * t,
  quadEaseOut: (t: number) => t * (2 - t),
  quadEaseInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  cubicEaseIn: (t: number) => t * t * t,
  cubicEaseOut: (t: number) => (--t) * t * t + 1,
  cubicEaseInOut: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  sinEaseIn: (t: number) => 1 - Math.cos(t * Math.PI / 2),
  sinEaseOut: (t: number) => Math.sin(t * Math.PI / 2),
  sinEaseInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoEaseIn: (t: number) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  expoEaseOut: (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  circEaseIn: (t: number) => 1 - Math.sqrt(1 - t * t),
  circEaseOut: (t: number) => Math.sqrt(1 - (--t) * t),
  bounceEaseOut: (t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  bounceEaseIn: (t: number) => 1 - Easing.bounceEaseOut(1 - t),
  elasticEaseOut: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  },
  backEaseOut: (t: number) => {
    const s = 1.70158;
    return (--t) * t * ((s + 1) * t + s) + 1;
  },
} as const;

export type EasingFn = (t: number) => number;

export interface UseAnimationOptions {
  /** Duration in ms. */
  duration: number;
  /** Easing function (default: linear). */
  easing?: EasingFn;
  /** Delay before start in ms (default: 0). */
  delay?: number;
  /** Loop the animation (default: false). */
  loop?: boolean;
  /** Auto-start on mount (default: true). */
  autoStart?: boolean;
}

export interface UseAnimationResult {
  /** Current progress value (0 to 1), eased. */
  progress: number;
  /** Whether the animation is currently running. */
  running: boolean;
  /** Start or restart the animation. */
  start: () => void;
  /** Stop the animation. */
  stop: () => void;
}

/**
 * Animate a progress value from 0 to 1 over a duration with easing.
 *
 * Uses `useTime` internally so that animation progress is derived from
 * the wall clock. This ensures compatibility with the piu compiler,
 * which detects time-dependent values via T1/T2 render diffs.
 *
 * The animation cycles based on `duration` (in ms). If `loop` is true,
 * it repeats indefinitely.
 *
 * Usage:
 *   const { progress } = useAnimation({ duration: 10000, easing: Easing.bounceEaseOut, loop: true });
 *   const x = lerp(0, 200, progress);
 */
export function useAnimation(options: UseAnimationOptions): UseAnimationResult {
  const { duration, easing = Easing.linear, loop = false } = options;
  // Use useTime for clock ticks — this makes the compiler detect time deps.
  // Progress is derived purely from the current time (no stored start time),
  // so the compiler can diff T1 vs T2 and detect changing values.
  const time = useTime(1000);

  // Derive progress from current time modulo duration.
  // For a 60s duration, this cycles every 60s based on wall clock.
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();
  const durationSec = duration / 1000;
  const raw = loop
    ? (totalSeconds % durationSec) / durationSec
    : Math.min(totalSeconds / durationSec, 1);
  const progress = easing(raw);

  const start = useCallback(() => { /* no-op: auto-driven by time */ }, []);
  const stop = useCallback(() => { /* no-op: auto-driven by time */ }, []);

  return { progress, running: true, start, stop };
}

/**
 * Interpolate between two values using an animation progress (0-1).
 */
export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

// ---------------------------------------------------------------------------
// Polar coordinate helpers — essential for analog watchfaces
// ---------------------------------------------------------------------------

/**
 * Convert degrees to radians.
 */
export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 */
export function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Compute {x, y} at a given angle and radius from a center point.
 * Angle is in degrees, 0 = 12 o'clock (north), clockwise.
 */
export function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  // Convert to math radians: 0° north = -90° in standard math
  const rad = degreesToRadians(angleDeg - 90);
  return {
    x: Math.round(cx + radius * Math.cos(rad)),
    y: Math.round(cy + radius * Math.sin(rad)),
  };
}

/**
 * Compute the angle in degrees between two points.
 * Returns 0-360 with 0 = north, clockwise.
 */
export function angleBetweenPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const rad = Math.atan2(x2 - x1, -(y2 - y1));
  return ((rad * 180) / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------------------
// Pebble-convention trig utilities (0-65536 angle range)
// ---------------------------------------------------------------------------

/**
 * Pebble's full-circle angle constant (equivalent to 360°).
 */
export const TRIG_MAX_ANGLE = 0x10000; // 65536

/**
 * Sine lookup using Pebble angle convention.
 * Input: angle in 0-65536 range (0 = 0°, 16384 = 90°, 32768 = 180°).
 * Output: scaled to -65536..+65536 (divide by TRIG_MAX_ANGLE for -1..1).
 */
export function sinLookup(angle: number): number {
  const rad = (angle / TRIG_MAX_ANGLE) * 2 * Math.PI;
  return Math.round(Math.sin(rad) * TRIG_MAX_ANGLE);
}

/**
 * Cosine lookup using Pebble angle convention.
 * Same scale as sinLookup.
 */
export function cosLookup(angle: number): number {
  const rad = (angle / TRIG_MAX_ANGLE) * 2 * Math.PI;
  return Math.round(Math.cos(rad) * TRIG_MAX_ANGLE);
}

/**
 * atan2 returning Pebble-convention angle (0-65536).
 */
export function atan2Lookup(y: number, x: number): number {
  const rad = Math.atan2(y, x);
  return Math.round(((rad / (2 * Math.PI)) * TRIG_MAX_ANGLE + TRIG_MAX_ANGLE) % TRIG_MAX_ANGLE);
}

// ---------------------------------------------------------------------------
// useAccelerometer — motion sensing via Moddable sensor API
// ---------------------------------------------------------------------------

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

export interface UseAccelerometerOptions {
  /** Sample rate in ms (default: 100). */
  sampleRate?: number;
  /** Called on tap gesture. */
  onTap?: () => void;
  /** Called on double-tap gesture. */
  onDoubleTap?: () => void;
}

/**
 * Read accelerometer data.
 *
 * On Alloy: reads from the Moddable Accelerometer sensor.
 * In mock mode: returns { x: 0, y: 0, z: -1000 } (gravity pointing down).
 */
export function useAccelerometer(options: UseAccelerometerOptions = {}): AccelerometerData {
  const { sampleRate = 100, onTap, onDoubleTap } = options;
  const [data, setData] = useState<AccelerometerData>({ x: 0, y: 0, z: -1000 });
  const tapRef = useRef(onTap);
  const doubleTapRef = useRef(onDoubleTap);
  tapRef.current = onTap;
  doubleTapRef.current = onDoubleTap;

  useEffect(() => {
    // Try to access the Alloy accelerometer
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).__pbl_accel) {
      const accel = (globalThis as Record<string, unknown>).__pbl_accel as {
        onSample?: (x: number, y: number, z: number) => void;
        onTap?: () => void;
        onDoubleTap?: () => void;
        start?: () => void;
        stop?: () => void;
      };
      accel.onSample = (x: number, y: number, z: number) => setData({ x, y, z });
      if (tapRef.current) accel.onTap = () => tapRef.current?.();
      if (doubleTapRef.current) accel.onDoubleTap = () => doubleTapRef.current?.();
      accel.start?.();
      return () => accel.stop?.();
    }

    // Mock mode: simulate gentle wobble
    const id = setInterval(() => {
      setData({
        x: Math.round(Math.sin(Date.now() / 1000) * 50),
        y: Math.round(Math.cos(Date.now() / 1200) * 30),
        z: -1000 + Math.round(Math.sin(Date.now() / 800) * 20),
      });
    }, sampleRate);
    return () => clearInterval(id);
  }, [sampleRate]);

  return data;
}

// ---------------------------------------------------------------------------
// useAccelerometerRaw — higher-fidelity raw accelerometer samples
// ---------------------------------------------------------------------------

export interface AccelerometerRawSample {
  x: number;
  y: number;
  z: number;
  /** Milliseconds since epoch (device time). */
  timestamp: number;
  /** Whether this sample was captured while the device was vibrating. */
  didVibrate?: boolean;
}

export interface UseAccelerometerRawOptions {
  /**
   * Samples per batch update (1-25). Mirrors
   * `accel_service_set_samples_per_update()`.
   */
  samplesPerUpdate?: number;
  /** Sampling rate in Hz (10, 25, 50, or 100). */
  samplingRateHz?: 10 | 25 | 50 | 100;
  /** Called with every batch of samples. */
  onSamples?: (samples: AccelerometerRawSample[]) => void;
}

/**
 * Subscribe to the raw accelerometer data service. Yields batches of samples
 * at the configured rate (vs. `useAccelerometer`, which yields a single
 * smoothed value). Mirrors C SDK `accel_raw_data_service_subscribe()`.
 *
 * On Alloy: uses the `__pbl_accel_raw` global if available, otherwise falls
 * back to synthesizing batches from `__pbl_accel` at the configured rate.
 * In mock mode: generates synthetic samples.
 */
export function useAccelerometerRaw(options: UseAccelerometerRawOptions = {}): AccelerometerRawSample[] {
  const samplesPerUpdate = options.samplesPerUpdate ?? 25;
  const samplingRateHz = options.samplingRateHz ?? 25;
  const [batch, setBatch] = useState<AccelerometerRawSample[]>([]);
  const callbackRef = useRef(options.onSamples);
  callbackRef.current = options.onSamples;

  useEffect(() => {
    const publish = (samples: AccelerometerRawSample[]) => {
      setBatch(samples);
      callbackRef.current?.(samples);
    };

    const g = globalThis as Record<string, unknown>;
    const rawSvc = g.__pbl_accel_raw as {
      onSamples?: (samples: AccelerometerRawSample[]) => void;
      samplingRate?: number;
      samplesPerUpdate?: number;
      start?: () => void;
      stop?: () => void;
    } | undefined;

    if (rawSvc) {
      rawSvc.samplingRate = samplingRateHz;
      rawSvc.samplesPerUpdate = samplesPerUpdate;
      rawSvc.onSamples = publish;
      rawSvc.start?.();
      return () => rawSvc.stop?.();
    }

    // Mock mode: synthesize batches at the requested rate.
    const batchIntervalMs = (samplesPerUpdate * 1000) / samplingRateHz;
    const sampleIntervalMs = 1000 / samplingRateHz;
    const id = setInterval(() => {
      const now = Date.now();
      const samples: AccelerometerRawSample[] = [];
      for (let i = 0; i < samplesPerUpdate; i++) {
        const t = now - (samplesPerUpdate - 1 - i) * sampleIntervalMs;
        samples.push({
          x: Math.round(Math.sin(t / 500) * 100),
          y: Math.round(Math.cos(t / 600) * 80),
          z: -1000 + Math.round(Math.sin(t / 400) * 40),
          timestamp: t,
        });
      }
      publish(samples);
    }, batchIntervalMs);
    return () => clearInterval(id);
  }, [samplesPerUpdate, samplingRateHz]);

  return batch;
}

// ---------------------------------------------------------------------------
// useAccelerometerTap — low-power tap detection (axis + direction)
// ---------------------------------------------------------------------------

export type AccelAxis = 'x' | 'y' | 'z';
export type AccelDirection = 1 | -1;

export interface AccelerometerTapEvent {
  axis: AccelAxis;
  direction: AccelDirection;
}

/**
 * Subscribe to tap gesture events. Unlike `useAccelerometer({ onTap })`,
 * this hook reports the axis and direction of the tap — useful for
 * wrist flicks and shake gestures. Mirrors `accel_tap_service_subscribe()`.
 *
 * On Alloy: uses `__pbl_accel_tap` if present, otherwise degrades to the
 * basic `onTap` callback of the data service.
 * In mock mode: fires a mock tap every 3 seconds cycling through axes.
 */
export function useAccelerometerTap(handler: (event: AccelerometerTapEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const emit = (event: AccelerometerTapEvent) => handlerRef.current(event);

    const g = globalThis as Record<string, unknown>;
    const tapSvc = g.__pbl_accel_tap as {
      onTap?: (axis: AccelAxis, direction: AccelDirection) => void;
      start?: () => void;
      stop?: () => void;
    } | undefined;

    if (tapSvc) {
      tapSvc.onTap = (axis, direction) => emit({ axis, direction });
      tapSvc.start?.();
      return () => tapSvc.stop?.();
    }

    // Fall back to basic accel onTap if available
    const accel = g.__pbl_accel as { onTap?: () => void; start?: () => void; stop?: () => void } | undefined;
    if (accel) {
      accel.onTap = () => emit({ axis: 'z', direction: 1 });
      accel.start?.();
      return () => accel.stop?.();
    }

    // Mock mode
    const axes: AccelAxis[] = ['x', 'y', 'z'];
    let i = 0;
    const id = setInterval(() => {
      emit({ axis: axes[i % axes.length]!, direction: (i % 2 === 0 ? 1 : -1) as AccelDirection });
      i++;
    }, 3000);
    return () => clearInterval(id);
  }, []);
}

// ---------------------------------------------------------------------------
// useCompass — magnetic heading via Moddable sensor API
// ---------------------------------------------------------------------------

export interface CompassData {
  /** Heading in degrees (0-360, 0 = north). */
  heading: number;
}

/**
 * Read compass heading.
 *
 * On Alloy: reads from the Moddable Compass sensor.
 * In mock mode: returns a slowly rotating heading.
 */
export function useCompass(): CompassData {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    // Try to access the Alloy compass
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).__pbl_compass) {
      const compass = (globalThis as Record<string, unknown>).__pbl_compass as {
        onSample?: (heading: number) => void;
        start?: () => void;
        stop?: () => void;
      };
      compass.onSample = (h: number) => setHeading(h);
      compass.start?.();
      return () => compass.stop?.();
    }

    // Mock mode: slowly rotate
    const id = setInterval(() => {
      setHeading((h) => (h + 1) % 360);
    }, 100);
    return () => clearInterval(id);
  }, []);

  return { heading };
}

// ---------------------------------------------------------------------------
// useWebSocket — bidirectional communication via pebbleproxy
// ---------------------------------------------------------------------------

export interface UseWebSocketResult {
  /** Last received message (null until first message). */
  lastMessage: string | null;
  /** Whether the connection is open. */
  connected: boolean;
  /** Send a message. */
  send: (data: string) => void;
  /** Close the connection. */
  close: () => void;
}

/**
 * Connect to a WebSocket server.
 *
 * On Alloy: uses the WebSocket API (proxied via @moddable/pebbleproxy).
 * In mock mode: simulates a connection that echoes messages back.
 */
export function useWebSocket(url: string): UseWebSocketResult {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<{ send: (d: string) => void; close: () => void } | null>(null);

  useEffect(() => {
    // On Alloy: use real WebSocket
    if (typeof WebSocket !== 'undefined') {
      const ws = new WebSocket(url);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => setLastMessage(String(e.data));
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
      wsRef.current = { send: (d) => ws.send(d), close: () => ws.close() };
      return () => ws.close();
    }

    // Mock mode: echo server
    setConnected(true);
    wsRef.current = {
      send: (d: string) => {
        setTimeout(() => setLastMessage(`echo: ${d}`), 50);
      },
      close: () => setConnected(false),
    };
    return () => setConnected(false);
  }, [url]);

  const send = useCallback((data: string) => {
    wsRef.current?.send(data);
  }, []);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return { lastMessage, connected, send, close };
}

// ---------------------------------------------------------------------------
// useKVStorage — ECMA-419 binary key-value storage
// ---------------------------------------------------------------------------

/**
 * Key-value storage for binary and structured data using the ECMA-419 API.
 *
 * On Alloy: uses `device.keyValue.open(storeName)` for persistent binary storage.
 * In mock mode: uses an in-memory Map.
 *
 * For simple string storage, prefer `useLocalStorage`.
 */
export function useKVStorage(storeName: string): {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
} {
  const storeRef = useRef<{
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
    delete: (key: string) => void;
  } | null>(null);

  if (!storeRef.current) {
    // Try ECMA-419 device.keyValue API
    const device = (globalThis as Record<string, unknown>).device as {
      keyValue?: { open: (path: string) => {
        get: (key: string) => string | null;
        set: (key: string, value: string) => void;
        delete: (key: string) => void;
      }};
    } | undefined;

    if (device?.keyValue) {
      storeRef.current = device.keyValue.open(storeName);
    } else {
      // Mock mode: in-memory map
      const map = new Map<string, string>();
      storeRef.current = {
        get: (k) => map.get(k) ?? null,
        set: (k, v) => map.set(k, v),
        delete: (k) => { map.delete(k); },
      };
    }
  }

  const store = storeRef.current!;
  return {
    get: useCallback((key: string) => store.get(key), []),
    set: useCallback((key: string, value: string) => store.set(key, value), []),
    remove: useCallback((key: string) => store.delete(key), []),
  };
}

// ---------------------------------------------------------------------------
// useVibration — haptic feedback
// ---------------------------------------------------------------------------

export interface UseVibrationResult {
  shortPulse: () => void;
  longPulse: () => void;
  doublePulse: () => void;
  customPattern: (durations: number[]) => void;
}

/**
 * Haptic feedback via the Pebble vibration motor.
 *
 * On Alloy: uses the `Vibration` global.
 * In mock mode: no-op functions.
 */
export function useVibration(): UseVibrationResult {
  const noop = useCallback(() => {}, []);
  const noopArr = useCallback((_durations: number[]) => {}, []);

  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Vibration) {
    const vib = (globalThis as Record<string, unknown>).Vibration as {
      shortPulse?: () => void;
      longPulse?: () => void;
      doublePulse?: () => void;
      customPattern?: (durations: number[]) => void;
    };
    return {
      shortPulse: vib.shortPulse ?? noop,
      longPulse: vib.longPulse ?? noop,
      doublePulse: vib.doublePulse ?? noop,
      customPattern: vib.customPattern ?? noopArr,
    };
  }

  return { shortPulse: noop, longPulse: noop, doublePulse: noop, customPattern: noopArr };
}

// ---------------------------------------------------------------------------
// useLight — backlight control
// ---------------------------------------------------------------------------

export interface UseLightResult {
  /** Trigger the backlight with normal auto-off timeout. */
  trigger: () => void;
  /** Force backlight on or off. */
  enable: (on: boolean) => void;
}

/**
 * Control the watch backlight.
 *
 * On Alloy: uses the `Light` global.
 * In mock mode: no-op functions.
 */
export function useLight(): UseLightResult {
  const noop = useCallback(() => {}, []);
  const noopBool = useCallback((_on: boolean) => {}, []);

  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Light) {
    const light = (globalThis as Record<string, unknown>).Light as {
      trigger?: () => void;
      enable?: (on: boolean) => void;
    };
    return {
      trigger: light.trigger ?? noop,
      enable: light.enable ?? noopBool,
    };
  }

  return { trigger: noop, enable: noopBool };
}

// ---------------------------------------------------------------------------
// useHealth — step count, distance, heart rate, sleep, calories
// ---------------------------------------------------------------------------

export interface HealthData {
  steps: number;
  distance: number;
  activeSeconds: number;
  calories: number;
  heartRate: number | null;
  sleepSeconds: number;
}

const MOCK_HEALTH: HealthData = {
  steps: 5432,
  distance: 3800,
  activeSeconds: 2400,
  calories: 210,
  heartRate: 72,
  sleepSeconds: 25200,
};

/**
 * Read health/fitness data from the Pebble Health service.
 *
 * On Alloy: reads from the `Health` or `__pbl_health` global.
 * In mock mode: returns static realistic data.
 *
 * @param pollInterval — how often to re-read in ms (default: 60000)
 */
export function useHealth(pollInterval = 60000): HealthData {
  const [data, setData] = useState<HealthData>(MOCK_HEALTH);

  useEffect(() => {
    const readHealth = () => {
      const g = globalThis as Record<string, unknown>;
      const health = (g.Health ?? g.__pbl_health) as {
        steps?: number;
        distance?: number;
        activeSeconds?: number;
        calories?: number;
        heartRate?: number | null;
        sleepSeconds?: number;
      } | undefined;

      if (health) {
        setData({
          steps: health.steps ?? 0,
          distance: health.distance ?? 0,
          activeSeconds: health.activeSeconds ?? 0,
          calories: health.calories ?? 0,
          heartRate: health.heartRate ?? null,
          sleepSeconds: health.sleepSeconds ?? 0,
        });
      }
    };

    readHealth();
    const id = setInterval(readHealth, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval]);

  return data;
}

// ---------------------------------------------------------------------------
// useHealthAlert — threshold-based health metric alerts (e.g. HR > 140)
// ---------------------------------------------------------------------------

export type HealthMetric =
  | 'steps'
  | 'activeSeconds'
  | 'walkedDistanceMeters'
  | 'sleepSeconds'
  | 'sleepRestfulSeconds'
  | 'restingKCalories'
  | 'activeKCalories'
  | 'heartRateBPM'
  | 'heartRateRawBPM';

export interface UseHealthAlertOptions {
  metric: HealthMetric;
  threshold: number;
  /** 'above' fires when crossing up; 'below' fires when crossing down. */
  direction?: 'above' | 'below';
  onTrigger: (value: number) => void;
}

/**
 * Register a metric alert — fires a callback when a health metric crosses
 * the given threshold. Mirrors `health_service_register_metric_alert`.
 *
 * On Alloy: uses `Health.registerMetricAlert(...)` if available.
 * In mock mode: polls `__pbl_health` at 5s intervals and compares.
 */
export function useHealthAlert(options: UseHealthAlertOptions): void {
  const { metric, threshold, direction = 'above', onTrigger } = options;
  const cbRef = useRef(onTrigger);
  cbRef.current = onTrigger;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      registerMetricAlert?: (metric: string, threshold: number, cb: (v: number) => void) => number;
      cancelMetricAlert?: (handle: number) => void;
    } | undefined;

    if (health?.registerMetricAlert) {
      const handle = health.registerMetricAlert(metric, threshold, (v) => {
        const crossed = direction === 'above' ? v >= threshold : v <= threshold;
        if (crossed) cbRef.current(v);
      });
      return () => health.cancelMetricAlert?.(handle);
    }

    // Mock: poll every 5 seconds.
    let lastValue = 0;
    const id = setInterval(() => {
      const src = (g.Health ?? g.__pbl_health) as Record<string, unknown> | undefined;
      if (!src) return;
      // Map metric to the data field on MOCK_HEALTH / Health global
      const fieldMap: Record<HealthMetric, string> = {
        steps: 'steps',
        activeSeconds: 'activeSeconds',
        walkedDistanceMeters: 'distance',
        sleepSeconds: 'sleepSeconds',
        sleepRestfulSeconds: 'sleepRestfulSeconds',
        restingKCalories: 'restingCalories',
        activeKCalories: 'calories',
        heartRateBPM: 'heartRate',
        heartRateRawBPM: 'heartRate',
      };
      const v = Number(src[fieldMap[metric]] ?? 0);
      const crossed = direction === 'above'
        ? lastValue < threshold && v >= threshold
        : lastValue > threshold && v <= threshold;
      if (crossed) cbRef.current(v);
      lastValue = v;
    }, 5000);
    return () => clearInterval(id);
  }, [metric, threshold, direction]);
}

// ---------------------------------------------------------------------------
// useHeartRateMonitor — tune HRM sampling cadence (battery vs. freshness)
// ---------------------------------------------------------------------------

export interface UseHeartRateMonitorOptions {
  /**
   * Desired sampling interval in seconds. Mirrors
   * `health_service_set_heart_rate_sample_period()`. Low values drain battery.
   * The system will cap the duration; use `expiresAt` to know when the
   * aggressive sampling lapses.
   */
  samplePeriodSeconds: number;
}

export interface UseHeartRateMonitorResult {
  /** Unix ms when the aggressive sample period expires (0 if not running). */
  expiresAt: number;
  /** Manually extend the aggressive sampling window. */
  refresh: () => void;
}

/**
 * Request more frequent heart rate samples than the default (typically
 * every 10 minutes) — used by workout or resting-HR features.
 *
 * On Alloy: uses `Health.setHeartRateSamplePeriod(seconds)` and
 * `Health.getHeartRateSamplePeriodExpirationSec()`.
 * In mock mode: stores the expiry locally.
 */
export function useHeartRateMonitor(options: UseHeartRateMonitorOptions): UseHeartRateMonitorResult {
  const { samplePeriodSeconds } = options;
  const [expiresAt, setExpiresAt] = useState(0);

  const apply = useCallback(() => {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      setHeartRateSamplePeriod?: (seconds: number) => void;
      getHeartRateSamplePeriodExpirationSec?: () => number;
    } | undefined;
    if (health?.setHeartRateSamplePeriod) {
      health.setHeartRateSamplePeriod(samplePeriodSeconds);
      const expSec = health.getHeartRateSamplePeriodExpirationSec?.() ?? samplePeriodSeconds * 60;
      setExpiresAt(Date.now() + expSec * 1000);
    } else {
      // Mock: expire after samplePeriodSeconds * 60
      setExpiresAt(Date.now() + samplePeriodSeconds * 60 * 1000);
    }
  }, [samplePeriodSeconds]);

  useEffect(() => {
    apply();
  }, [apply]);

  return { expiresAt, refresh: apply };
}

// ---------------------------------------------------------------------------
// useHealthHistory — minute-by-minute history of a metric
// ---------------------------------------------------------------------------

export interface UseHealthHistoryOptions {
  metric: HealthMetric;
  /** How many minutes of history to fetch (max 60 on most platforms). */
  minutes: number;
}

/**
 * Fetch a minute-by-minute history of a health metric.
 * Mirrors `health_service_get_minute_history()`.
 *
 * On Alloy: uses `Health.getMinuteHistory(metric, minutes)`.
 * In mock mode: returns synthetic data approximating the metric's typical range.
 */
export function useHealthHistory(options: UseHealthHistoryOptions): number[] {
  const { metric, minutes } = options;
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      getMinuteHistory?: (metric: string, minutes: number) => number[];
    } | undefined;
    if (health?.getMinuteHistory) {
      setHistory(health.getMinuteHistory(metric, minutes));
      return;
    }
    // Mock: synthetic values
    const base = metric === 'heartRateBPM' || metric === 'heartRateRawBPM' ? 72
      : metric === 'steps' ? 80
      : metric === 'walkedDistanceMeters' ? 60
      : metric === 'activeKCalories' ? 2
      : metric === 'sleepSeconds' ? 60
      : 0;
    const mock = Array.from({ length: minutes }, (_, i) =>
      Math.max(0, Math.round(base + Math.sin(i / 3) * (base * 0.2))),
    );
    setHistory(mock);
  }, [metric, minutes]);

  return history;
}

// ---------------------------------------------------------------------------
// useMeasurementSystem — user's preferred measurement system
// ---------------------------------------------------------------------------

export type MeasurementSystem = 'metric' | 'imperial' | 'unknown';

/**
 * Returns the user's preferred measurement system for health data display.
 * Mirrors `health_service_get_measurement_system_for_display()`.
 *
 * On Alloy: reads from `Health.measurementSystem` or
 * `Health.getMeasurementSystemForDisplay()`.
 * In mock mode: infers from `useLocale().country` (US → imperial, else metric).
 */
export function useMeasurementSystem(): MeasurementSystem {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    const health = (g.Health ?? g.__pbl_health) as {
      measurementSystem?: MeasurementSystem;
      getMeasurementSystemForDisplay?: () => MeasurementSystem;
    } | undefined;
    if (health?.getMeasurementSystemForDisplay) {
      return health.getMeasurementSystemForDisplay();
    }
    if (health?.measurementSystem) {
      return health.measurementSystem;
    }
  }
  // Mock mode (Node compile): default to 'metric' so snapshots are stable
  // regardless of host OS locale. On-device the actual health global above
  // always wins. Users whose app needs a specific system at compile time
  // can set `process.env.PEBBLE_MEASUREMENT_SYSTEM` to 'imperial'.
  const envPref = typeof process !== 'undefined' ? process.env?.PEBBLE_MEASUREMENT_SYSTEM : undefined;
  if (envPref === 'imperial' || envPref === 'metric' || envPref === 'unknown') {
    return envPref;
  }
  return 'metric';
}

// ---------------------------------------------------------------------------
// useTimer — one-shot delayed callback
// ---------------------------------------------------------------------------

export interface UseTimerResult {
  /** Start a one-shot timer. Replaces any pending timer. */
  start: (delayMs: number) => void;
  /** Cancel the pending timer. */
  cancel: () => void;
  /** Whether the timer has fired since last start. */
  fired: boolean;
}

/**
 * One-shot timer (complement to `useInterval`).
 *
 * The callback ref is kept stable — changing the callback between renders
 * does not restart the timer.
 */
export function useTimer(callback: () => void): UseTimerResult {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fired, setFired] = useState(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((delayMs: number) => {
    cancel();
    setFired(false);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFired(true);
      cbRef.current();
    }, delayMs);
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => () => cancel(), [cancel]);

  return { start, cancel, fired };
}

// ---------------------------------------------------------------------------
// useWatchInfo — device model, platform, display capabilities
// ---------------------------------------------------------------------------

export interface WatchInfo {
  model: string;
  platform: string;
  isRound: boolean;
  isColor: boolean;
}

/**
 * Returns information about the watch hardware.
 *
 * On Alloy: reads from `WatchInfo` global if available.
 * In mock mode: derives from SCREEN constants.
 */
export function useWatchInfo(): WatchInfo {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).WatchInfo) {
    const info = (globalThis as Record<string, unknown>).WatchInfo as {
      model?: string;
      platform?: string;
      isRound?: boolean;
      isColor?: boolean;
    };
    return {
      model: info.model ?? 'unknown',
      platform: info.platform ?? 'unknown',
      isRound: info.isRound ?? false,
      isColor: info.isColor ?? true,
    };
  }

  // Mock mode: derive from SCREEN (imported lazily to avoid circular deps)
  return {
    model: 'mock',
    platform: 'emery',
    isRound: false,
    isColor: true,
  };
}

// ---------------------------------------------------------------------------
// useLocale — system language/locale detection
// ---------------------------------------------------------------------------

export interface LocaleInfo {
  language: string;
  country: string;
}

/**
 * Returns the system locale.
 *
 * On Alloy/modern JS: uses `Intl.DateTimeFormat`.
 * In mock mode: returns `{ language: 'en', country: 'US' }`.
 */
export function useLocale(): LocaleInfo {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const opts = new Intl.DateTimeFormat().resolvedOptions();
      const parts = opts.locale.split('-');
      return {
        language: parts[0] ?? 'en',
        country: parts[1] ?? 'US',
      };
    }
  } catch {
    // Intl not available
  }
  return { language: 'en', country: 'US' };
}

// ---------------------------------------------------------------------------
// useUnobstructedArea — adapt to timeline peek obstructions
// ---------------------------------------------------------------------------

export interface UnobstructedArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Returns the unobstructed screen area (excluding timeline peek, etc.).
 *
 * On Alloy: reads `screen.unobstructed`.
 * In mock mode: returns full screen dimensions.
 */
export function useUnobstructedArea(): UnobstructedArea {
  if (typeof screen !== 'undefined' && screen) {
    const s = screen as unknown as {
      width: number; height: number;
      unobstructed?: { x: number; y: number; w: number; h: number };
    };
    if (s.unobstructed) return { x: s.unobstructed.x, y: s.unobstructed.y, w: s.unobstructed.w, h: s.unobstructed.h };
    return { x: 0, y: 0, w: s.width, h: s.height };
  }
  // Mock mode
  return { x: 0, y: 0, w: 200, h: 228 };
}

// ---------------------------------------------------------------------------
// useMultiClick — double-click, triple-click detection
// ---------------------------------------------------------------------------

export interface MultiClickOptions {
  /** Number of clicks to detect (default: 2 for double-click). */
  count?: number;
  /** Maximum interval between clicks in ms (default: 300). */
  maxInterval?: number;
}

/**
 * Detect multi-click patterns (double-click, triple-click, etc.).
 *
 * The handler fires only when exactly `count` clicks occur within
 * `maxInterval` ms of each other.
 */
export function useMultiClick(
  button: PebbleButton,
  handler: PebbleButtonHandler,
  options: MultiClickOptions = {},
): void {
  const { count = 2, maxInterval = 300 } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const clickTimesRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useButton(button, () => {
    const now = Date.now();
    clickTimesRef.current.push(now);

    // Trim old clicks outside the window
    clickTimesRef.current = clickTimesRef.current.filter(
      (t) => now - t <= maxInterval,
    );

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    if (clickTimesRef.current.length >= count) {
      clickTimesRef.current = [];
      handlerRef.current();
    } else {
      // Reset after window expires
      timerRef.current = setTimeout(() => {
        clickTimesRef.current = [];
        timerRef.current = null;
      }, maxInterval);
    }
  });
}

// ---------------------------------------------------------------------------
// useRepeatClick — auto-repeating button press
// ---------------------------------------------------------------------------

export interface RepeatClickOptions {
  /** Delay before repeating starts in ms (default: 500). */
  initialDelay?: number;
  /** Interval between repeats in ms (default: 100). */
  repeatInterval?: number;
}

/**
 * Fire a handler repeatedly while a button is held down.
 *
 * Fires once immediately on press, then starts repeating after
 * `initialDelay` ms at `repeatInterval` ms intervals. Uses long-press
 * detection to start the repeat cycle.
 */
export function useRepeatClick(
  button: PebbleButton,
  handler: PebbleButtonHandler,
  options: RepeatClickOptions = {},
): void {
  const { initialDelay = 500, repeatInterval = 100 } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Fire once on initial press
  useButton(button, () => {
    handlerRef.current();
  });

  // Start repeating on long press
  useLongButton(button, () => {
    stopRepeat();
    // Wait initial delay, then repeat
    const startTimer = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        handlerRef.current();
      }, repeatInterval);
    }, initialDelay);
    // Store timer ID in interval ref temporarily for cleanup
    intervalRef.current = startTimer as unknown as ReturnType<typeof setInterval>;
  });

  // Cleanup on unmount
  useEffect(() => () => stopRepeat(), [stopRepeat]);
}

// ---------------------------------------------------------------------------
// Background Worker API
// ---------------------------------------------------------------------------

export interface WorkerMessage {
  /** User-defined message type. 0 is reserved for Pebble system messages. */
  type: number;
  /** Opaque payload. Workers typically pack small ints here. */
  data?: number;
}

export type WorkerResult =
  | 'success'
  | 'notRunning'
  | 'alreadyRunning'
  | 'differentApp'
  | 'notInstalled'
  | 'error';

export interface UseWorkerLaunchResult {
  /** Spawn the bundled background worker. */
  launch: () => WorkerResult;
  /** Stop the background worker. */
  kill: () => WorkerResult;
  /** Whether the worker is currently running. */
  isRunning: boolean;
  /** Re-check running status (updates `isRunning`). */
  refresh: () => void;
}

/**
 * Control the app's bundled background worker.
 *
 * On Alloy/C: wraps `app_worker_launch()`, `app_worker_kill()`,
 * `app_worker_is_running()`.
 * In mock mode: tracks launch/kill state in memory.
 */
export function useWorkerLaunch(): UseWorkerLaunchResult {
  const [isRunning, setRunning] = useState(false);

  const readState = useCallback(() => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.app_worker_is_running === 'function') {
      return Boolean((g.app_worker_is_running as () => boolean)());
    }
    const w = g.AppWorker as { isRunning?: () => boolean } | undefined;
    return Boolean(w?.isRunning?.());
  }, []);

  const refresh = useCallback(() => setRunning(readState()), [readState]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const launch = useCallback((): WorkerResult => {
    const g = globalThis as Record<string, unknown>;
    const resultMap: Record<number, WorkerResult> = {
      0: 'success', 1: 'alreadyRunning', 2: 'differentApp', 3: 'notInstalled', 4: 'error',
    };
    if (typeof g.app_worker_launch === 'function') {
      const code = (g.app_worker_launch as () => number)();
      refresh();
      return resultMap[code] ?? 'error';
    }
    const w = g.AppWorker as { launch?: () => WorkerResult } | undefined;
    if (w?.launch) {
      const r = w.launch();
      refresh();
      return r;
    }
    setRunning(true);
    return 'success';
  }, [refresh]);

  const kill = useCallback((): WorkerResult => {
    const g = globalThis as Record<string, unknown>;
    const resultMap: Record<number, WorkerResult> = {
      0: 'success', 1: 'notRunning', 2: 'differentApp', 4: 'error',
    };
    if (typeof g.app_worker_kill === 'function') {
      const code = (g.app_worker_kill as () => number)();
      refresh();
      return resultMap[code] ?? 'error';
    }
    const w = g.AppWorker as { kill?: () => WorkerResult } | undefined;
    if (w?.kill) {
      const r = w.kill();
      refresh();
      return r;
    }
    setRunning(false);
    return 'success';
  }, [refresh]);

  return { launch, kill, isRunning, refresh };
}

/**
 * Subscribe to messages from the background worker (or, when used inside
 * a worker context, messages from the foreground app).
 *
 * On Alloy/C: uses `app_worker_message_subscribe()`.
 * In mock mode: no-op.
 */
export function useWorkerMessage(handler: (msg: WorkerMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const dispatch = (type: number, data?: number) => handlerRef.current({ type, data });

    if (typeof g.app_worker_message_subscribe === 'function') {
      (g.app_worker_message_subscribe as (cb: (type: number, data: number) => void) => void)(
        (type, data) => dispatch(type, data),
      );
      return () => {
        if (typeof g.app_worker_message_unsubscribe === 'function') {
          (g.app_worker_message_unsubscribe as () => void)();
        }
      };
    }
    const w = g.AppWorker as {
      onMessage?: (cb: (msg: WorkerMessage) => void) => void;
      offMessage?: (cb: (msg: WorkerMessage) => void) => void;
    } | undefined;
    if (w?.onMessage) {
      const cb = (msg: WorkerMessage) => handlerRef.current(msg);
      w.onMessage(cb);
      return () => w.offMessage?.(cb);
    }
    return undefined;
  }, []);
}

export interface UseWorkerSenderResult {
  /** Send a message to the worker (from foreground app) or to the app (from worker). */
  send: (msg: WorkerMessage) => void;
}

/**
 * Returns a `send(msg)` function for cross-process messaging with the
 * background worker. Mirrors `app_worker_send_message()`.
 */
export function useWorkerSender(): UseWorkerSenderResult {
  const send = useCallback((msg: WorkerMessage) => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.app_worker_send_message === 'function') {
      (g.app_worker_send_message as (type: number, data: number) => void)(
        msg.type,
        msg.data ?? 0,
      );
      return;
    }
    const w = g.AppWorker as {
      send?: (msg: WorkerMessage) => void;
    } | undefined;
    w?.send?.(msg);
  }, []);

  return { send };
}

// ---------------------------------------------------------------------------
// useRawClick — low-level press/release events for gesture timing
// ---------------------------------------------------------------------------

export interface UseRawClickOptions {
  onDown?: () => void;
  onUp?: () => void;
}

/**
 * Subscribe to separate button-down and button-up events for a given button.
 * Useful for gesture timing, chorded input, or custom click patterns that
 * the standard `useButton` / `useLongButton` / `useMultiClick` don't cover.
 *
 * Mirrors `window_raw_click_subscribe()` on the C side.
 *
 * Down/up events are published through `ButtonRegistry` using the
 * `raw_down_<button>` and `raw_up_<button>` keys. The renderer is expected
 * to emit those keys when it detects a raw press/release.
 */
export function useRawClick(button: PebbleButton, options: UseRawClickOptions): void {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const downKey: ButtonRegistryKey = `raw_down_${button}`;
    const upKey: ButtonRegistryKey = `raw_up_${button}`;
    const onDown = () => optsRef.current.onDown?.();
    const onUp = () => optsRef.current.onUp?.();
    ButtonRegistry.subscribe(downKey, onDown);
    ButtonRegistry.subscribe(upKey, onUp);
    return () => {
      ButtonRegistry.unsubscribe(downKey, onDown);
      ButtonRegistry.unsubscribe(upKey, onUp);
    };
  }, [button]);
}

// ---------------------------------------------------------------------------
// useWakeup — schedule app launches at future times
// ---------------------------------------------------------------------------

export interface UseWakeupResult {
  /** Schedule a wakeup. Returns wakeup ID or null on failure. */
  schedule: (timestamp: number, cookie?: number) => number | null;
  /** Cancel a scheduled wakeup. */
  cancel: (id: number) => void;
  /** Cancel all wakeups for this app. */
  cancelAll: () => void;
  /** The wakeup event that launched this app (null if normal launch). */
  launchEvent: { id: number; cookie: number } | null;
}

/**
 * Schedule the app to launch at a future time.
 *
 * On Alloy: uses the `Wakeup` global (max 8 per app).
 * In mock mode: no-op with null returns.
 */
export function useWakeup(): UseWakeupResult {
  const [launchEvent] = useState<{ id: number; cookie: number } | null>(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        getLaunchEvent?: () => { id: number; cookie: number } | null;
      };
      return wk.getLaunchEvent?.() ?? null;
    }
    return null;
  });

  const schedule = useCallback((timestamp: number, cookie = 0): number | null => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        schedule?: (ts: number, cookie: number) => number | null;
      };
      return wk.schedule?.(timestamp, cookie) ?? null;
    }
    return null;
  }, []);

  const cancel = useCallback((id: number) => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        cancel?: (id: number) => void;
      };
      wk.cancel?.(id);
    }
  }, []);

  const cancelAll = useCallback(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Wakeup) {
      const wk = (globalThis as Record<string, unknown>).Wakeup as {
        cancelAll?: () => void;
      };
      wk.cancelAll?.();
    }
  }, []);

  return { schedule, cancel, cancelAll, launchEvent };
}

// ---------------------------------------------------------------------------
// useDictation — voice-to-text input
// ---------------------------------------------------------------------------

export type DictationStatus = 'idle' | 'listening' | 'transcribing' | 'done' | 'error' | 'unsupported';

export interface UseDictationResult {
  text: string | null;
  status: DictationStatus;
  start: () => void;
  error: string | null;
}

/**
 * Voice-to-text dictation.
 *
 * On Alloy: uses the `Dictation` global if available.
 * In mock mode: returns `status: 'unsupported'`.
 */
export function useDictation(): UseDictationResult {
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<DictationStatus>(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Dictation) {
      return 'idle';
    }
    return 'unsupported';
  });
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Dictation) {
      const dict = (globalThis as Record<string, unknown>).Dictation as {
        start?: (cb: (result: string | null, st: string) => void) => void;
      };
      setStatus('listening');
      setError(null);
      dict.start?.((result, st) => {
        if (result) {
          setText(result);
          setStatus('done');
        } else {
          setError(st || 'Dictation failed');
          setStatus('error');
        }
      });
    }
  }, []);

  return { text, status, start, error };
}

// ---------------------------------------------------------------------------
// useAnimationSequence — chain multiple animations in sequence
// ---------------------------------------------------------------------------

export interface AnimationSequenceStep {
  duration: number;
  easing?: EasingFn;
}

export interface UseAnimationSequenceResult {
  /** Overall progress (0 to 1). */
  progress: number;
  /** Index of the currently active step. */
  stepIndex: number;
  /** Progress within the current step (0 to 1). */
  stepProgress: number;
}

/**
 * Run multiple animations in sequence. Returns overall progress and
 * which step is currently active.
 *
 * Uses wall-clock time (via `useTime`) for compiler compatibility.
 */
export function useAnimationSequence(steps: AnimationSequenceStep[]): UseAnimationSequenceResult {
  const time = useTime(1000);
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();
  const totalDurationSec = totalDuration / 1000;

  const elapsed = (totalSeconds % totalDurationSec) * 1000;

  let accumulated = 0;
  let stepIndex = 0;
  let stepProgress = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (elapsed < accumulated + step.duration) {
      stepIndex = i;
      const raw = (elapsed - accumulated) / step.duration;
      stepProgress = step.easing ? step.easing(raw) : raw;
      break;
    }
    accumulated += step.duration;
    if (i === steps.length - 1) {
      stepIndex = i;
      stepProgress = 1;
    }
  }

  const overallRaw = elapsed / totalDuration;
  const progress = Math.min(overallRaw, 1);

  return { progress, stepIndex, stepProgress };
}

// ---------------------------------------------------------------------------
// useAnimationSpawn — run multiple animations in parallel
// ---------------------------------------------------------------------------

export interface UseAnimationSpawnResult {
  /** Progress for each animation (0 to 1), eased. */
  progresses: number[];
  /** Whether all animations have completed one cycle. */
  allComplete: boolean;
}

/**
 * Run multiple animations simultaneously. Returns an array of progress
 * values, one per animation.
 *
 * Uses wall-clock time (via `useTime`) for compiler compatibility.
 */
export function useAnimationSpawn(animations: UseAnimationOptions[]): UseAnimationSpawnResult {
  const time = useTime(1000);
  const totalSeconds = time.getMinutes() * 60 + time.getSeconds();

  const progresses = animations.map((anim) => {
    const durationSec = anim.duration / 1000;
    const easing = anim.easing ?? Easing.linear;
    const raw = anim.loop
      ? (totalSeconds % durationSec) / durationSec
      : Math.min(totalSeconds / durationSec, 1);
    return easing(raw);
  });

  const maxDuration = Math.max(...animations.map((a) => a.duration));
  const allComplete = !animations.some((a) => a.loop) &&
    totalSeconds >= maxDuration / 1000;

  return { progresses, allComplete };
}

// ---------------------------------------------------------------------------
// useDataLogging — batch data collection to phone
// ---------------------------------------------------------------------------

export interface UseDataLoggingResult {
  /** Log a data item. Returns true on success. */
  log: (data: string) => boolean;
  /** Close the logging session. */
  finish: () => void;
  /** Whether the session is active. */
  active: boolean;
}

/**
 * Batch data collection for transmission to the phone.
 *
 * On Alloy: uses the `DataLogging` global.
 * In mock mode: logs to console.
 */
export function useDataLogging(tag: number): UseDataLoggingResult {
  const sessionRef = useRef<{ log: (d: string) => boolean; finish: () => void } | null>(null);
  const [active, setActive] = useState(false);

  if (!sessionRef.current) {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).DataLogging) {
      const dl = (globalThis as Record<string, unknown>).DataLogging as {
        create?: (tag: number, type: string, size: number) => {
          log: (d: string) => boolean;
          finish: () => void;
        } | null;
      };
      const session = dl.create?.(tag, 'byte', 1);
      if (session) {
        sessionRef.current = session;
        setActive(true);
      }
    }

    if (!sessionRef.current) {
      // Mock: log to console
      sessionRef.current = {
        log: (d: string) => { /* no-op in mock */ return true; },
        finish: () => {},
      };
    }
  }

  const log = useCallback((data: string) => {
    return sessionRef.current?.log(data) ?? false;
  }, []);

  const finish = useCallback(() => {
    sessionRef.current?.finish();
    setActive(false);
  }, []);

  return { log, finish, active };
}

// ---------------------------------------------------------------------------
// useAppGlance — app launcher status display
// ---------------------------------------------------------------------------

export interface AppGlanceSlice {
  subtitle: string;
  icon?: unknown;
  expirationTime?: number;
}

export interface UseAppGlanceResult {
  update: (slices: AppGlanceSlice[]) => void;
}

/**
 * Build an AppGlance subtitle that dynamically renders as a countdown to
 * the given future timestamp (e.g. "in 5 min"). Mirrors the Pebble
 * `time_until` template format (%aT = abbreviated hours/mins, %uT = unit,
 * %0T = zero-padded digits).
 *
 * @param unixSecondsFuture — target Unix time in seconds
 * @param format — template string; defaults to `"%aT"` (e.g. "5m", "2h")
 */
export function appGlanceTimeUntil(unixSecondsFuture: number, format: string = '%aT'): string {
  return `<time_until ts="${unixSecondsFuture}" format="${format}">`;
}

/**
 * Build an AppGlance subtitle that dynamically renders as the elapsed time
 * since the given past timestamp (e.g. "3 min ago"). Mirrors
 * `time_since` template format.
 *
 * @param unixSecondsPast — past Unix time in seconds
 * @param format — template string; defaults to `"%aT ago"`
 */
export function appGlanceTimeSince(unixSecondsPast: number, format: string = '%aT ago'): string {
  return `<time_since ts="${unixSecondsPast}" format="${format}">`;
}

/**
 * Update the app glance (status shown in the app launcher).
 *
 * On Alloy: uses the `AppGlance` global.
 * In mock mode: no-op.
 */
export function useAppGlance(): UseAppGlanceResult {
  const update = useCallback((slices: AppGlanceSlice[]) => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppGlance) {
      const ag = (globalThis as Record<string, unknown>).AppGlance as {
        update?: (slices: AppGlanceSlice[]) => void;
      };
      ag.update?.(slices);
    }
  }, []);

  return { update };
}

// ---------------------------------------------------------------------------
// useTimeline — push timeline pins (full Pebble pin spec)
//
// The pushPin payload follows the Pebble timeline public API exactly:
//   https://developer.repebble.com/guides/pebble-timeline/pin-structure/
//
// When the Moddable `Timeline` global is available it's called directly.
// Otherwise, the pin is stringified and sent to the phone side via
// AppMessage using the reserved key `_rpTLPush`; the compiler-emitted PKJS
// HTTP-PUTs to the public web API using the user's timeline token.
// ---------------------------------------------------------------------------

/** Values for `layout.type` — one per Pebble pin layout. */
export type TimelinePinLayoutType =
  | 'genericPin'
  | 'calendarPin'
  | 'sportsPin'
  | 'weatherPin'
  | 'genericReminder'
  | 'genericNotification'
  | 'commNotification';

/** Any valid Pebble color hex code (`#RRGGBB`) or named palette key. */
export type TimelineColor = string;

export interface TimelinePinLayout {
  type: TimelinePinLayoutType;
  title: string;
  subtitle?: string;
  body?: string;
  shortTitle?: string;
  shortSubtitle?: string;
  tinyIcon?: string;
  smallIcon?: string;
  largeIcon?: string;
  locationName?: string;
  primaryColor?: TimelineColor;
  secondaryColor?: TimelineColor;
  backgroundColor?: TimelineColor;
  headings?: string[];
  paragraphs?: string[];
  lastUpdated?: number;
  /** Sports-layout fields — score/ranks etc. */
  rankAway?: string;
  rankHome?: string;
  nameAway?: string;
  nameHome?: string;
  recordAway?: string;
  recordHome?: string;
  scoreAway?: string;
  scoreHome?: string;
  sportsGameState?: 'pre-game' | 'in-game';
  broadcaster?: string;
  /** Allow extra layout fields documented by specific layout types. */
  [key: string]: unknown;
}

export interface TimelinePinActionHttp {
  type: 'http';
  title: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  bodyText?: string;
  bodyJSON?: unknown;
  successText?: string;
  successIcon?: string;
  failureText?: string;
  failureIcon?: string;
}

export interface TimelinePinActionOpenWatchApp {
  type: 'openWatchApp';
  title: string;
  /** 32-bit integer forwarded to the watchapp on launch. */
  launchCode: number;
}

export interface TimelinePinActionRemove {
  type: 'remove';
  title: string;
}

export type TimelinePinAction =
  | TimelinePinActionHttp
  | TimelinePinActionOpenWatchApp
  | TimelinePinActionRemove;

export interface TimelinePinReminder {
  time: number;
  layout: TimelinePinLayout;
}

export interface TimelinePinNotification {
  time?: number;
  layout: TimelinePinLayout;
}

export interface TimelinePin {
  /** Unique identifier for this pin (used for updates and removal). */
  id: string;
  /** Unix milliseconds — when the pin should appear on the timeline. */
  time: number;
  /** Display duration in minutes (default 60). */
  duration?: number;
  /** Layout payload — at minimum a title. */
  layout: TimelinePinLayout;
  reminders?: TimelinePinReminder[];
  actions?: TimelinePinAction[];
  createNotification?: TimelinePinNotification;
  updateNotification?: TimelinePinNotification;
}

/** Shorthand builder for an `openWatchApp` pin action. */
export const TimelineAction = {
  openWatchApp(title: string, launchCode: number): TimelinePinActionOpenWatchApp {
    return { type: 'openWatchApp', title, launchCode };
  },
  http(action: Omit<TimelinePinActionHttp, 'type'>): TimelinePinActionHttp {
    return { type: 'http', ...action };
  },
  remove(title = 'Remove'): TimelinePinActionRemove {
    return { type: 'remove', title };
  },
};

export interface UseTimelineResult {
  pushPin: (pin: TimelinePin) => void;
  removePin: (id: string) => void;
}

/**
 * Push or remove timeline pins.
 *
 * On Alloy: uses the `Timeline` global if present, otherwise forwards
 * the pin to the phone via AppMessage (`_rpTLPush` / `_rpTLRemove`).
 * In mock mode: no-op.
 */
export function useTimeline(): UseTimelineResult {
  const pushPin = useCallback((pin: TimelinePin) => {
    if (typeof globalThis === 'undefined') return;
    const tl = (globalThis as Record<string, unknown>).Timeline as
      | { pushPin?: (pin: TimelinePin) => void }
      | undefined;
    if (tl?.pushPin) {
      tl.pushPin(pin);
      return;
    }
    // Fallback: forward to PKJS over AppMessage.
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLPush: JSON.stringify(pin) });
  }, []);

  const removePin = useCallback((id: string) => {
    if (typeof globalThis === 'undefined') return;
    const tl = (globalThis as Record<string, unknown>).Timeline as
      | { removePin?: (id: string) => void }
      | undefined;
    if (tl?.removePin) {
      tl.removePin(id);
      return;
    }
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLRemove: id });
  }, []);

  return { pushPin, removePin };
}

// ---------------------------------------------------------------------------
// useQuietTime — detect Do Not Disturb mode
// ---------------------------------------------------------------------------

/**
 * Returns whether the watch is in Quiet Time (Do Not Disturb) mode.
 * Useful for watchfaces that should suppress animations or reduce
 * update frequency during Quiet Time.
 *
 * On Alloy: reads the `QuietTime` global.
 * In mock mode: returns false.
 */
export function useQuietTime(): boolean {
  const [isQuiet, setIsQuiet] = useState(false);

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).QuietTime) {
      const qt = (globalThis as Record<string, unknown>).QuietTime as {
        isActive?: () => boolean;
      };
      setIsQuiet(qt.isActive?.() ?? false);
    }
  }, []);

  return isQuiet;
}

// ---------------------------------------------------------------------------
// useAppFocus — detect when app is obscured by system UI
// ---------------------------------------------------------------------------

export interface AppFocusOptions {
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface AppFocusResult {
  focused: boolean;
}

/**
 * Track whether the app is currently in focus (not obscured by
 * notifications or system UI).
 *
 * On Alloy: subscribes to watch focus/blur events.
 * In mock mode: returns { focused: true }.
 */
export function useAppFocus(options?: AppFocusOptions): AppFocusResult {
  const [focused, setFocused] = useState(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).watch) {
      const w = (globalThis as Record<string, unknown>).watch as {
        addEventListener?: (event: string, handler: () => void) => void;
        removeEventListener?: (event: string, handler: () => void) => void;
      };
      const handleFocus = () => {
        setFocused(true);
        optionsRef.current?.onFocus?.();
      };
      const handleBlur = () => {
        setFocused(false);
        optionsRef.current?.onBlur?.();
      };
      w.addEventListener?.('focus', handleFocus);
      w.addEventListener?.('blur', handleBlur);
      return () => {
        w.removeEventListener?.('focus', handleFocus);
        w.removeEventListener?.('blur', handleBlur);
      };
    }
    return undefined;
  }, []);

  return { focused };
}

// ---------------------------------------------------------------------------
// useContentSize — user's preferred content size (accessibility)
// ---------------------------------------------------------------------------

export type ContentSize = 'small' | 'default' | 'large' | 'extraLarge';

/**
 * Returns the user's preferred content size setting.
 * Useful for adapting font sizes and spacing for accessibility.
 *
 * On Alloy: reads the `ContentSize` global.
 * In mock mode: returns 'default'.
 */
export function useContentSize(): ContentSize {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).ContentSize) {
    const cs = (globalThis as Record<string, unknown>).ContentSize as {
      preferred?: () => string;
    };
    const pref = cs.preferred?.();
    if (pref === 'small' || pref === 'large' || pref === 'extraLarge') return pref;
  }
  return 'default';
}

// ---------------------------------------------------------------------------
// useDisplayBounds — content rect that accounts for round displays
// ---------------------------------------------------------------------------

export interface DisplayBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  isRound: boolean;
}

/**
 * Returns the usable content rectangle for the current display shape.
 * On round displays, this inscribes a rectangle inside the circle,
 * inset by the given padding. On rectangular displays, returns the
 * full screen minus padding.
 */
export function useDisplayBounds(padding: number = 0): DisplayBounds {
  // Import SCREEN lazily to avoid circular deps
  const screen = (globalThis as Record<string, unknown>).__PEBBLE_SCREEN__ as
    | { width: number; height: number; isRound: boolean }
    | undefined;

  const w = screen?.width ?? 200;
  const h = screen?.height ?? 228;
  const isRound = screen?.isRound ?? false;

  if (isRound) {
    // Inscribe a rectangle in the circle (largest rect with ~70.7% of diameter)
    const r = Math.min(w, h) / 2;
    const inset = Math.round(r - (r * Math.SQRT1_2)) + padding;
    return {
      x: inset,
      y: inset,
      w: w - inset * 2,
      h: h - inset * 2,
      isRound: true,
    };
  }

  return {
    x: padding,
    y: padding,
    w: w - padding * 2,
    h: h - padding * 2,
    isRound: false,
  };
}

// ---------------------------------------------------------------------------
// useConfiguration — phone-side settings page
// ---------------------------------------------------------------------------

export interface UseConfigurationOptions<T extends Record<string, unknown>> {
  /** URL of the phone-side configuration page */
  url: string;
  /** Default settings values */
  defaults: T;
}

export interface UseConfigurationResult<T extends Record<string, unknown>> {
  settings: T;
  openConfiguration: () => void;
  updateSettings: (partial: Partial<T>) => void;
}

/**
 * Manage app configuration via a phone-side settings page.
 * Settings are persisted to localStorage and synced when the
 * config page sends data back.
 *
 * On Alloy: opens config URL on phone via PebbleKit JS.
 * In mock mode: uses defaults, updateSettings mutates in-memory.
 */
export function useConfiguration<T extends Record<string, unknown>>(
  options: UseConfigurationOptions<T>,
): UseConfigurationResult<T> {
  const [settings, setSettings] = useState<T>(() => {
    // Try to load from localStorage
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).localStorage) {
      try {
        const stored = (globalThis as Record<string, unknown>).localStorage as Storage;
        const raw = stored.getItem('__pebble_config__');
        if (raw) return { ...options.defaults, ...JSON.parse(raw) };
      } catch {
        // ignore parse errors
      }
    }
    return options.defaults;
  });

  const openConfiguration = useCallback(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Pebble) {
      const pbl = (globalThis as Record<string, unknown>).Pebble as {
        openURL?: (url: string) => void;
      };
      pbl.openURL?.(options.url);
    }
  }, [options.url]);

  const updateSettings = useCallback((partial: Partial<T>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).localStorage) {
        try {
          const stored = (globalThis as Record<string, unknown>).localStorage as Storage;
          stored.setItem('__pebble_config__', JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
      }
      return next;
    });
  }, []);

  // Listen for config data coming back from the phone
  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Pebble) {
      const pbl = (globalThis as Record<string, unknown>).Pebble as {
        addEventListener?: (event: string, handler: (e: { response: string }) => void) => void;
        removeEventListener?: (event: string, handler: (e: { response: string }) => void) => void;
      };
      const handler = (e: { response: string }) => {
        try {
          const data = JSON.parse(decodeURIComponent(e.response)) as Partial<T>;
          updateSettings(data);
        } catch {
          // ignore parse errors
        }
      };
      pbl.addEventListener?.('webviewclosed', handler);
      return () => {
        pbl.removeEventListener?.('webviewclosed', handler);
      };
    }
    return undefined;
  }, [updateSettings]);

  return { settings, openConfiguration, updateSettings };
}

// ---------------------------------------------------------------------------
// useAppSync — simplified bidirectional phone-watch data sync
// ---------------------------------------------------------------------------

export interface UseAppSyncOptions<T extends Record<string, unknown>> {
  /** Initial key-value pairs to synchronize */
  keys: T;
}

export interface UseAppSyncResult<T extends Record<string, unknown>> {
  values: T;
  update: (partial: Partial<T>) => void;
}

/**
 * Simplified phone↔watch data synchronization.
 * Maintains a synchronized set of key-value pairs between phone and watch.
 *
 * On Alloy: uses AppMessage for bidirectional sync.
 * In mock mode: uses local state with initial keys.
 */
export function useAppSync<T extends Record<string, unknown>>(
  options: UseAppSyncOptions<T>,
): UseAppSyncResult<T> {
  const [values, setValues] = useState<T>(options.keys);

  const update = useCallback((partial: Partial<T>) => {
    setValues((prev) => {
      const next = { ...prev, ...partial };
      // Send update to phone via AppMessage
      if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppMessage) {
        const am = (globalThis as Record<string, unknown>).AppMessage as {
          send?: (data: Record<string, unknown>) => void;
        };
        am.send?.(partial);
      }
      return next;
    });
  }, []);

  // Listen for incoming sync updates from phone
  useEffect(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppMessage) {
      const am = (globalThis as Record<string, unknown>).AppMessage as {
        addEventListener?: (event: string, handler: (data: Record<string, unknown>) => void) => void;
        removeEventListener?: (event: string, handler: (data: Record<string, unknown>) => void) => void;
      };
      const handler = (data: Record<string, unknown>) => {
        setValues((prev) => ({ ...prev, ...data } as T));
      };
      am.addEventListener?.('received', handler);
      return () => {
        am.removeEventListener?.('received', handler);
      };
    }
    return undefined;
  }, []);

  return { values, update };
}

// ---------------------------------------------------------------------------
// Logging utility — wraps APP_LOG on device, console.log in mock mode
// ---------------------------------------------------------------------------

export type LogLevel = 'error' | 'warning' | 'info' | 'debug';

/**
 * Log a message for development debugging.
 * On Alloy: uses APP_LOG equivalent via Bluetooth.
 * In mock mode: uses console.log/warn/error.
 */
export function pebbleLog(level: LogLevel, ...args: unknown[]): void {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).trace) {
    // Moddable's trace() function outputs to the debug console
    const t = (globalThis as Record<string, unknown>).trace as (msg: string) => void;
    t(`[${level.toUpperCase()}] ${args.map(String).join(' ')}\n`);
    return;
  }
  // Mock mode — use console
  switch (level) {
    case 'error': console.error('[PEBBLE]', ...args); break;
    case 'warning': console.warn('[PEBBLE]', ...args); break;
    default: console.log(`[PEBBLE:${level.toUpperCase()}]`, ...args);
  }
}

// ---------------------------------------------------------------------------
// useLocation — GPS via phone proxy (one-shot)
// ---------------------------------------------------------------------------

export interface LocationData {
  latitude: number;
  longitude: number;
}

export interface UseLocationOptions {
  /** Request high-accuracy GPS (slower, more battery). */
  enableHighAccuracy?: boolean;
  /** Timeout in ms for the location request. */
  timeout?: number;
  /** Maximum age in ms of a cached location to accept. */
  maximumAge?: number;
}

export interface UseLocationResult {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
  /** Request a fresh location sample. */
  refresh: () => void;
}

/**
 * GPS location via the phone proxy.
 *
 * On Alloy: uses `embedded:sensor/Location` with `onSample()` / `sample()`.
 * In mock mode: returns a static San Francisco coordinate after a short delay.
 */
export function useLocation(options?: UseLocationOptions): UseLocationResult {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensorRef = useRef<{ sample: () => LocationData; close?: () => void } | null>(null);

  const refresh = useCallback(() => {
    // Alloy runtime: embedded:sensor/Location
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Location) {
      try {
        const LocationClass = (globalThis as Record<string, unknown>).Location as new (opts: Record<string, unknown>) => {
          sample(): LocationData;
          configure?(opts: Record<string, unknown>): void;
          close?(): void;
        };
        setLoading(true);
        setError(null);
        const sensor = new LocationClass({
          onSample() {
            try {
              const data = sensor.sample();
              setLocation({ latitude: data.latitude, longitude: data.longitude });
              setLoading(false);
            } catch (e) {
              setError(String(e));
              setLoading(false);
            }
          },
        });
        if (sensor.configure) {
          sensor.configure({
            enableHighAccuracy: options?.enableHighAccuracy ?? false,
            timeout: options?.timeout ?? 30000,
            maximumAge: options?.maximumAge ?? 0,
          });
        }
        sensorRef.current = sensor;
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
      return;
    }

    // Mock mode: simulate a GPS fix
    setLoading(true);
    setError(null);
    setTimeout(() => {
      setLocation({ latitude: 37.7749, longitude: -122.4194 });
      setLoading(false);
    }, 500);
  }, [options?.enableHighAccuracy, options?.timeout, options?.maximumAge]);

  // Clean up sensor on unmount
  useEffect(() => {
    return () => {
      sensorRef.current?.close?.();
    };
  }, []);

  return { location, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useLaunchReason — why the app was launched
// ---------------------------------------------------------------------------

export type LaunchReason =
  | 'user'
  | 'wakeup'
  | 'timeline'
  | 'phone'
  | 'worker'
  | 'quickLaunch'
  | 'smartstrap'
  | 'unknown';

export interface LaunchInfo {
  reason: LaunchReason;
  /** Launch argument (from `launch_get_args()` — set by timeline openWatchApp.launchCode, wakeup, or worker). */
  args: number;
}

/**
 * Returns the reason the app was launched.
 *
 * Back-compat: returns the `LaunchReason` string directly.
 * For access to the launch args (timeline `launchCode`, wakeup cookie, etc.),
 * use `useLaunchInfo()`.
 *
 * On Alloy: reads from LaunchReason global or application.launchReason.
 * In mock mode: returns 'user'.
 */
export function useLaunchReason(): LaunchReason {
  return readLaunchInfo().reason;
}

/**
 * Returns the full launch context — reason plus the launch argument set by
 * the caller (timeline pin `launchCode`, `wakeup_schedule(cookie)`, or worker).
 *
 * On Alloy: calls `launch_get_args()` if available.
 * In mock mode: returns `{ reason: 'user', args: 0 }`.
 */
export function useLaunchInfo(): LaunchInfo {
  return readLaunchInfo();
}

function readLaunchInfo(): LaunchInfo {
  let reason: LaunchReason = 'user';
  let args = 0;
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (g.LaunchReason && typeof g.LaunchReason === 'object') {
      const lr = g.LaunchReason as { reason?: string; args?: number };
      if (lr.reason) reason = lr.reason as LaunchReason;
      if (typeof lr.args === 'number') args = lr.args;
    } else if (typeof g.launch_reason === 'function') {
      const code = (g.launch_reason as () => number)();
      const map: Record<number, LaunchReason> = {
        0: 'user', 1: 'phone', 2: 'wakeup', 3: 'worker',
        4: 'quickLaunch', 5: 'timeline', 6: 'smartstrap',
      };
      reason = map[code] ?? 'unknown';
    }
    if (typeof g.launch_get_args === 'function') {
      try {
        args = (g.launch_get_args as () => number)();
      } catch {
        // ignore
      }
    }
  }
  return { reason, args };
}

// ---------------------------------------------------------------------------
// useExitReason — tell the launcher why the app exited
// ---------------------------------------------------------------------------

export type ExitReasonCode = 'default' | 'actionPerformed' | 'genericError';

export interface UseExitReasonResult {
  /** Record a reason the app is about to exit. Called before your app terminates. */
  setReason: (reason: ExitReasonCode) => void;
}

/**
 * Configure the reason the app exited, which the launcher uses to decide what
 * to show on return (e.g. "Setting saved, please relaunch").
 *
 * On Alloy: calls `app_exit_reason_set()` or writes to `ExitReason.current`.
 * In mock mode: no-op.
 *
 * Also available directly on the rendered app via `app.setExitReason(...)`,
 * but this hook keeps the concept colocated with other hooks.
 */
export function useExitReason(): UseExitReasonResult {
  const setReason = useCallback((reason: ExitReasonCode) => {
    if (typeof globalThis === 'undefined') return;
    const g = globalThis as Record<string, unknown>;
    // C-binding style
    if (typeof g.app_exit_reason_set === 'function') {
      const codes: Record<ExitReasonCode, number> = {
        default: 0,
        actionPerformed: 1,
        genericError: 2,
      };
      (g.app_exit_reason_set as (code: number) => void)(codes[reason]);
      return;
    }
    // Object-style
    if (g.ExitReason && typeof g.ExitReason === 'object') {
      (g.ExitReason as { current?: string }).current = reason;
    }
  }, []);

  return { setReason };
}

// ---------------------------------------------------------------------------
// useNotification — push a simple notification to the watch from PebbleKit JS
// ---------------------------------------------------------------------------

export interface SimpleNotification {
  title: string;
  body: string;
}

export interface UseNotificationResult {
  show: (notification: SimpleNotification) => void;
}

/**
 * Push a one-line notification to the watch from phone-side code.
 *
 * On Alloy (phone side): calls `Pebble.showSimpleNotificationOnPebble(title, body)`.
 * In mock mode: logs to console.
 *
 * Watchside code doesn't generally call this — it's for phone JS. The hook is
 * provided for symmetry with other hooks so apps that blend phone/watch logic
 * in the same source can call it from either side.
 */
export function useNotification(): UseNotificationResult {
  const show = useCallback((n: SimpleNotification) => {
    if (typeof globalThis === 'undefined') return;
    const g = globalThis as Record<string, unknown>;
    const pebble = g.Pebble as {
      showSimpleNotificationOnPebble?: (title: string, body: string) => void;
    } | undefined;
    if (pebble?.showSimpleNotificationOnPebble) {
      pebble.showSimpleNotificationOnPebble(n.title, n.body);
      return;
    }
    // Mock / non-phone runtime
    console.log(`[notification] ${n.title}: ${n.body}`);
  }, []);

  return { show };
}

// ---------------------------------------------------------------------------
// useFileStorage — ECMA-419 file system API
// ---------------------------------------------------------------------------

export interface UseFileStorageResult {
  /** Read a file. Returns null if file doesn't exist. */
  readFile: (path: string) => ArrayBuffer | null;
  /** Write data to a file. Returns true on success. */
  writeFile: (path: string, data: ArrayBuffer | string) => boolean;
  /** Delete a file. Returns true on success. */
  deleteFile: (path: string) => boolean;
  /** Check if a file exists. */
  exists: (path: string) => boolean;
}

/**
 * File system storage for binary or large data.
 *
 * On Alloy: uses the ECMA-419 `device.files` API.
 * In mock mode: uses an in-memory Map.
 */
export function useFileStorage(): UseFileStorageResult {
  const mockStore = useRef(new Map<string, ArrayBuffer>());

  // Check for ECMA-419 device.files
  const hasDevice = typeof globalThis !== 'undefined'
    && (globalThis as Record<string, unknown>).device
    && typeof ((globalThis as Record<string, unknown>).device as Record<string, unknown>)?.files === 'object';

  const readFile = useCallback((path: string): ArrayBuffer | null => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        openFile: (opts: { path: string }) => { read: (count: number, offset?: number) => ArrayBuffer; status: () => { size: number }; close: () => void } | null;
      } }).files;
      try {
        const f = files.openFile({ path });
        if (!f) return null;
        const stat = f.status();
        const data = f.read(stat.size, 0);
        f.close();
        return data;
      } catch {
        return null;
      }
    }
    return mockStore.current.get(path) ?? null;
  }, [hasDevice]);

  const writeFile = useCallback((path: string, data: ArrayBuffer | string): boolean => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        openFile: (opts: { path: string; mode?: string }) => { write: (data: ArrayBuffer, offset?: number) => void; close: () => void } | null;
      } }).files;
      try {
        const f = files.openFile({ path, mode: 'w' });
        if (!f) return false;
        const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
        f.write(buf as ArrayBuffer, 0);
        f.close();
        return true;
      } catch {
        return false;
      }
    }
    const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
    mockStore.current.set(path, buf as ArrayBuffer);
    return true;
  }, [hasDevice]);

  const deleteFile = useCallback((path: string): boolean => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        delete: (path: string) => void;
      } }).files;
      try {
        files.delete(path);
        return true;
      } catch {
        return false;
      }
    }
    return mockStore.current.delete(path);
  }, [hasDevice]);

  const exists = useCallback((path: string): boolean => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        openFile: (opts: { path: string }) => { close: () => void } | null;
      } }).files;
      try {
        const f = files.openFile({ path });
        if (!f) return false;
        f.close();
        return true;
      } catch {
        return false;
      }
    }
    return mockStore.current.has(path);
  }, [hasDevice]);

  return { readFile, writeFile, deleteFile, exists };
}

// ---------------------------------------------------------------------------
// useHTTPClient — streaming/chunked HTTP (ECMA-419 HTTPClient)
// ---------------------------------------------------------------------------

export interface HTTPClientRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  onData?: (chunk: ArrayBuffer) => void;
  onHeaders?: (status: number, headers: Record<string, string>) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export interface UseHTTPClientResult {
  /** Send an HTTP request with streaming callbacks. */
  request: (url: string, options?: HTTPClientRequestOptions) => void;
  /** Abort the current request. */
  abort: () => void;
  loading: boolean;
}

/**
 * Streaming HTTP client for chunked/large responses.
 *
 * On Alloy: uses the ECMA-419 HTTPClient for streaming.
 * In mock mode: falls back to fetch() with simulated chunking.
 */
export function useHTTPClient(): UseHTTPClientResult {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<{ abort?: () => void; close?: () => void } | null>(null);

  const request = useCallback((url: string, options?: HTTPClientRequestOptions) => {
    setLoading(true);

    // Alloy runtime: ECMA-419 HTTPClient
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).HTTPClient) {
      try {
        const HTTPClient = (globalThis as Record<string, unknown>).HTTPClient as new (opts: Record<string, unknown>) => {
          close?: () => void;
        };
        const client = new HTTPClient({
          host: new URL(url).hostname,
          path: new URL(url).pathname + new URL(url).search,
          method: options?.method ?? 'GET',
          headers: options?.headers ? Object.entries(options.headers) : [],
          body: options?.body,
          onHeaders(status: number, headers: Record<string, string>) {
            options?.onHeaders?.(status, headers);
          },
          onReadable(count: number) {
            // Read available data
            if (count > 0 && (this as unknown as { read: (count: number) => ArrayBuffer }).read) {
              const chunk = (this as unknown as { read: (count: number) => ArrayBuffer }).read(count);
              options?.onData?.(chunk);
            }
          },
          onDone() {
            setLoading(false);
            options?.onComplete?.();
          },
          onError(err: string) {
            setLoading(false);
            options?.onError?.(err ?? 'Request failed');
          },
        });
        abortRef.current = client;
      } catch (e) {
        setLoading(false);
        options?.onError?.(String(e));
      }
      return;
    }

    // Mock mode: use fetch
    const controller = new AbortController();
    abortRef.current = { abort: () => controller.abort() };

    fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body as string | undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        options?.onHeaders?.(response.status, Object.fromEntries(response.headers.entries()));
        const buffer = await response.arrayBuffer();
        options?.onData?.(buffer);
        setLoading(false);
        options?.onComplete?.();
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          setLoading(false);
          options?.onError?.(String(e));
        }
      });
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort?.();
    abortRef.current?.close?.();
    abortRef.current = null;
    setLoading(false);
  }, []);

  return { request, abort, loading };
}

// ---------------------------------------------------------------------------
// usePreferredResultDuration — how long to show result/notification windows
// ---------------------------------------------------------------------------

/**
 * Returns the user-preferred duration (in ms) for showing result windows.
 *
 * On Alloy: reads from the Preferences API.
 * In mock mode: returns 3000ms.
 */
export function usePreferredResultDuration(): number {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    // Pebble Preferences API
    if (typeof g.preferred_result_display_duration === 'function') {
      return (g.preferred_result_display_duration as () => number)();
    }
    // Alloy-style Preferences object
    if (g.Preferences && typeof (g.Preferences as Record<string, unknown>).resultDisplayDuration === 'number') {
      return (g.Preferences as { resultDisplayDuration: number }).resultDisplayDuration;
    }
  }
  return 3000;
}

// ---------------------------------------------------------------------------
// useSports — phone↔watch protocol for running/cycling apps
// ---------------------------------------------------------------------------

export type SportsState = 'playing' | 'paused' | 'stopped';
export type SportsUnits = 'metric' | 'imperial';

export interface SportsUpdate {
  /** Elapsed time (seconds since start). */
  time?: number;
  /** Distance (meters or miles depending on units). */
  distance?: number;
  /** Current pace (seconds per km or mile). */
  pace?: number;
  /** Current speed (km/h or mph). */
  speed?: number;
  /** Heart rate (BPM). */
  heartRate?: number;
  /** App state. */
  state?: SportsState;
  /** Display units on the watch. */
  units?: SportsUnits;
  /** Custom labeled data pair (e.g. ["calories", "240"]). */
  customLabel?: string;
  customValue?: string;
}

export interface UseSportsOptions {
  /** Default units (sent in the first update). */
  units?: SportsUnits;
  /** Called when the watch reports a state change (e.g. user hits play/pause). */
  onStateChange?: (state: SportsState) => void;
}

export interface UseSportsResult {
  /** Push a sports metric update to the watch. */
  update: (patch: SportsUpdate) => void;
  /** Latest state as reported by the watch. */
  state: SportsState;
}

/**
 * PebbleKit Sports protocol — lets running/cycling apps stream stats to the
 * watch and receive play/pause/stop state changes. Phone-side helper.
 *
 * On PebbleKit JS: sends via `Pebble.sendAppMessage` using the Sports
 * message keys (0, 1, 2, 3, 4, ...) and listens for `appmessage` state updates.
 * In mock mode: state transitions fire via the `update({ state })` call.
 */
export function useSports(options: UseSportsOptions = {}): UseSportsResult {
  const [state, setState] = useState<SportsState>('stopped');
  const unitsRef = useRef<SportsUnits>(options.units ?? 'metric');
  const onStateChangeRef = useRef(options.onStateChange);
  onStateChangeRef.current = options.onStateChange;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const pebble = g.Pebble as {
      addEventListener?: (event: string, cb: (e: { payload?: Record<string, number | string> }) => void) => void;
      removeEventListener?: (event: string, cb: (e: { payload?: Record<string, number | string> }) => void) => void;
    } | undefined;
    if (!pebble?.addEventListener) return undefined;

    const listener = (e: { payload?: Record<string, number | string> }) => {
      const payload = e.payload ?? {};
      // Sports message key 7 = state (0/1/2 for stopped/paused/playing in Pebble conventions).
      const rawState = payload['7'] ?? payload.state;
      if (rawState !== undefined) {
        const map: Record<string, SportsState> = { '0': 'stopped', '1': 'paused', '2': 'playing',
          stopped: 'stopped', paused: 'paused', playing: 'playing' };
        const next = map[String(rawState)];
        if (next) {
          setState(next);
          onStateChangeRef.current?.(next);
        }
      }
    };
    pebble.addEventListener('appmessage', listener);
    return () => pebble.removeEventListener?.('appmessage', listener);
  }, []);

  const update = useCallback((patch: SportsUpdate) => {
    if (patch.units) unitsRef.current = patch.units;
    if (patch.state !== undefined) setState(patch.state);
    const g = globalThis as Record<string, unknown>;
    const pebble = g.Pebble as {
      sendAppMessage?: (msg: Record<string, unknown>, ok?: () => void, fail?: () => void) => void;
    } | undefined;
    const msg: Record<string, unknown> = {};
    if (patch.time !== undefined) msg['0'] = patch.time;
    if (patch.distance !== undefined) msg['1'] = patch.distance;
    if (patch.pace !== undefined) msg['2'] = patch.pace;
    if (patch.speed !== undefined) msg['3'] = patch.speed;
    if (patch.heartRate !== undefined) msg['4'] = patch.heartRate;
    if (patch.customLabel !== undefined) msg['5'] = patch.customLabel;
    if (patch.customValue !== undefined) msg['6'] = patch.customValue;
    if (patch.state !== undefined) {
      msg['7'] = patch.state === 'stopped' ? 0 : patch.state === 'paused' ? 1 : 2;
    }
    if (patch.units ?? unitsRef.current) {
      msg['8'] = (patch.units ?? unitsRef.current) === 'imperial' ? 1 : 0;
    }
    pebble?.sendAppMessage?.(msg);
  }, []);

  return { update, state };
}

// ---------------------------------------------------------------------------
// Internationalization — useTranslation + defineTranslations
// ---------------------------------------------------------------------------

export type TranslationDict = Record<string, Record<string, string>>;

let _translationTable: TranslationDict = {};
let _fallbackLocale = 'en';

/**
 * Register translation strings. Call once at app startup, before rendering.
 *
 *   defineTranslations({
 *     en: { hello: "Hello", steps: "{n} steps" },
 *     fr: { hello: "Bonjour", steps: "{n} pas" },
 *   });
 *
 * Translations are looked up by language code first (e.g. 'fr'), then by
 * full locale (e.g. 'fr-CA'). If neither is present, falls back to
 * `fallback` (default `'en'`).
 */
export function defineTranslations(dict: TranslationDict, fallback: string = 'en'): void {
  _translationTable = dict;
  _fallbackLocale = fallback;
}

/**
 * Returns a `t(key, params?)` function that resolves translation strings
 * for the device's current locale. Re-renders when the locale changes.
 *
 *   const t = useTranslation();
 *   return <Text>{t('steps', { n: steps })}</Text>;
 */
export function useTranslation(): (key: string, params?: Record<string, string | number>) => string {
  const { language } = useLocale();

  return useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = _translationTable[language]
      ?? _translationTable[_fallbackLocale]
      ?? {};
    let str = dict[key] ?? _translationTable[_fallbackLocale]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }, [language]);
}

// ---------------------------------------------------------------------------
// useMemoryStats — heap-used / heap-free / largest-free
// ---------------------------------------------------------------------------

export interface MemoryStats {
  used: number;
  free: number;
  largestFree: number;
}

/**
 * Returns heap memory statistics. Useful for debugging OOMs on constrained
 * platforms (24 kB on aplite, 64 kB on basalt/chalk, 128 kB elsewhere).
 *
 * On Alloy: reads from `memory_bytes_used/free/largest_free` or XS's
 * `Memory.heap` introspection.
 * In mock mode: returns plausible static values.
 *
 * @param pollInterval — how often to re-sample (ms). Default 1000.
 */
export function useMemoryStats(pollInterval: number = 1000): MemoryStats {
  const [stats, setStats] = useState<MemoryStats>({ used: 0, free: 0, largestFree: 0 });

  useEffect(() => {
    const read = (): MemoryStats => {
      const g = globalThis as Record<string, unknown>;
      if (typeof g.memory_bytes_used === 'function') {
        return {
          used: Number((g.memory_bytes_used as () => number)()),
          free: typeof g.memory_bytes_free === 'function'
            ? Number((g.memory_bytes_free as () => number)())
            : 0,
          largestFree: typeof g.memory_largest_free === 'function'
            ? Number((g.memory_largest_free as () => number)())
            : 0,
        };
      }
      // Moddable XS Memory object, if exposed
      const mem = g.Memory as {
        used?: number; free?: number; largestFree?: number;
      } | undefined;
      if (mem && typeof mem.used === 'number') {
        return {
          used: mem.used,
          free: mem.free ?? 0,
          largestFree: mem.largestFree ?? 0,
        };
      }
      // Mock fallback
      return { used: 24_576, free: 40_960, largestFree: 32_768 };
    };

    setStats(read());
    const id = setInterval(() => setStats(read()), pollInterval);
    return () => clearInterval(id);
  }, [pollInterval]);

  return stats;
}

// ---------------------------------------------------------------------------
// useMemoryPressure — subscribe to Rocky 'memorypressure' events
// ---------------------------------------------------------------------------

export type MemoryPressureLevel = 'normal' | 'high' | 'critical';

/**
 * Subscribe to memory pressure events (Rocky.js `memorypressure` event).
 * The handler is called when the runtime is about to start dropping
 * allocations — your app should shed caches and large allocations.
 *
 * On Rocky: registers with `rocky.on('memorypressure', ...)`.
 * Elsewhere: no-op (Alloy and C SDK don't expose this event directly).
 */
export function useMemoryPressure(handler: (level: MemoryPressureLevel) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    const rocky = g.rocky as {
      on?: (event: string, cb: (ev: { level?: string }) => void) => void;
      off?: (event: string, cb: (ev: { level?: string }) => void) => void;
    } | undefined;
    if (!rocky?.on) return undefined;

    const listener = (ev: { level?: string }) => {
      const lvl = (ev?.level as MemoryPressureLevel) ?? 'high';
      handlerRef.current(lvl);
    };
    rocky.on('memorypressure', listener);
    return () => rocky.off?.('memorypressure', listener);
  }, []);
}

// ---------------------------------------------------------------------------
// PebbleKit JS identity tokens — surfaced to the watch via AppMessage.
//
// Pebble.getAccountToken / getWatchToken / getTimelineToken are phone-only
// APIs. The compiler emits PKJS that reads each token at app ready and
// forwards it via AppMessage using these reserved keys:
//
//   _rpTokAcct   — developer-scoped stable user id (getAccountToken)
//   _rpTokWatch  — stable per (app, watch) pair        (getWatchToken)
//   _rpTokTL     — timeline token                      (getTimelineToken)
//
// At runtime, inbox/message dispatch populates `globalThis.__rpTokens`.
// Hooks read from that bag (and a Moddable `Pebble` global fallback).
// In mock mode (Node compile), the hooks return `null` so snapshots stay
// deterministic regardless of host environment.
// ---------------------------------------------------------------------------

interface RPTokenBag {
  _rpTokAcct?: string;
  _rpTokWatch?: string;
  _rpTokTL?: string;
  _rpTokTLErr?: string;
}

interface ModdablePebbleGlobal {
  getAccountToken?: () => string | undefined;
  getWatchToken?: () => string | undefined;
  getTimelineToken?: (
    onSuccess: (token: string) => void,
    onError: (err: string) => void,
  ) => void;
  sendAppMessage?: (msg: Record<string, unknown>) => void;
}

function getRPTokenBag(): RPTokenBag | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as Record<string, unknown>).__rpTokens as RPTokenBag | undefined;
}

function getPebbleGlobal(): ModdablePebbleGlobal | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as Record<string, unknown>).Pebble as ModdablePebbleGlobal | undefined;
}

/**
 * Stable, developer-scoped user identifier (phone's `Pebble.getAccountToken()`).
 * Returns `null` until the phone-side JS has forwarded the token.
 */
export function useAccountToken(): string | null {
  const [token, setToken] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    if (bag?._rpTokAcct) return bag._rpTokAcct;
    const p = getPebbleGlobal();
    const v = p?.getAccountToken?.();
    return typeof v === 'string' && v.length > 0 ? v : null;
  });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = getRPTokenBag();
      if (bag?._rpTokAcct) setToken(bag._rpTokAcct);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  return token;
}

/**
 * Stable per-(app, watch) identifier (phone's `Pebble.getWatchToken()`).
 * Returns `null` until the phone-side JS has forwarded the token.
 */
export function useWatchToken(): string | null {
  const [token, setToken] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    if (bag?._rpTokWatch) return bag._rpTokWatch;
    const p = getPebbleGlobal();
    const v = p?.getWatchToken?.();
    return typeof v === 'string' && v.length > 0 ? v : null;
  });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = getRPTokenBag();
      if (bag?._rpTokWatch) setToken(bag._rpTokWatch);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  return token;
}

export interface UseTimelineTokenResult {
  /** The JWT-style token, or `null` while fetching. */
  token: string | null;
  /** Last error message from the phone side (`null` when healthy). */
  error: string | null;
  /** Ask the phone to re-fetch the token. */
  refresh(): void;
}

/**
 * Fetch the user's Pebble timeline token (phone's async `Pebble.getTimelineToken`).
 * The compiler emits PKJS code that fetches and forwards the token at ready
 * and on explicit refresh requests. Requires the `timeline` capability.
 */
export function useTimelineToken(): UseTimelineTokenResult {
  const [token, setToken] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    return bag?._rpTokTL ?? null;
  });
  const [error, setError] = useState<string | null>(() => {
    const bag = getRPTokenBag();
    return bag?._rpTokTLErr ?? null;
  });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = getRPTokenBag();
      if (bag?._rpTokTL) setToken(bag._rpTokTL);
      if (bag?._rpTokTLErr) setError(bag._rpTokTLErr);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  const refresh = useCallback(() => {
    const p = getPebbleGlobal();
    // Ask PKJS to re-fetch by sending a refresh ping. The PKJS handler
    // registers for `_rpTokTLRefresh` and calls `Pebble.getTimelineToken`.
    p?.sendAppMessage?.({ _rpTokTLRefresh: 1 });
  }, []);

  return { token, error, refresh };
}

// ---------------------------------------------------------------------------
// useTimelineSubscriptions — manage PebbleKit JS timeline topic subscriptions.
//
// The compiler emits PKJS code that handles inbox commands:
//   _rpTLSub:<topic>    — Pebble.timelineSubscribe(topic)
//   _rpTLUnsub:<topic>  — Pebble.timelineUnsubscribe(topic)
//   _rpTLList:1         — Pebble.timelineSubscriptions(cb) → forwards result
//
// The phone side forwards the subscription list via `_rpTLSubs` (JSON
// array), which this hook reads from the `__rpTokens` bag.
// ---------------------------------------------------------------------------

interface RPSubscriptionsBag {
  _rpTLSubs?: string[];
  _rpTLSubsErr?: string;
}

export interface UseTimelineSubscriptionsResult {
  /** Current subscribed topics; `null` until the phone responds the first time. */
  topics: string[] | null;
  /** Last error message from the phone side (`null` when healthy). */
  error: string | null;
  /** Ask the phone to subscribe to `topic`. */
  subscribe(topic: string): void;
  /** Ask the phone to unsubscribe from `topic`. */
  unsubscribe(topic: string): void;
  /** Request an updated subscription list. */
  refresh(): void;
}

export function useTimelineSubscriptions(): UseTimelineSubscriptionsResult {
  const readBag = (): RPSubscriptionsBag | undefined => {
    if (typeof globalThis === 'undefined') return undefined;
    return (globalThis as Record<string, unknown>).__rpTokens as RPSubscriptionsBag | undefined;
  };

  const [topics, setTopics] = useState<string[] | null>(() => readBag()?._rpTLSubs ?? null);
  const [error, setError] = useState<string | null>(() => readBag()?._rpTLSubsErr ?? null);

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const check = () => {
      const bag = readBag();
      if (bag?._rpTLSubs) setTopics(bag._rpTLSubs);
      if (bag?._rpTLSubsErr) setError(bag._rpTLSubsErr);
    };
    const w = (globalThis as Record<string, unknown>).watch as
      | { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
      | undefined;
    w?.addEventListener?.('message', check);
    return () => w?.removeEventListener?.('message', check);
  }, []);

  const subscribe = useCallback((topic: string) => {
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLSub: topic });
  }, []);
  const unsubscribe = useCallback((topic: string) => {
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLUnsub: topic });
  }, []);
  const refresh = useCallback(() => {
    getPebbleGlobal()?.sendAppMessage?.({ _rpTLList: 1 });
  }, []);

  return { topics, error, subscribe, unsubscribe, refresh };
}

// ---------------------------------------------------------------------------
// useRawResource — load a declared `type: 'raw'` resource as a byte array.
// ---------------------------------------------------------------------------

interface PebbleResourceCtor {
  new (name: string): { byteLength: number; slice(begin: number, end: number): ArrayBuffer };
}

/**
 * Read a raw resource blob declared via `pebblePiu({ resources: [{ type: 'raw', name, file }] })`.
 *
 * On Alloy: uses Moddable's `Resource` constructor.
 * On Rocky / C / mock: currently returns `null` (C/Rocky paths rely on
 * compiler-emitted helpers; wire once your app needs them).
 */
export function useRawResource(name: string): Uint8Array | null {
  return useMemoizedValue(() => {
    if (typeof globalThis === 'undefined') return null;
    const Res = (globalThis as Record<string, unknown>).Resource as PebbleResourceCtor | undefined;
    if (!Res) return null;
    try {
      const r = new Res(name);
      const buf = r.slice(0, r.byteLength);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }, [name]);
}

function useMemoizedValue<T>(factory: () => T, deps: unknown[]): T {
  const ref = useRef<{ deps: unknown[]; value: T } | null>(null);
  const cur = ref.current;
  const same =
    cur !== null &&
    cur.deps.length === deps.length &&
    cur.deps.every((d, i) => d === deps[i]);
  if (same) return cur.value;
  const value = factory();
  ref.current = { deps, value };
  return value;
}

// ---------------------------------------------------------------------------
// useSmartstrap — UART accessory protocol (fitness bands, GPS, extra sensors).
//
// Pebble's Smartstrap API exposes attribute-oriented reads/writes over a
// 3-pin UART. The watch-side C API is a set of `smartstrap_*` calls; Moddable
// currently has no public binding, so this hook delegates to whatever the
// compiler emits on each target:
//
//   - C:     smartstrap_subscribe + smartstrap_attribute_create/read/write
//   - Alloy: `globalThis.Smartstrap` if present, else {available:false}
//   - Rocky: unsupported → {available:false}
// ---------------------------------------------------------------------------

export interface SmartstrapAttributeOpts {
  /** Service ID (2-byte unsigned). */
  service: number;
  /** Attribute ID (2-byte unsigned). */
  attribute: number;
  /** Buffer size to allocate for this attribute (bytes). */
  length?: number;
}

export interface SmartstrapResult {
  /** Whether a smartstrap is currently connected and responding. */
  available: boolean;
  /** Issue a read and receive the bytes via `onNotify`. */
  read(): void;
  /** Write `data` to the attribute. */
  write(data: Uint8Array | ArrayBuffer): void;
  /** Set a handler for read responses and unsolicited notifications. */
  onNotify(handler: (data: Uint8Array) => void): () => void;
}

interface ModdableSmartstrap {
  available?: boolean;
  attribute?: (opts: SmartstrapAttributeOpts) => {
    read(): void;
    write(data: ArrayBuffer): void;
    onNotify?: (cb: (buf: ArrayBuffer) => void) => () => void;
    close?(): void;
  };
}

export function useSmartstrap(opts: SmartstrapAttributeOpts): SmartstrapResult {
  const handlerRef = useRef<((data: Uint8Array) => void) | null>(null);
  const attrRef = useRef<ReturnType<NonNullable<ModdableSmartstrap['attribute']>> | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const ss = (globalThis as Record<string, unknown>).Smartstrap as ModdableSmartstrap | undefined;
    if (!ss?.attribute) {
      setAvailable(false);
      return undefined;
    }
    const attr = ss.attribute(opts);
    attrRef.current = attr;
    setAvailable(ss.available ?? true);
    const unsub = attr.onNotify?.((buf) => {
      handlerRef.current?.(new Uint8Array(buf));
    });
    return () => {
      unsub?.();
      attr.close?.();
      attrRef.current = null;
    };
  }, [opts.service, opts.attribute, opts.length]);

  const read = useCallback(() => {
    attrRef.current?.read();
  }, []);
  const write = useCallback((data: Uint8Array | ArrayBuffer) => {
    let buf: ArrayBuffer;
    if (data instanceof Uint8Array) {
      const src = data.buffer as ArrayBuffer;
      buf = src.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
      buf = data;
    }
    attrRef.current?.write(buf);
  }, []);
  const onNotify = useCallback((handler: (data: Uint8Array) => void) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);

  return { available, read, write, onNotify };
}

// ---------------------------------------------------------------------------
// FUTURE HOOKS
//
//   - useAppMessage      — phone↔watch messaging goes through PebbleKit JS
//                          on the phone side (`src/pkjs/index.js`).
// ---------------------------------------------------------------------------
