/**
 * pebble-reconciler.ts — Preact-backed reconciler for react-pebble.
 *
 * Replaces the old react-reconciler host config. We don't need a custom
 * reconciler at all with Preact — Preact's `render(vnode, parentDom)` does
 * the diffing, and we provide a DOM-shaped container via `pebble-dom-shim`
 * so Preact writes into our pebble-dom tree instead of a real DOM.
 *
 * The public surface (for pebble-render.ts) is:
 *   - createReconcilerContainer() → a pair of root shim + pebble-dom root
 *   - updateContainer(vnode, container) → runs preact.render()
 *   - unmountContainer(container) → runs preact.render(null, ...)
 */

import { render as preactRender } from 'preact';
import type { ComponentChild } from 'preact';
import type { DOMElement } from './pebble-dom.js';
import { createShimRoot, shimDocument } from './pebble-dom-shim.js';
import type { ShimElement } from './pebble-dom-shim.js';

// Preact's render() references `document` internally. In non-browser
// environments (Node mock mode, Alloy XS) we shim it with our pebble-dom
// adapter so Preact doesn't crash.
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

// For backwards-compat with the old default export pattern.
export default {
  createContainer,
  updateContainer,
  unmountContainer,
};
