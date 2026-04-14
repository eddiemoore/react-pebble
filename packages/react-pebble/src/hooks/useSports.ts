/**
 * useSports — phone↔watch protocol for running/cycling apps.
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

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
