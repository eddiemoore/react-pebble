/**
 * Button registry
 *
 * Buttons are delivered to react-pebble two ways:
 *   (a) via props on elements (onUp/onDown/onSelect/onBack), collected and
 *       subscribed to Moddable's `watch` in pebble-render.ts; or
 *   (b) via this hook registry, which the renderer pumps from `watch` events.
 *
 * The registry is the substrate for `useButton`, `useLongButton`, and
 * `useRawClick`. The exact `watch` event names for buttons are not yet
 * confirmed — the renderer normalizes them into our four logical buttons
 * before emitting.
 */

export type PebbleButton = 'up' | 'down' | 'select' | 'back';
export type PebbleButtonHandler = () => void;

export type ButtonRegistryKey =
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
