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
// the canonical tick source. In Node mock mode we fall back to setInterval.
// Both paths are abstracted away by the renderer, which pumps the tick into
// the hook via React state — here we just use setInterval directly, which
// works in both XS and Node. (`watch` is used for redraws, not hook state.)
// ---------------------------------------------------------------------------

export function useTime(intervalMs = 1000): Date {
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setTime(new Date());
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
// REMOVED HOOKS — reference for future reimplementation
//
//   - useBattery         — previously read Pebble.battery (fictional global).
//                          Alloy equivalent: probably a Moddable power
//                          module; not yet explored.
//   - useConnection      — previously Pebble.connection.isConnected().
//                          Alloy equivalent: `watch.connected` property was
//                          observed on the watch prototype but its shape is
//                          unknown.
//   - useAccelerometer   — previously Pebble.accel. Alloy has Moddable
//                          sensor modules; specific import path unknown.
//   - useAppMessage      — previously Pebble.sendAppMessage / addEventListener
//                          for 'appmessage'. Alloy has no direct equivalent;
//                          phone↔watch messaging goes through PebbleKit JS on
//                          the phone side (`src/pkjs/index.js`) and is a
//                          separate concern.
// ---------------------------------------------------------------------------
