/**
 * render.ts — Mock Renderer entry point used by the Analyzer.
 *
 * The Analyzer wraps each example's `default` export in `render(<X/>)`
 * during perturbation. Preact diffs into the dom-shim, which writes into
 * pebble-dom; PocoRenderer walks the resulting tree and emits Poco draw
 * calls against MockPoco for in-memory inspection.
 *
 * Not an on-watch runtime — emitted Target code never invokes this. See
 * docs/adr/0005-mock-renderer-is-compile-time.md.
 */

import { options as preactOptions } from 'preact';
import type { ComponentChild } from 'preact';
import type Poco from 'commodetto/Poco';
import type { PocoBitmap, PocoColor, PocoFont } from 'commodetto/Poco';
import type { DOMElement } from '../../../src/pebble-dom.js';
import { PocoRenderer } from './poco.js';
import type { PebbleContainer } from './reconciler.js';
import {
  createContainer,
  updateContainer,
  unmountContainer,
} from './reconciler.js';

export interface DrawCall {
  op: string;
  [key: string]: unknown;
}

export interface RenderOptions {
  backgroundColor?: string;
}

export interface MockApp {
  unmount(): void;
  readonly _root: DOMElement;
}

// ---------------------------------------------------------------------------
// MockPoco — records every draw call into a shared log.
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
// Redraw scheduling — Preact's _commit fires once per diff settle.
// ---------------------------------------------------------------------------

function scheduleMicrotask(fn: () => void): void {
  if (typeof Promise !== 'undefined') {
    Promise.resolve().then(fn);
  } else {
    setTimeout(fn, 0);
  }
}

// ---------------------------------------------------------------------------
// render() — Analyzer entry. Builds a MockPoco, drives Preact through the
// reconciler, returns a handle the Analyzer uses to read the harvested tree.
// ---------------------------------------------------------------------------

export function render(element: ComponentChild, opts: RenderOptions = {}): MockApp {
  const drawLog: DrawCall[] = [];
  const container: PebbleContainer = createContainer();
  const width = 200;
  const height = 228;
  const mock = new MockPoco(width, height, drawLog);
  const renderer = new PocoRenderer(mock as unknown as Poco);

  let pending = false;
  const redraw = () => {
    pending = false;
    drawLog.length = 0;
    renderer.render(container.pblRoot, { backgroundColor: opts.backgroundColor });
  };

  const schedule = () => {
    if (pending) return;
    pending = true;
    scheduleMicrotask(redraw);
  };

  type PreactOptionsWithCommit = typeof preactOptions & {
    _commit?: (root: unknown, queue: unknown[]) => void;
    __c?: (root: unknown, queue: unknown[]) => void;
  };
  const popts = preactOptions as PreactOptionsWithCommit;
  const prevCommit = popts._commit ?? popts.__c;
  const commitHook = (root: unknown, queue: unknown[]) => {
    if (prevCommit) prevCommit(root, queue);
    schedule();
  };
  popts._commit = commitHook;
  popts.__c = commitHook;

  updateContainer(element, container);
  redraw();

  return {
    unmount() {
      unmountContainer(container);
      popts._commit = prevCommit;
      popts.__c = prevCommit;
    },
    get _root() {
      return container.pblRoot;
    },
  };
}
