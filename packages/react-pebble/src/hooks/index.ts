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
// FUTURE HOOKS — reference for reimplementation
//
//   - useAccelerometer   — Alloy has Moddable sensor modules;
//                          specific import path unknown.
//   - useAppMessage      — phone↔watch messaging goes through PebbleKit JS
//                          on the phone side (`src/pkjs/index.js`).
// ---------------------------------------------------------------------------
