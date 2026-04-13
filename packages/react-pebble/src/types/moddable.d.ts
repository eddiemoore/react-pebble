/**
 * Ambient declarations for the Pebble Alloy runtime (Moddable XS / Poco).
 *
 * IMPORTANT: this file MUST remain a script (no top-level imports or
 * exports). As soon as you add an `export`, TypeScript treats it as a
 * module and `declare module 'commodetto/Poco'` stops working ambiently.
 *
 * Only the surface actually used by react-pebble is declared. When you
 * reach for a Moddable API that isn't here, add it — keep this file the
 * single source of truth for the runtime shape.
 */

// ---------------------------------------------------------------------------
// `screen` — the framebuffer the Poco renderer draws into.
// Probed shape: { width, height, frameBuffer, unobstructed }.
// ---------------------------------------------------------------------------

interface ModdableScreen {
  readonly width: number;
  readonly height: number;
  readonly frameBuffer: unknown;
  readonly unobstructed: unknown;
}

declare const screen: ModdableScreen | undefined;

// ---------------------------------------------------------------------------
// `watch` — system event bus (time ticks, buttons, connection state).
//
// `addEventListener` accepts any string without validation. The list of
// events that actually fire is observed empirically:
//   - secondchange / minutechange / hourchange / daychange (confirmed)
//   - button events: unconfirmed — see pebble-render.ts wireWatchButtons()
//     for the current best-guess subscription names.
// ---------------------------------------------------------------------------

type WatchTickEvent = 'secondchange' | 'minutechange' | 'hourchange' | 'daychange';
type WatchButtonEvent = 'button' | 'buttonDown' | 'buttonUp' | 'buttonClick' | 'longClick';
type WatchEvent = WatchTickEvent | WatchButtonEvent | (string & {});

interface WatchButtonPayload {
  /** Which hardware button — empirically unknown; cast at use site. */
  button?: 'up' | 'down' | 'select' | 'back' | string;
  [key: string]: unknown;
}

interface WatchConnected {
  /** Whether the Pebble companion app is connected. */
  app: boolean;
  /** Whether PebbleKit JS is available. */
  pebblekit: boolean;
}

interface ModdableWatch {
  addEventListener(event: WatchEvent, handler: (...args: any[]) => void): void;
  removeEventListener(event: WatchEvent, handler: (...args: any[]) => void): void;
  /** Unexplained method on the prototype — possibly the internal dispatch path. */
  do?: (...args: unknown[]) => unknown;
  /** Connection / pairing state. */
  connected?: WatchConnected;
}

declare const watch: ModdableWatch | undefined;

// ---------------------------------------------------------------------------
// `trace` — low-level log function Moddable provides alongside `console`.
// ---------------------------------------------------------------------------

declare function trace(message: string): void;

// ---------------------------------------------------------------------------
// Module declarations for Moddable / Commodetto imports.
// These resolve at runtime via the Moddable manifest.json `modules` section.
// Kept ambient (no top-level import/export) so they augment TS's module
// resolution without requiring /// <reference> directives.
// ---------------------------------------------------------------------------

declare module 'commodetto/Poco' {
  /** Integer color handle produced by `Poco.prototype.makeColor`. */
  export type PocoColor = number;

  /** Opaque font resource. Construction is platform-specific. */
  export interface PocoFont {
    readonly height: number;
    [key: string]: unknown;
  }

  /** Opaque bitmap resource. */
  export interface PocoBitmap {
    readonly width: number;
    readonly height: number;
    [key: string]: unknown;
  }

  export default class Poco {
    constructor(
      pixelsOut: ModdableScreen | unknown,
      options?: { displayListLength?: number; rotation?: 0 | 90 | 180 | 270 },
    );

    readonly width: number;
    readonly height: number;

    begin(x?: number, y?: number, width?: number, height?: number): void;
    end(continueFrame?: boolean): void;
    continue(x: number, y: number, width: number, height: number): void;

    clip(x?: number, y?: number, width?: number, height?: number): void;
    origin(x?: number, y?: number): void;

    makeColor(r: number, g: number, b: number): PocoColor;

