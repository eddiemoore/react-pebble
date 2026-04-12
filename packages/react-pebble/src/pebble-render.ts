/**
 * pebble-render.ts — Entry point for react-pebble on Pebble Alloy.
 *
 * Bridges Preact's output (via a DOM-shim over pebble-dom) to Moddable's
 * Poco renderer, which draws into the watch framebuffer. Also hosts the
 * Node mock path used for unit tests and local development.
 *
 * Platform detection is via `typeof screen`:
 *   - screen exists → Alloy/XS runtime → real Poco draws
 *   - screen undefined → Node → mock Poco records calls to an in-memory log
 */

import { options } from 'preact';
import type { ComponentChild } from 'preact';
import type Poco from 'commodetto/Poco';
import type { PocoBitmap, PocoColor, PocoFont } from 'commodetto/Poco';
import type { DOMElement } from './pebble-dom.js';
import { PocoRenderer } from './pebble-output.js';
import type { PebbleButton, PebbleButtonHandler } from './hooks/index.js';
import { ButtonRegistry } from './hooks/index.js';
import type { PebbleContainer } from './pebble-reconciler.js';
import {
  createContainer,
  updateContainer,
  unmountContainer,
} from './pebble-reconciler.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PebblePlatformInfo {
  isReal: boolean;
  platform: 'alloy' | 'mock';
  screenWidth: number;
  screenHeight: number;
}

export interface DrawCall {
  op: string;
  [key: string]: unknown;
}

export interface RenderOptions {
  backgroundColor?: string;
}

export type AppExitReason = 'default' | 'watchface' | 'actionPerformed';

export interface PebbleApp {
  update(newElement: ComponentChild): void;
  unmount(): void;
  setExitReason(reason: AppExitReason): void;
  readonly platform: PebblePlatformInfo;
  readonly drawLog: readonly DrawCall[];
  readonly _root: DOMElement;
}

// ---------------------------------------------------------------------------
// Mock Poco — records every draw call into a shared log so tests can assert.
// ---------------------------------------------------------------------------

class MockPoco {
  readonly width: number;
  readonly height: number;
  readonly Font: new (name: string, size: number) => PocoFont;

  constructor(width: number, height: number, private readonly log: DrawCall[]) {
    this.width = width;
    this.height = height;
    const FontImpl = class {
      readonly name: string;
      readonly size: number;
      readonly height: number;
      constructor(name: string, size: number) {
        this.name = name;
        this.size = size;
        this.height = size;
      }
    };
    this.Font = FontImpl as unknown as new (name: string, size: number) => PocoFont;
  }

  begin(x?: number, y?: number, width?: number, height?: number): void {
    this.log.push({ op: 'begin', x, y, width, height });
  }
  end(): void {
    this.log.push({ op: 'end' });
  }
  continue(x: number, y: number, width: number, height: number): void {
    this.log.push({ op: 'continue', x, y, width, height });
  }
  clip(x?: number, y?: number, width?: number, height?: number): void {
    this.log.push({ op: 'clip', x, y, width, height });
  }
  origin(x?: number, y?: number): void {
    this.log.push({ op: 'origin', x, y });
  }

  makeColor(r: number, g: number, b: number): PocoColor {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }

  fillRectangle(color: PocoColor, x: number, y: number, width: number, height: number): void {
    this.log.push({ op: 'fillRectangle', color, x, y, width, height });
  }
  blendRectangle(
    color: PocoColor,
    blend: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.log.push({ op: 'blendRectangle', color, blend, x, y, width, height });
  }
  drawPixel(color: PocoColor, x: number, y: number): void {
    this.log.push({ op: 'drawPixel', color, x, y });
  }
  drawBitmap(_bits: PocoBitmap, x: number, y: number): void {
    this.log.push({ op: 'drawBitmap', x, y });
  }
  drawMonochrome(
    _monochrome: PocoBitmap,
    fore: PocoColor,
    back: PocoColor | undefined,
    x: number,
    y: number,
  ): void {
    this.log.push({ op: 'drawMonochrome', fore, back, x, y });
  }

  drawText(text: string, font: PocoFont, color: PocoColor, x: number, y: number): void {
    this.log.push({ op: 'drawText', text, font, color, x, y });
  }
  getTextWidth(text: string, font: PocoFont): number {
    const size = (font as unknown as { size?: number }).size ?? 14;
    return Math.round(text.length * size * 0.6);
  }
}

// ---------------------------------------------------------------------------
// Poco construction — real on Alloy, mock in Node
// ---------------------------------------------------------------------------

function createPoco(
  log: DrawCall[],
  pocoCtor: typeof Poco | undefined,
): { poco: Poco; info: PebblePlatformInfo } {
  if (typeof screen !== 'undefined' && screen && pocoCtor) {
    const poco = new pocoCtor(screen);
    return {
      poco,
      info: {
        isReal: true,
        platform: 'alloy',
        screenWidth: screen.width,
        screenHeight: screen.height,
      },
    };
  }

  const width = 200;
  const height = 228;
  const mock = new MockPoco(width, height, log);
  return {
    poco: mock as unknown as Poco,
    info: {
      isReal: false,
      platform: 'mock',
      screenWidth: width,
      screenHeight: height,
    },
  };
}

