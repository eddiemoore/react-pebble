/**
 * pebble-dom.ts — Virtual DOM layer for React Pebble
 *
 * Modeled after Ink's dom.ts but stripped of Yoga layout.
 * Pebble uses absolute positioning (x, y, w, h) rather than flexbox,
 * so nodes are just plain JS objects with type, props, and children.
 *
 * Each node type maps to a Pebble drawing primitive:
 *   pbl-root     → Container root (the Window)
 *   pbl-rect     → fillRect / drawRect
 *   pbl-circle   → fillCircle / drawCircle
 *   pbl-text     → drawText
 *   pbl-line     → drawLine
 *   pbl-image    → drawImage (bitmap)
 *   pbl-group    → Logical grouping with offset (no draw call)
 *   #text        → Raw text content (only valid inside pbl-text)
 */

// ---------------------------------------------------------------------------
// Element types
// ---------------------------------------------------------------------------

export type ElementType =
  | 'pbl-root'
  | 'pbl-rect'
  | 'pbl-circle'
  | 'pbl-text'
  | 'pbl-line'
  | 'pbl-image'
  | 'pbl-group'
  | 'pbl-statusbar'
  | 'pbl-actionbar'
  | 'pbl-path'
  | 'pbl-scrollable';

export const ELEMENT_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  'pbl-root',
  'pbl-rect',
  'pbl-circle',
  'pbl-text',
  'pbl-line',
  'pbl-image',
  'pbl-group',
  'pbl-statusbar',
  'pbl-actionbar',
  'pbl-path',
  'pbl-scrollable',
]);

// ---------------------------------------------------------------------------
// Node shapes
// ---------------------------------------------------------------------------

/**
 * Loose prop bag — element-specific shapes are documented on each component
 * wrapper, but the reconciler treats them uniformly.
 */
export type NodeProps = Record<string, unknown> & {
  _hidden?: boolean;
};

export interface DOMElement {
  id: number;
  type: ElementType;
  props: NodeProps;
  children: Array<DOMElement | TextNode>;
  parent: DOMElement | null;
  /** Called by the reconciler after each commit; wired up by `render()`. */
  onRender: (() => void) | null;
  /** Optional layout pass; we currently don't use this. */
  onComputeLayout: (() => void) | null;
  /** Internal dirty flag (currently informational only). */
  _dirty: boolean;
}

export interface TextNode {
  id: number;
  type: '#text';
  value: string;
  parent: DOMElement | null;
  /** Saved value while the node is hidden by Suspense. */
  _hiddenValue?: string;
}

export type AnyNode = DOMElement | TextNode;

// ---------------------------------------------------------------------------
// Node creation
// ---------------------------------------------------------------------------

let nextNodeId = 1;

export function createNode(type: ElementType): DOMElement {
  return {
    id: nextNodeId++,
    type,
    props: {},
    children: [],
    parent: null,
    onRender: null,
    onComputeLayout: null,
    _dirty: true,
  };
}

export function createTextNode(text: string): TextNode {
  return {
    id: nextNodeId++,
    type: '#text',
    value: text,
    parent: null,
  };
}

// ---------------------------------------------------------------------------
// Tree manipulation
// ---------------------------------------------------------------------------

export function appendChildNode(parent: DOMElement, child: AnyNode): void {
  if (child.parent) {
    removeChildNode(child.parent, child);
  }
  child.parent = parent;
  parent.children.push(child);
}

export function insertBeforeNode(
  parent: DOMElement,
  child: AnyNode,
  beforeChild: AnyNode,
): void {
  if (child.parent) {
    removeChildNode(child.parent, child);
  }
  child.parent = parent;
  const idx = parent.children.indexOf(beforeChild);
  if (idx >= 0) {
    parent.children.splice(idx, 0, child);
  } else {
    parent.children.push(child);
  }
}

export function removeChildNode(parent: DOMElement, child: AnyNode): void {
  parent.children = parent.children.filter((c) => c !== child);
  child.parent = null;
}

// ---------------------------------------------------------------------------
// Property / attribute helpers
// ---------------------------------------------------------------------------

export function setAttribute(node: DOMElement, key: string, value: unknown): void {
  if (value === undefined) {
    delete node.props[key];
  } else {
    node.props[key] = value;
  }
}

export function setTextNodeValue(node: TextNode, text: string): void {
  node.value = text;
}

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

export function getTextContent(node: AnyNode): string {
  if (node.type === '#text') {
    return node.value;
  }
  return node.children.map(getTextContent).join('');
}

export type Visitor = (node: AnyNode, depth: number) => void;

export function walkTree(root: AnyNode, visitor: Visitor, depth = 0): void {
  visitor(root, depth);
  if (root.type !== '#text') {
    for (const child of root.children) {
      walkTree(child, visitor, depth + 1);
    }
  }
}

export function findRoot(node: AnyNode): DOMElement {
  let current: AnyNode = node;
  while (current.parent) {
    current = current.parent;
  }
  // The root is always a DOMElement (created via createNode).
  return current as DOMElement;
}
