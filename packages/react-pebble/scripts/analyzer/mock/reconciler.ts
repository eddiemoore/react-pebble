/**
 * reconciler.ts — Preact bridge for the Mock Renderer.
 *
 * Preact's render(vnode, parentDom) writes into a DOM-shaped container we
 * provide via dom-shim, which in turn writes into the pebble-dom tree the
 * Analyzer harvests during perturbation. Public surface:
 *   - createContainer() → shim root + pebble-dom root
 *   - updateContainer(vnode, container) → runs preact.render()
 *   - unmountContainer(container) → runs preact.render(null, ...)
 *
 * See: docs/adr/0005-mock-renderer-is-compile-time.md
 */

import { render as preactRender } from 'preact';
import type { ComponentChild } from 'preact';
import type { DOMElement } from '../../../src/pebble-dom.js';
import { createShimRoot, shimDocument } from './dom-shim.js';
import type { ShimElement } from './dom-shim.js';

// Preact's render() references `document` internally. Node has no document;
// install the shim so Preact resolves it during the Analyzer mock render.
if (typeof document === 'undefined') {
  (globalThis as unknown as { document: unknown }).document = shimDocument;
}

export interface PebbleContainer {
  shimRoot: ShimElement;
  pblRoot: DOMElement;
}

export function createContainer(): PebbleContainer {
  const shimRoot = createShimRoot();
  return {
    shimRoot,
    pblRoot: shimRoot._pbl,
  };
}

export function updateContainer(vnode: ComponentChild, container: PebbleContainer): void {
  preactRender(vnode, container.shimRoot as unknown as Element);
}

export function unmountContainer(container: PebbleContainer): void {
  preactRender(null, container.shimRoot as unknown as Element);
}
