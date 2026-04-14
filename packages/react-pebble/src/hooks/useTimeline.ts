/**
 * useTimeline — push timeline pins (full Pebble pin spec).
 *
 * The pushPin payload follows the Pebble timeline public API exactly:
 *   https://developer.repebble.com/guides/pebble-timeline/pin-structure/
 *
 * When the Moddable `Timeline` global is available it's called directly.
 * Otherwise, the pin is stringified and sent to the phone side via
 * AppMessage using the reserved key `_rpTLPush`; the compiler-emitted PKJS
 * HTTP-PUTs to the public web API using the user's timeline token.
 */

import { useCallback } from 'preact/hooks';
import { getPebbleGlobal } from './internal/pebble-global.js';

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
