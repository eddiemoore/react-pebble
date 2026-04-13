/**
 * scripts/compiler-ir.ts — Intermediate representation between analysis and codegen.
 *
 * The analysis phase (analyze.ts) produces a CompilerIR, which is consumed
 * by backend-specific code generators (emit-piu.ts, emit-rocky.ts, etc.).
 */

// ---------------------------------------------------------------------------
// Visual tree
// ---------------------------------------------------------------------------

export type IRElementType = 'root' | 'group' | 'rect' | 'text' | 'circle' | 'line' | 'path' | 'arc' | 'textflow';

export interface IRElement {
  type: IRElementType;
  /** Position and size */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Type-specific properties */
  fill?: string;        // hex color (rect, circle)
  text?: string;        // text content (text)
  font?: string;        // internal font name, e.g. "gothic18Bold" (text)
  color?: string;       // hex color for text
  align?: string;       // text alignment: "left" | "center" | "right"
  radius?: number;      // circle radius
  strokeWidth?: number; // line stroke width
  x2?: number;          // line endpoint
  y2?: number;          // line endpoint
  innerRadius?: number; // arc inner radius (0 = pie slice)
  startAngle?: number;  // arc start angle in degrees
  endAngle?: number;    // arc end angle in degrees
  stroke?: string;      // arc stroke color
  points?: Array<[number, number]>; // path polygon vertices (relative to x,y origin)
  rotation?: number;    // path rotation in degrees
  isWrapping?: boolean; // textflow: multi-line wrapping text
  /** Children (for root, group, rect with children) */
  children?: IRElement[];
  /** Sequential indices assigned during tree collection */
  labelIndex?: number;  // for text elements
  rectIndex?: number;   // for rect elements
  elemIndex?: number;   // global element index (for animation tracking)
  /** Reactivity flags — set after perturbation analysis */
  isTimeDynamic?: boolean;
  isStateDynamic?: boolean;
  isListSlot?: boolean;
  isSkinDynamic?: boolean;
  isAnimated?: boolean;
  /** Assigned name for runtime reference (e.g. "sl0", "tl1", "sr0", "ls0_1", "ae2") */
  name?: string;
  /** For groups that are list item containers */
  listGroupName?: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface IRStateSlot {
  index: number;
  initialValue: unknown;
  type: 'number' | 'boolean' | 'string' | 'unknown';
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export interface IRButtonAction {
  button: string;
  action: {
    type: 'increment' | 'decrement' | 'reset' | 'toggle' | 'set_string';
    slotIndex: number;
    value: number;
    stringValue?: string;
  };
}

// ---------------------------------------------------------------------------
// Reactivity
// ---------------------------------------------------------------------------

export interface IRStateDep {
  slotIndex: number;
  /**
   * JavaScript format expression using `this.s{N}` references.
   * Backends strip `this.` as needed (e.g., Rocky.js uses module-level vars).
   * Examples: `"" + this.s0`, `this.s0 ? "ON" : "OFF"`
   */
  formatExpr: string;
  /** True if this label also depends on elapsed time (stopwatch pattern) */
  needsTime?: boolean;
}

export interface IRSkinDep {
  slotIndex: number;
  /** [baseline fill hex, perturbed fill hex] */
  skins: [string, string];
}

export type TimeFormat = 'HHMM' | 'MMSS' | 'SS' | 'DATE';

// ---------------------------------------------------------------------------
// Conditional branches
// ---------------------------------------------------------------------------

export interface IRBranch {
  stateSlot: number;
  value: unknown;
  /** The full visual subtree for this branch value */
  tree: IRElement[];
  isBaseline: boolean;
}

export interface IRConditionalChild {
  stateSlot: number;
  childIndex: number;
  type: 'removed' | 'added';
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface IRListInfo {
  dataArrayName: string;
  dataArrayValues: string[] | null;
  dataArrayObjects: Record<string, string>[] | null;
  propertyOrder: string[] | null;
  visibleCount: number;
  scrollSetterName: string | null;
  scrollSlotIndex: number;
  labelsPerItem: number;
}

// ---------------------------------------------------------------------------
// Time-reactive graphics
// ---------------------------------------------------------------------------

export interface IRTimeReactiveGraphic {
  elemIndex: number;
  type: 'path_rotation' | 'line_endpoint';
  /** Center point for polar computation (path origin or line fixed end) */
  centerX: number;
  centerY: number;
  /** Distance from center to the moving point (line) or ignored for path */
  radius: number;
  /** Which time component drives this element */
  timeComponent: 'second' | 'minute' | 'hour';
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export interface IRAnimatedElement {
  elemIndex: number;
  prop: 'top' | 'width' | 'height' | 'radius';
  keyframes: number[];
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface IRMessageInfo {
  key: string;
  mockDataArrayName: string | null;
  mockDataSource: string | null;
}

// ---------------------------------------------------------------------------
// Top-level IR
// ---------------------------------------------------------------------------

export interface CompilerIR {
  /** Target platform info */
  platform: {
    name: string;
    width: number;
    height: number;
    isRound: boolean;
  };

  /** The visual tree from the baseline render */
  tree: IRElement[];

  /** State slots from useState interception */
  stateSlots: IRStateSlot[];

  /** Button → action mappings */
  buttonActions: IRButtonAction[];

  /** Time-dependent labels: label index → time format */
  timeDeps: Map<number, TimeFormat>;

  /** State-dependent labels: label index → state dependency */
  stateDeps: Map<number, IRStateDep>;

  /** Skin-reactive rects: rect index → skin dependency */
  skinDeps: Map<number, IRSkinDep>;

  /** Structural branches (whole-tree alternatives per state value) */
  branches: Map<number, IRBranch[]>;

  /** Per-subtree conditional children */
  conditionalChildren: IRConditionalChild[];

  /** List metadata (null if no list pattern detected) */
  listInfo: IRListInfo | null;

  /** Labels identified as list slots */
  listSlotLabels: Set<number>;

  /** Time-reactive graphics (paths with rotation, lines with moving endpoints) */
  timeReactiveGraphics: IRTimeReactiveGraphic[];

  /** Animation keyframes */
  animatedElements: IRAnimatedElement[];

  /** useMessage info (null if no message hook) */
  messageInfo: IRMessageInfo | null;

  /** Convenience flags */
  hasButtons: boolean;
  hasTimeDeps: boolean;
  hasStateDeps: boolean;
  hasBranches: boolean;
  hasConditionals: boolean;
  hasSkinDeps: boolean;
  hasList: boolean;
  hasAnimatedElements: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Strip `this.` prefix from format expressions for backends that use
 * module-level state variables (Rocky.js, C) instead of class fields (piu).
 */
export function stripThisPrefix(expr: string): string {
  return expr.replace(/this\./g, '');
}
