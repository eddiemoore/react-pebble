/**
 * Touch registry
 *
 * Touch events arrive from the Moddable `watch` event source on platforms
 * with a touchscreen (PBL_TOUCH). The renderer normalizes raw events into
 * our three logical types before emitting through this registry.
 *
 * Modeled on the ButtonRegistry pattern.
 */

export type TouchEventType = 'touchdown' | 'position' | 'liftoff';

export interface TouchEvent {
  type: TouchEventType;
  x: number;
  y: number;
}

export type TouchHandler = (event: TouchEvent) => void;

interface TouchRegistryShape {
  _listeners: Set<TouchHandler>;
  subscribe(fn: TouchHandler): void;
  unsubscribe(fn: TouchHandler): void;
  emit(event: TouchEvent): void;
}

export const TouchRegistry: TouchRegistryShape = {
  _listeners: new Set<TouchHandler>(),

  subscribe(fn) {
    this._listeners.add(fn);
  },

  unsubscribe(fn) {
    this._listeners.delete(fn);
  },

  emit(event) {
    for (const fn of this._listeners) fn(event);
  },
};