// ---------------------------------------------------------------------------
// Button wiring — see moddable.d.ts for the known/unknown event names.
// ---------------------------------------------------------------------------

function wireWatchButtons(): () => void {
  if (typeof watch === 'undefined' || !watch) return () => undefined;

  const normalize = (raw: unknown): PebbleButton | undefined => {
    if (typeof raw !== 'string') return undefined;
    const low = raw.toLowerCase();
    if (low === 'up' || low === 'down' || low === 'select' || low === 'back') {
      return low;
    }
    return undefined;
  };

  const onShort = (payload?: { button?: unknown }) => {
    const b = normalize(payload?.button);
    if (b) ButtonRegistry.emit(b);
  };
  const onLong = (payload?: { button?: unknown }) => {
    const b = normalize(payload?.button);
    if (b) ButtonRegistry.emit(`long_${b}`);
  };

  watch.addEventListener('button', onShort);
  watch.addEventListener('buttonClick', onShort);
  watch.addEventListener('longClick', onLong);

  return () => {
    if (typeof watch === 'undefined' || !watch) return;
    watch.removeEventListener('button', onShort);
    watch.removeEventListener('buttonClick', onShort);
    watch.removeEventListener('longClick', onLong);
  };
}

// ---------------------------------------------------------------------------
// Redraw scheduling
//
// Preact renders are synchronous; when any component calls setState, Preact
// re-runs the diff and mutates the shim tree in place. We hook into that
// by scheduling a Poco redraw on the next tick.
// ---------------------------------------------------------------------------

function scheduleMicrotask(fn: () => void): void {
  // Prefer Promise.resolve().then for microtask batching; fall back to
  // setTimeout(0) if Promise isn't wired up in some host.
  if (typeof Promise !== 'undefined') {
    Promise.resolve().then(fn);
  } else {
    setTimeout(fn, 0);
  }
}

// ---------------------------------------------------------------------------
// Public render API
// ---------------------------------------------------------------------------

export interface RenderOptionsExt extends RenderOptions {
  /**
   * Pre-imported Poco constructor. Alloy entry files must import Poco at
   * the top and pass it here so the Moddable bundler resolves it correctly.
   */
  poco?: typeof Poco;
}

export function render(element: ComponentChild, options: RenderOptionsExt = {}): PebbleApp {
  const drawLog: DrawCall[] = [];
  const container: PebbleContainer = createContainer();
  const { poco, info } = createPoco(drawLog, options.poco);
  const renderer = new PocoRenderer(poco);

  let pending = false;
  const redraw = () => {
    pending = false;
    drawLog.length = 0;
    renderer.render(container.pblRoot, { backgroundColor: options.backgroundColor });
  };

  const schedule = () => {
    if (pending) return;
    pending = true;
    scheduleMicrotask(redraw);
  };

  // Monkey-patch the shim root to redraw on any mutation.
  // Preact calls appendChild/insertBefore/removeChild/setAttribute on the
  // tree during diff; we only need to schedule a redraw when the diff
  // settles, which is right after the top-level render() call returns.
  // For that we just trigger a redraw synchronously after updateContainer.

  // Hook Preact's commit phase so hook-driven state updates trigger a redraw
  // without polling. options._commit is an undocumented-but-stable hook that
  // fires once per root-level diff settle.
  type PreactOptionsWithCommit = typeof options & {
    _commit?: (root: unknown, queue: unknown[]) => void;
    __c?: (root: unknown, queue: unknown[]) => void;
  };
  const opts = options as PreactOptionsWithCommit;
  const prevCommit = opts._commit ?? opts.__c;
  const commitHook = (root: unknown, queue: unknown[]) => {
    if (prevCommit) prevCommit(root, queue);
    schedule();
  };
  opts._commit = commitHook;
  opts.__c = commitHook;

  updateContainer(element, container);
  // Always paint once on mount.
  redraw();

  // Subscribe to watch events on-device.
  const unwireButtons = wireWatchButtons();

  return {
    update(newElement) {
      updateContainer(newElement, container);
      schedule();
    },
    unmount() {
      unmountContainer(container);
      // Restore prior commit hook (in case another app was rendered).
      opts._commit = prevCommit;
      opts.__c = prevCommit;
      unwireButtons();
    },
    setExitReason(reason) {
      if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).AppExit) {
        const ae = (globalThis as Record<string, unknown>).AppExit as {
          setReason?: (r: string) => void;
        };
        ae.setReason?.(reason);
      }
    },
    get platform() {
      return info;
    },
    get drawLog() {
      return drawLog as readonly DrawCall[];
    },
    get _root() {
      return container.pblRoot;
    },
  };
}
