# react-pebble

Write Pebble watchfaces and apps in JSX, compile them to native Pebble Alloy code that runs on the watch.

> **Status**: Working proof of concept. Watchface, counter, and JIRA list examples all compile and deploy to the Pebble emulator.

## How it works

You write components using Preact (JSX, hooks, functional components). A compile-time tool renders your component in Node, snapshots the virtual DOM, and emits [Moddable piu](https://github.com/nicklausw/moddable/tree/master/modules/piu) scene-graph code that runs natively on Pebble Alloy (emery/gabbro platforms).

```
  watchface.tsx          compile-to-piu.ts          piu main.js
 ┌──────────────┐       ┌─────────────────┐       ┌──────────────┐
 │ JSX + hooks  │──────▶│ Mock render +   │──────▶│ Application  │
 │ useTime()    │       │ perturbation    │       │ .template()  │
 │ useButton()  │       │ diff + emit     │       │ + Behaviors  │
 └──────────────┘       └─────────────────┘       └──────┬───────┘
                                                         │
                                                  pebble build
                                                         │
                                                  ┌──────▼───────┐
                                                  │ XS bytecode  │
                                                  │ (~5 KB mod)  │
                                                  │ on emery     │
                                                  └──────────────┘
```

### Why compile-time?

Pebble Alloy mods get ~3 KB of runtime heap. That's not enough to run Preact (or any VDOM framework) on-watch. Instead, the framework runs at compile time in Node where memory is unlimited. The compiled output is pure piu code with zero per-frame allocation — just property assignments on pre-built scene-graph nodes.

## Quick start

```bash
# Install dependencies
npm install

# Compile the watchface example to piu
EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js

# Build and deploy to emulator
cd pebble-spike
pebble build
pebble install --emulator emery --logs
```

## Writing components

Components use standard Preact JSX with a small set of Pebble-specific primitives:

```tsx
import { render } from '../src/index.js';
import { Text, Rect, Group } from '../src/components/index.js';
import { useTime, useButton, useState } from '../src/hooks/index.js';

function WatchFace() {
  const time = useTime();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={90} w={200} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?) {
  return render(<WatchFace />, { poco: PocoCtor });
}
```

### Components

| Component | Description |
|-----------|------------|
| `<Rect>` | Rectangle with fill and/or stroke |
| `<Text>` | Text with Pebble font, color, alignment |
| `<Group>` | Container with x/y offset |
| `<Line>` | Axis-aligned line (horizontal/vertical) |
| `<Circle>` | Circle (stubbed — not yet supported in piu output) |
| `<StatusBar>` | No-op placeholder (Alloy has no built-in status bar) |

### Hooks

| Hook | Description |
|------|------------|
| `useTime(intervalMs?)` | Returns a `Date` that updates every N ms. Compiles to piu `onTimeChanged` behavior. |
| `useFormattedTime(format?)` | Returns formatted time string (HH:mm, hh:mm:ss a, etc.) |
| `useState(initialValue)` | Number or boolean state. Compiles to piu Behavior instance fields. |
| `useButton(button, handler)` | Hardware button handler (up/down/select/back). Compiles to `PebbleButton` native module. |
| `useInterval(callback, delay)` | Runs a callback on an interval. |
| `useListNavigation(items, opts)` | Up/down button navigation through a list. |

### Fonts

Available system fonts (matched to Pebble's built-in font resources):

`gothic14`, `gothic14Bold`, `gothic18`, `gothic18Bold`, `gothic24`, `gothic24Bold`, `gothic28`, `gothic28Bold`, `bitham30Black`, `bitham42Bold`, `bitham42Light`

### Colors

Named palette: `black`, `white`, `red`, `green`, `blue`, `yellow`, `orange`, `cyan`, `magenta`, `clear`, `lightGray`, `darkGray`

## What the compiler detects automatically

The compiler renders your component multiple times with different state values and diffs the output to infer reactive bindings:

| Pattern | Detection method | Compiled output |
|---------|-----------------|-----------------|
| `useTime()` dependent text | Render at two mock times, diff labels | `onTimeChanged` + `pad(d.getHours())` |
| `useState(number)` dependent text | Perturb value +42, diff labels | `this.s0 += 1; this.sl1.string = "" + this.s0` |
| `useState(boolean)` conditional text | Perturb true/false, diff labels | `this.sl0.string = this.s0 ? "ON" : "OFF"` |
| `useState(boolean)` conditional tree | Perturb true/false, diff tree shape | Two branch Containers with `.visible` toggling |
| `useButton` increment/decrement/reset | Regex on handler `.toString()` | `PebbleButton({ type: "up", onPush: ... })` |
| `useButton` toggle | Regex on `v => !v` pattern | `this.s0 = !this.s0; this.refresh()` |
| Async data loading | `SETTLE_MS=200` waits for effects | Snapshot includes loaded data |

## Examples

### Watchface (live clock)
```bash
EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
```
Displays hours:minutes, seconds, and date. Updates every second via piu `onTimeChanged`.

### Counter (interactive buttons)
```bash
EXAMPLE=counter npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
```
UP increments, DOWN decrements, SELECT resets to 0. Uses `PebbleButton` native module.

### Toggle (boolean state)
```bash
EXAMPLE=toggle npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
```
SELECT toggles between ON/OFF text display.

### Views (structural branching)
```bash
EXAMPLE=views npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
```
SELECT switches between a list view (3 labels) and detail view (5 labels, blue background). Uses piu `.visible` toggling on pre-rendered branch Containers.

### JIRA List (async data + complex layout)
```bash
EXAMPLE=jira-list SETTLE_MS=200 npx tsx scripts/compile-to-piu.ts > pebble-spike/src/embeddedjs/main.js
```
Renders 5 JIRA issues with keys, summaries, statuses, and priorities. Currently a static snapshot (interactivity requires dynamic list support — see limitations).

## Deploying to emulator

```bash
cd pebble-spike
pebble build
pebble install --emulator emery --logs    # boots emulator + installs
pebble screenshot /tmp/screenshot.png     # capture the screen
pebble emu-button click up                # simulate button press
pebble kill                               # stop emulator
```

Requires Pebble SDK v4.9+ (Rebble fork) with the Alloy project type.

## Architecture

```
src/
  components/index.tsx    — JSX wrappers (<Rect>, <Text>, <Group>, etc.)
  hooks/index.ts          — Pebble hooks (useTime, useButton, useState wrapper)
  pebble-dom.ts           — Virtual DOM (type, props, children tree)
  pebble-dom-shim.ts      — DOM-like adapter so Preact can render into pebble-dom
  pebble-reconciler.ts    — Thin wrapper: Preact render() → pebble-dom
  pebble-render.ts        — Entry point: creates Poco mock or real renderer
  pebble-output.ts        — Poco drawing layer (used in mock mode for draw-log)
  types/moddable.d.ts     — Ambient types for Moddable globals (screen, watch, Poco)
  index.ts                — Public API re-exports

scripts/
  compile-to-piu.ts       — The compiler: mock render → pebble-dom → piu output

examples/
  watchface.tsx            — Digital clock watchface
  counter.tsx              — Interactive counter with buttons
  toggle.tsx               — Boolean state toggle
  views.tsx                — Structural conditional rendering
  jira-list.tsx            — JIRA issue list with async data

pebble-spike/             — Pebble SDK project for emulator deployment
  src/embeddedjs/main.js  — Auto-generated by compile-to-piu.ts (gitignored)
  entry/watchface.tsx      — Alloy entry shim (imports Poco + calls main)
```

## Limitations

- **Emery/gabbro only.** Alloy projects target emery (200x228) and gabbro platforms. Basalt/chalk/aplite are not supported by Alloy.
- **~3 KB runtime heap.** Alloy mods get minimal heap from the firmware. No VDOM framework runs on-watch — all reactivity is compiled away.
- **No dynamic lists.** `.map()` with variable-length arrays can't be compiled to static piu yet. The jira-list example renders a fixed snapshot.
- **No nested conditionals.** `if/else` inside `if/else` is not yet handled.
- **No Skin/style reactivity.** Background color changes between branches require structural branching (separate Containers), not in-place Skin swapping.
- **String enum state not yet supported.** Only boolean and number states are perturbed. String states (e.g., `view: 'list' | 'detail'`) fall back to structural branch detection.
- **Button API is best-guess.** We use `PebbleButton` from `"pebble/button"` which is confirmed working, but long-press and multi-button combos are untested.
- **Circles not implemented.** Poco has no native circle primitive; would need the `commodetto/outline` extension.

## Key discovery: why React can't run on Pebble

During development we tried React, then Preact, directly on the Alloy runtime. Both failed:

- **React + react-reconciler**: 192 KB XS bytecode. Emery has 128 KB RAM. XS panics at module load.
- **Preact**: 39 KB bytecode fits in resources, but XS slot allocation fails at module init — the mod's chunk heap (~3 KB) can't hold Preact's VDOM tree even for a simple render.
- **Direct Poco**: Works perfectly (the "hello world" probe). 10 KB bytecode, zero allocation pressure.
- **piu (Moddable's scene-graph)**: Pre-loaded in firmware, costs ~0 bytes of mod heap. This is what the compiled output uses.

The compile-time approach is the only way to have React-like DX while fitting in Alloy's memory budget.

## License

MIT
