# v3 Compile-Time Reactivity Design

## Context

react-pebble compiles Preact JSX components into Moddable's piu scene-graph framework for Pebble Alloy smartwatches. The v2 compiler handles static layouts and time-update behaviors. v3 adds general state reactivity: `useState` values that change at runtime (via button presses) trigger targeted piu label mutations — all inferred automatically at compile time, with zero runtime object allocation.

**Target example:** `examples/counter.tsx` — a counter with up/down/reset buttons.

**Constraints:**
- Alloy mod chunk heap: ~3 KB. No per-frame object allocation.
- Alloy mod cannot contain native code. Only pure JS in the mod.
- piu scene graph is static (built once at startup). Updates happen via imperative property mutation on named nodes.
- Button API (`watch.addEventListener("button", ...)`) is unconfirmed. Design assumes best-guess event names; probe with `pebble emu-button` after initial deploy.

## Approach: Multi-Snapshot Diff

Extend v2's proven pattern. Render the component at multiple state snapshots, diff the label outputs, infer which labels depend on which state variables, and emit a piu Behavior that mutates only those labels when state changes.

### 1. State Discovery

Before rendering, monkey-patch `useState` from `preact/hooks`:
- Wrap the real implementation to intercept each call.
- Record each state slot: `{ index, initialValue, setter }`.
- After the baseline render, we have a registry of all state slots.

