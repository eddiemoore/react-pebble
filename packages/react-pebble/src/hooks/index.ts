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

type ButtonRegistryKey = PebbleButton | `long_${PebbleButton}`;

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

export function useFormattedTime(format = 'HH:mm'): string {
  const time = useTime(format.includes('ss') ? 1000 : 60000);

  const hours24 = time.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ampm = hours24 < 12 ? 'AM' : 'PM';

  let result = format;
  result = result.replace('HH', hours24.toString().padStart(2, '0'));
  result = result.replace('hh', hours12.toString().padStart(2, '0'));
  result = result.replace('mm', minutes);
  result = result.replace('ss', seconds);
  result = result.replace('a', ampm);

  return result;
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
// useTimeline — push timeline pins
// ---------------------------------------------------------------------------

export interface TimelinePin {
  id: string;
  time: number;
  title: string;
  body?: string;
  icon?: string;
}

export interface UseTimelineResult {
  pushPin: (pin: TimelinePin) => void;
  removePin: (id: string) => void;
}

/**
 * Push or remove timeline pins.
 *
 * On Alloy: uses the `Timeline` global or sends a message to the
 * phone-side JS for cloud API interaction.
 * In mock mode: no-op.
 */
export function useTimeline(): UseTimelineResult {
  const pushPin = useCallback((pin: TimelinePin) => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Timeline) {
      const tl = (globalThis as Record<string, unknown>).Timeline as {
        pushPin?: (pin: TimelinePin) => void;
      };
      tl.pushPin?.(pin);
    }
  }, []);

  const removePin = useCallback((id: string) => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Timeline) {
      const tl = (globalThis as Record<string, unknown>).Timeline as {
        removePin?: (id: string) => void;
      };
      tl.removePin?.(id);
    }
  }, []);

  return { pushPin, removePin };
}

// ---------------------------------------------------------------------------
// FUTURE HOOKS
//
//   - useAppMessage      — phone↔watch messaging goes through PebbleKit JS
//                          on the phone side (`src/pkjs/index.js`).
//   - useLocation        — GPS via phone proxy (one-shot).
// ---------------------------------------------------------------------------
