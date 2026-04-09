/**
 * pebble-dom-shim.ts — A minimal DOM-like adapter over `pebble-dom` so
 * Preact's `render(vnode, parentDom)` can drive it.
 *
 * Preact's diff loop mutates a tree of DOM-shaped nodes by calling:
 *   - document.createElement(tag)
 *   - document.createTextNode(text)
 *   - parent.appendChild(child), .insertBefore(child, ref), .removeChild(child)
 *   - element.setAttribute(name, value), .removeAttribute(name)
 *   - element.addEventListener(name, handler), .removeEventListener(...)
 *   - element.nodeType, .nodeName, .parentNode, .childNodes, .firstChild,
 *     .nextSibling
 *
 * This file implements the minimum surface Preact actually touches when
 * rendering into a headless tree. Each "element" carries a reference to the
 * underlying pebble-dom node so the renderer can walk both views
 * interchangeably.
 *
 * The shim is deliberately NOT a full undom — it only does what Preact 10
 * needs. If we trip on a missing method, add it here rather than including
 * undom (which would push the bundle back up).
 */

import type { AnyNode, DOMElement, ElementType, TextNode } from './pebble-dom.js';
import {
  ELEMENT_TYPES,
  appendChildNode,
  createNode,
  createTextNode,
  insertBeforeNode,
  removeChildNode,
  setAttribute,
  setTextNodeValue,
} from './pebble-dom.js';

// ---------------------------------------------------------------------------
// DOM node interfaces the shim exposes to Preact
// ---------------------------------------------------------------------------

interface ShimNodeBase {
  readonly nodeType: number;
  nodeName: string;
  parentNode: ShimElement | null;
  childNodes: ShimNode[];
  firstChild: ShimNode | null;
  nextSibling: ShimNode | null;
  /** The backing pebble-dom node. */
  readonly _pbl: AnyNode;
}

export interface ShimElement extends ShimNodeBase {
  readonly nodeType: 1;
  readonly localName: string;
  readonly tagName: string;
  readonly _pbl: DOMElement;
  attributes: Record<string, unknown>;

  appendChild<T extends ShimNode>(child: T): T;
  insertBefore<T extends ShimNode>(child: T, ref: ShimNode | null): T;
  removeChild<T extends ShimNode>(child: T): T;
  remove(): void;

  setAttribute(name: string, value: unknown): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): unknown;

  addEventListener(name: string, handler: (...args: unknown[]) => unknown): void;
  removeEventListener(name: string, handler: (...args: unknown[]) => unknown): void;
}

export interface ShimText extends ShimNodeBase {
  readonly nodeType: 3;
  readonly _pbl: TextNode;
  data: string;
  nodeValue: string;
  textContent: string;
}

export type ShimNode = ShimElement | ShimText;

// ---------------------------------------------------------------------------
// Shim factories
// ---------------------------------------------------------------------------

function linkSiblings(parent: ShimElement): void {
  const kids = parent.childNodes;
  parent.firstChild = kids[0] ?? null;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]!;
    node.parentNode = parent;
    node.nextSibling = kids[i + 1] ?? null;
  }
}

export function createShimElement(tag: string): ShimElement {
  // Accept both 'pbl-rect' and friendly aliases from components. Unknown
  // tags are rejected loudly so typos surface at render time.
  const pblType = tag as ElementType;
  if (!ELEMENT_TYPES.has(pblType)) {
    throw new Error(`react-pebble: unknown element tag "${tag}"`);
  }

  const pbl = createNode(pblType);

  const el: ShimElement = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    localName: tag,
    tagName: tag.toUpperCase(),
    _pbl: pbl,
    attributes: {},
    parentNode: null,
    childNodes: [],
    firstChild: null,
    nextSibling: null,

    appendChild(child) {
      // Detach from any prior parent in the shim view
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      this.childNodes.push(child);
      appendChildNode(pbl, child._pbl);
      linkSiblings(this);
      return child;
    },

    insertBefore(child, ref) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      if (ref === null) {
        return this.appendChild(child);
      }
      const idx = this.childNodes.indexOf(ref);
      if (idx < 0) {
        return this.appendChild(child);
      }
      this.childNodes.splice(idx, 0, child);
      insertBeforeNode(pbl, child._pbl, ref._pbl);
      linkSiblings(this);
      return child;
    },

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
      }
      removeChildNode(pbl, child._pbl);
      child.parentNode = null;
      child.nextSibling = null;
      linkSiblings(this);
      return child;
    },

    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    },

    setAttribute(name, value) {
      this.attributes[name] = value;
      setAttribute(pbl, name, value);
    },

    removeAttribute(name) {
      delete this.attributes[name];
      setAttribute(pbl, name, undefined);
    },

    getAttribute(name) {
      return this.attributes[name];
    },

    addEventListener(name, handler) {
      // Event handlers are stored in props (on* style) so the button wiring
      // in pebble-render.ts can find them the same way React props do.
      const key = `on${name[0]?.toUpperCase()}${name.slice(1)}`;
      this.attributes[key] = handler;
      setAttribute(pbl, key, handler);
    },

    removeEventListener(name, _handler) {
      const key = `on${name[0]?.toUpperCase()}${name.slice(1)}`;
      delete this.attributes[key];
      setAttribute(pbl, key, undefined);
    },
  };

  return el;
}

export function createShimText(data: string): ShimText {
  const pbl = createTextNode(data);

  const node: ShimText = {
    nodeType: 3,
    nodeName: '#text',
    _pbl: pbl,
    data,
    nodeValue: data,
    textContent: data,
    parentNode: null,
    childNodes: [],
    firstChild: null,
    nextSibling: null,
  };

  // Keep pebble-dom in sync whenever data/nodeValue/textContent is assigned.
  // Preact mutates `.data` directly on text updates.
  Object.defineProperty(node, 'data', {
    get() {
      return pbl.value;
    },
    set(next: string) {
      setTextNodeValue(pbl, next);
    },
  });
  Object.defineProperty(node, 'nodeValue', {
    get() {
      return pbl.value;
    },
    set(next: string) {
      setTextNodeValue(pbl, next);
    },
  });
  Object.defineProperty(node, 'textContent', {
    get() {
      return pbl.value;
    },
    set(next: string) {
      setTextNodeValue(pbl, next);
    },
  });

  return node;
}

// ---------------------------------------------------------------------------
// Shim "document" — what Preact reaches via `parentDom.ownerDocument` etc.
// ---------------------------------------------------------------------------

export interface ShimDocument {
  createElement(tag: string): ShimElement;
  createElementNS(ns: string | null, tag: string): ShimElement;
  createTextNode(data: string): ShimText;
}

export const shimDocument: ShimDocument = {
  createElement: createShimElement,
  createElementNS: (_ns, tag) => createShimElement(tag),
  createTextNode: createShimText,
};

// ---------------------------------------------------------------------------
// Root container — the "parent DOM" handed to preact.render().
// ---------------------------------------------------------------------------

export function createShimRoot(): ShimElement {
  const root = createShimElement('pbl-root');
  // Preact reads `ownerDocument` off the parent.
  (root as unknown as { ownerDocument: ShimDocument }).ownerDocument = shimDocument;
  return root;
}