**Slot naming:** Generic positional names `s0`, `s1`, etc. (variable names aren't available at runtime).

**Perturbation values** (to create diff-able renders):
| Type | Perturbation |
|------|-------------|
| number | `initialValue + 42` |
| string | `initialValue + "__PROBE__"` |
| boolean | `!initialValue` |
| array/object | skip (not supported in v3) |

### 2. Dependency Mapping

Render N+1 times (baseline + one per state slot):

1. **Baseline render:** All state at initial values. Collect every label's text, indexed by tree position.
2. **Perturbed render (per slot):** Force one state slot to its perturbed value, re-render, collect labels. Any label whose text changed depends on that slot.

**Output:** A dependency map:
```
dependencies = {
  labelIndex: { stateSlots: [0], baselineText: "0", perturbedText: "42" }
}
```

**Format inference:** If `String(perturbedValue) === perturbedText`, the format is a simple `toString()`. Otherwise, try substitution: find the perturbed value as a substring and replace with a runtime expression. Fall back to a compile-time warning if no pattern matches.

### 3. Button Event Binding

Intercept `useButton` calls during the baseline render:
- Record: `{ button: "up", handler: fn }`.
- Analyze handler via `fn.toString()` for common patterns:
  - `c => c + N` → increment by N
  - `c => c - N` → decrement by N
  - `setState(constant)` or `() => constant` → reset to constant
  - Unrecognized → emit a warning comment in the output

**Emitted button handling:**
```js
onButton(e) {
  const name = e && e.button;
  if (name === "up") { this.s0 += 1; this.refresh(); }
  else if (name === "down") { this.s0 -= 1; this.refresh(); }
  else if (name === "select") { this.s0 = 0; this.refresh(); }
}
```

### 4. Emitted Code Structure

The compiled output for counter.tsx:

```js
import {} from "piu/MC";

// Skins, styles (deduplicated as in v2)
const bgSkin = new Skin({ fill: "#000000" });
const titleSkin = new Skin({ fill: "#ffffff" });
const titleStyle = new Style({ font: "bold 18px Gothic", color: "#000000" });
const countStyle = new Style({ font: "bold 42px Bitham", color: "#ffffff" });
const hintStyle = new Style({ font: "14px Gothic", color: "#c0c0c0" });

class CounterBehavior extends Behavior {
  onCreate(app) {
    this.s0 = 0;  // count initial value
    const c = app.first;
    this.sl1 = c.content("sl1");  // count display label
  }
  onDisplaying(app) {
    this.refresh();
    if (typeof watch !== "undefined" && watch) {
      watch.addEventListener("button", (e) => this.onButton(e));
      watch.addEventListener("buttonClick", (e) => this.onButton(e));
    }
  }
  onButton(e) {
    const name = e && e.button;
    if (name === "up") { this.s0 += 1; this.refresh(); }
    else if (name === "down") { this.s0 -= 1; this.refresh(); }
    else if (name === "select") { this.s0 = 0; this.refresh(); }
  }
  refresh() {
    this.sl1.string = "" + this.s0;
  }
}

const App = Application.template(() => ({
  skin: bgSkin,
  Behavior: CounterBehavior,
  contents: [
    // Static layout: title bar, count display, instruction text
    new Container(null, { contents: [
      // ... StatusBar placeholder, title rect, title label ...
      new Label(null, { top: 55, left: 0, width: 144, style: countStyle,
                        horizontal: "center", name: "sl1", string: "0" }),
      // ... hint labels ...
    ] })
  ],
}));

export default new App(null, { touchCount: 0, pixels: screen.width * 4 });
```

**Key properties:**
- Zero per-frame allocation. `refresh()` only assigns `.string` on existing nodes.
- State lives as Behavior instance fields (`this.s0`). Piu Behaviors persist for the app's lifetime.
- Button handlers are simple arithmetic on the field + a `refresh()` call.
- Named labels (`sl1`) for compiler-addressable nodes; static labels have no name.

### 5. Compiler Pipeline Changes

The compiler (`scripts/compile-to-piu.ts`) takes an `EXAMPLE` env var (e.g., `EXAMPLE=counter`) to select which example's `main()` function to import and compile. It gains these stages:

```
[existing] Mock Date for time diff
[new]      Intercept useState → build stateSlots registry
[new]      Intercept useButton → build buttonBindings registry
[existing] Render baseline → collect label texts
[new]      For each state slot: force value, re-render, diff labels
[existing] For time: render at T1/T2, diff labels
[existing] Emit piu template with named dynamic labels
[new]      Emit Behavior with state fields, button handlers, refresh()
[existing] Emit time update in refresh() if time-dependent labels exist
```

The Behavior class merges time updates and state updates into a single `refresh()` method. Both `onTimeChanged` and `onButton` call it.

### 6. Interaction with v2 (Time Behaviors)

v2's `TimeBehavior` is subsumed into the unified Behavior class. The `refresh()` method handles both time-dependent and state-dependent labels:

```js
refresh() {
  const d = new Date();
  this.tl0.string = pad(d.getHours()) + ":" + pad(d.getMinutes());  // time
  this.sl1.string = "" + this.s0;  // state
}
```

For watchface.tsx (no state, only time), the emitted Behavior is identical to v2. For counter.tsx (state + no time), the time lines are absent. For a hypothetical component with both, they coexist.

## Scope

**In scope:**
- `useState` with number values
- `useButton` with increment/decrement/reset patterns
- Label `.string` mutations derived from state via `toString()`
- Time labels (carried forward from v2)
- Merged Behavior class for time + state

**Out of scope (v4+):**
- Conditional rendering (`{flag ? <A/> : <B/>}`) → piu visibility toggling
- Dynamic lists (`.map()`) → piu Container contents manipulation
- Complex derived state (`items[index]`)
- String/object/array state types
- `useEffect` side effects
- `useListNavigation`
- Multiple components / component composition beyond the root

## Risks

1. **Button API unconfirmed.** `watch.addEventListener("button", handler)` may use different event names or payload shapes. Mitigation: probe with `pebble emu-button` after first deploy; the fix is changing event names in the emitted code, not the architecture.
2. **setState pattern matching is brittle.** Only `v + N`, `v - N`, and constant-reset are recognized. Other patterns (e.g., `Math.max(0, v - 1)`) produce a compile-time warning. Mitigation: add patterns as real examples demand them.
3. **Perturbation collisions.** If `count + 42` happens to match another label's text, the dependency map has a false positive. Mitigation: use a distinctive perturbation value (42 is unlikely to collide with real UI text).

## Verification

After implementation, verify:
1. `npx tsx scripts/compile-to-piu.ts` with counter.tsx entry produces valid piu JS with CounterBehavior.
2. `pebble build` compiles the output without errors.
3. `pebble install --emulator emery --logs` boots the app.
4. `pebble emu-button --button up` (or equivalent) triggers a state change visible in the xsHost logs.
5. `pebble screenshot` shows the updated count value.