    fillRectangle(color: PocoColor, x: number, y: number, width: number, height: number): void;
    blendRectangle(
      color: PocoColor,
      blend: number,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void;
    drawPixel(color: PocoColor, x: number, y: number): void;

    drawBitmap(
      bits: PocoBitmap,
      x: number,
      y: number,
      sx?: number,
      sy?: number,
      sw?: number,
      sh?: number,
    ): void;

    drawMonochrome(
      monochrome: PocoBitmap,
      fore: PocoColor,
      back: PocoColor | undefined,
      x: number,
      y: number,
      sx?: number,
      sy?: number,
      sw?: number,
      sh?: number,
    ): void;

    drawText(text: string, font: PocoFont, color: PocoColor, x: number, y: number): void;
    getTextWidth(text: string, font: PocoFont): number;

    /** Font constructor — available on Poco instances as `render.Font`. */
    readonly Font: new (name: string, size: number) => PocoFont;
  }
}

declare module 'commodetto/PocoCore' {
  export { default } from 'commodetto/Poco';
}

// ---------------------------------------------------------------------------
// Battery — Alloy provides static properties on a Battery object.
// ---------------------------------------------------------------------------

interface PebbleBattery {
  /** Battery percentage (0–100). */
  readonly percent: number;
  /** Whether the watch is currently charging. */
  readonly charging: boolean;
  /** Whether the watch is plugged in. */
  readonly plugged: boolean;
}

declare const Battery: PebbleBattery | undefined;

// ---------------------------------------------------------------------------
// Vibration — haptic feedback motor
// ---------------------------------------------------------------------------

interface PebbleVibration {
  shortPulse(): void;
  longPulse(): void;
  doublePulse(): void;
  customPattern(durations: number[]): void;
}

declare const Vibration: PebbleVibration | undefined;

// ---------------------------------------------------------------------------
// Light — backlight control
// ---------------------------------------------------------------------------

interface PebbleLight {
  trigger(): void;
  enable(on: boolean): void;
}

declare const Light: PebbleLight | undefined;

// ---------------------------------------------------------------------------
// Health — fitness/health sensor data
// ---------------------------------------------------------------------------

interface PebbleHealth {
  readonly steps: number;
  readonly distance: number;
  readonly activeSeconds: number;
  readonly calories: number;
  readonly heartRate: number | null;
  readonly sleepSeconds: number;
}

declare const Health: PebbleHealth | undefined;

// ---------------------------------------------------------------------------
// WatchInfo — device hardware information
// ---------------------------------------------------------------------------

interface PebbleWatchInfo {
  readonly model: string;
  readonly platform: string;
  readonly isRound: boolean;
  readonly isColor: boolean;
}

declare const WatchInfo: PebbleWatchInfo | undefined;

// ---------------------------------------------------------------------------
// Wakeup — scheduled app launches
// ---------------------------------------------------------------------------

interface PebbleWakeup {
  schedule(timestamp: number, cookie?: number): number | null;
  cancel(id: number): void;
  cancelAll(): void;
  getLaunchEvent(): { id: number; cookie: number } | null;
}

declare const Wakeup: PebbleWakeup | undefined;

// ---------------------------------------------------------------------------
// Dictation — voice-to-text input
// ---------------------------------------------------------------------------

interface PebbleDictation {
  start(callback: (text: string | null, status: string) => void): void;
  stop(): void;
}

declare const Dictation: PebbleDictation | undefined;

// ---------------------------------------------------------------------------
// DataLogging — batch data collection to phone
// ---------------------------------------------------------------------------

interface PebbleDataLoggingSession {
  log(data: ArrayBuffer | string): boolean;
  finish(): void;
}

interface PebbleDataLogging {
  create(tag: number, itemType: 'byte' | 'uint' | 'int', itemSize: number): PebbleDataLoggingSession | null;
}

declare const DataLogging: PebbleDataLogging | undefined;

// ---------------------------------------------------------------------------
// AppGlance — app launcher status display
// ---------------------------------------------------------------------------

interface PebbleAppGlance {
  update(slices: Array<{ subtitle: string; icon?: unknown; expirationTime?: number }>): void;
}

declare const AppGlance: PebbleAppGlance | undefined;

// ---------------------------------------------------------------------------
// Timeline — push timeline pins
// ---------------------------------------------------------------------------

interface PebbleTimeline {
  pushPin(pin: { id: string; time: number; title: string; body?: string; icon?: string }): void;
  removePin(id: string): void;
}

declare const Timeline: PebbleTimeline | undefined;

// ---------------------------------------------------------------------------
// Texture — piu image resource wrapper
// ---------------------------------------------------------------------------

declare class Texture {
  constructor(path: string);
  readonly width: number;
  readonly height: number;
}

// Outline extension module — adds blendOutline / blendPolygon to Poco.prototype.
// Importing this module has the side-effect of installing those methods.
declare module 'commodetto/outline/PocoOutline' {
  const _default: Readonly<Record<string, never>>;
  export default _default;
}
