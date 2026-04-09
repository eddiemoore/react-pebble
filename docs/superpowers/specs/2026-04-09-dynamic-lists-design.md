# Dynamic Lists (.map()) via Pre-Allocated Slot Pools

## Context

The compile-to-piu compiler handles static layouts, state reactivity, conditional branching, and skin swaps. The next feature is dynamic list rendering — `.map()` over arrays — needed for scrollable lists like the jira-list example.

Pebble Alloy mods have ~3 KB of runtime heap. piu supports `container.add()`/`.remove()`/`.replace()` but runtime node creation risks heap exhaustion. Instead, we pre-allocate a fixed number of visible slot Containers at compile time and update their Label strings on scroll — zero runtime allocation.

## Target example

New `examples/simple-list.tsx`: a fixed array of 5 string items, `.map()` rendering 3 visible at a time, up/down scrolling via `useButton`. No async loading, no detail view, no conditional rendering — just the `.map()` pattern.

## Approach: Pre-allocated slot pool

### Compile time (AST analysis)

1. Walk the component's AST for `.map()` CallExpressions on arrays within JSX returns
2. Identify: the source array expression, the visible window computation (`.slice(index, index + N)`), and the per-item JSX callback
3. Render the component in mock mode to get concrete data for each slot (labels, positions, styles)
4. Count the visible window size (N) from the slice expression or the mock render output
5. Emit N pre-allocated slot nodes in the piu template, each with a unique name (`ls0`, `ls1`, ...)

### Runtime (piu Behavior)

1. The Behavior holds the data array as a JS array literal (baked in at compile time)
2. State field `s{N}` tracks the scroll index (from `useState`)
3. On up/down button press, increment/decrement the scroll index
4. `refresh()` iterates visible slots and assigns `this.slots[i].string = items[start + i]`
5. Hide slots past the end of the array: `this.slots[i].visible = !!items[start + i]`

### Compiled output shape

```js
const items = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];

class AppBehavior extends Behavior {
  onCreate(app) {
    this.s0 = 0; // scroll index
    this.slots = [];
    for (let i = 0; i < 3; i++) {
      this.slots.push(this.find(app, "ls" + i));
    }
  }
  onDisplaying(app) {
    this.refresh();
    new PebbleButton({ type: "up", onPush: (pushed) => {
      if (pushed) { this.s0 = Math.max(0, this.s0 - 1); this.refresh(); }
    }});
    new PebbleButton({ type: "down", onPush: (pushed) => {
      if (pushed) { this.s0 = Math.min(items.length - 3, this.s0 + 1); this.refresh(); }
    }});
  }
  refresh() {
    for (let i = 0; i < 3; i++) {
      const item = items[this.s0 + i];
      this.slots[i].string = item ?? "";
      this.slots[i].visible = (item !== undefined);
    }
  }
}

// Template: 3 pre-allocated slots at fixed y positions
const App = Application.template(() => ({
  contents: [
    new Label(null, { top: 20, ..., name: "ls0", string: "Alpha" }),
    new Label(null, { top: 60, ..., name: "ls1", string: "Beta" }),
    new Label(null, { top: 100, ..., name: "ls2", string: "Gamma" }),
  ]
}));
```

## AST detection

Using the TypeScript AST (already in the compiler), detect:

1. **`.map()` call on array**: `CallExpression` where `expression` is `PropertyAccessExpression` with name `map`, and the object is an identifier or expression that resolves to an array
2. **Visible window**: look for `.slice(startExpr, startExpr + N)` before the `.map()` — extract N as the slot count
3. **Callback template**: the `.map()` callback's JSX return — extract the per-item element structure (which Labels, what props)
4. **Data array**: extract the array literal or variable name to bake into the compiled output

For the simplified example, the pattern is straightforward:
```tsx
const visible = items.slice(index, index + 3);
// ...
{visible.map((item, i) => (
  <Group y={20 + i * 40}>
    <Text>{item}</Text>
  </Group>
))}
```

## Interaction with existing features

- **State reactivity**: the scroll index is a `useState(number)` — already handled by the perturbation pipeline. The `.map()` detection adds a new kind of dependency: "these slots depend on state slot N as a scroll index"
- **Button handling**: up/down buttons modify the scroll index — already handled by `analyzeButtonHandler` (increment/decrement pattern)
- **Structural branching**: if the component has both `.map()` AND conditional branches (like jira-list), the list slots are emitted inside the appropriate branch container. For the simplified example, there's no branching.

## Scope

**In scope:**
- AST detection of `.map()` on arrays in JSX
- Fixed-size visible window (`.slice(index, index + N)`)
- Pre-allocated Label slots with string updates on scroll
- Data array baked as a JS literal in the compiled output
- Slot visibility toggling for partial last pages
- New `examples/simple-list.tsx` test example

**Out of scope:**
- Variable-length lists (items added/removed at runtime)
- Multi-label per-item templates (e.g., IssueCard with 4 labels per item)
- Per-item skin reactivity (selection highlight)
- Nested `.map()` calls
- Dynamic y-positioning (items at computed positions)

## Verification

1. `npx tsc --noEmit` passes
2. `EXAMPLE=simple-list npx tsx scripts/compile-to-piu.ts 2>/dev/null` produces piu output with 3 named slot Labels and a Behavior with scroll logic
3. All existing examples still compile identically (regression check)
4. Deploy to emery emulator: list shows 3 items, UP/DOWN scrolls through all 5, items past the end are hidden
5. `pebble screenshot` captures both initial state and scrolled state
