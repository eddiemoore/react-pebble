# react-pebble

[![CI](https://github.com/eddiemoore/react-pebble/actions/workflows/ci.yml/badge.svg)](https://github.com/eddiemoore/react-pebble/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-pebble)](https://www.npmjs.com/package/react-pebble)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Write Pebble watchfaces and apps in JSX — compiles to native piu code that runs on the watch.

```bash
npx create-pebble-app my-watchface
cd my-watchface
npx vite build
```

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

### Option 1: Vite plugin (recommended)

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { pebblePiu } from 'react-pebble/plugin';

export default defineConfig({
  plugins: [
    pebblePiu({
      entry: 'src/App.tsx',       // your component
      deploy: true,                // auto build + install to emulator
    }),
  ],
});
```

```bash
vite build    # compiles → scaffolds → builds → deploys to emulator
```

The plugin automatically:
- Compiles your JSX to piu code
- Scaffolds a Pebble project in `.pebble-build/` (gitignored)
- Sets watchface/watchapp mode based on button usage
- Runs `pebble build && pebble install` (when `deploy: true`)

### Option 2: CLI

```bash
# Install dependencies
npm install

# Compile the watchface example to piu
EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js

# Build and deploy to emulator
cd .pebble-build
pebble build
pebble install --emulator emery --logs
```

## Writing components

Components use standard Preact JSX with a small set of Pebble-specific primitives:

```tsx
import { render, Text, Rect, Group } from 'react-pebble';
import { useTime, useButton, useState } from 'react-pebble/hooks';

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

export function main() {
  return render(<WatchFace />);
}
```

### Components

| Component | Description |
|-----------|------------|
| `<Rect>` | Rectangle with fill and/or stroke |
| `<Text>` | Text with Pebble font, color, alignment |
| `<Group>` | Container with x/y offset |
| `<Line>` | Axis-aligned line (horizontal/vertical) |
| `<Circle>` | Circle via piu RoundRect (fill only, no stroke) |
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
| `useState(string)` enum branching | Extract values from handler AST, perturb each | N-way `.visible` toggling |
| Skin/background reactivity | Perturb state, diff rect fills | `.skin` swap between pre-declared Skins |
| `useButton` increment/decrement/reset | TypeScript AST analysis of handler | `PebbleButton({ type: "up", onPush: ... })` |
| `useButton` toggle | AST detects `v => !v` pattern | `this.s0 = !this.s0; this.refresh()` |
| `useButton` set string | AST detects `setState('value')` | `this.s0 = "detail"; this.refresh()` |
| `.map()` list rendering | AST detects `.map()` + `.slice()` | Pre-allocated Label slots with scroll behavior |
| Setter→slot mapping | AST parses `const [x, setX] = useState` | Correct `this.s{N}` per setter |
| Async data loading | `SETTLE_MS=200` waits for effects | Snapshot includes loaded data |
| Watchface vs watchapp mode | Auto-detects from button usage | Sets `package.json` watchface flag |

## Examples

### Watchface (live clock)
```bash
EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
Displays hours:minutes, seconds, and date. Updates every second via piu `onTimeChanged`.

### Counter (interactive buttons)
```bash
EXAMPLE=counter npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
UP increments, DOWN decrements, SELECT resets to 0. Uses `PebbleButton` native module.

### Toggle (boolean state + skin reactivity)
```bash
EXAMPLE=toggle npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
SELECT toggles between ON/OFF text and swaps background red↔green (skin reactivity).

### Views (structural branching)
```bash
EXAMPLE=views npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
SELECT switches between a list view (3 labels) and detail view (5 labels, blue background). Uses piu `.visible` toggling on pre-rendered branch Containers.

### Multiview (3-way string enum)
```bash
EXAMPLE=multiview npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
UP=Settings, DOWN=About, SELECT=Home. Three named branch Containers with string-equality visibility conditions.

### Simple List (scrollable .map())
```bash
EXAMPLE=simple-list npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
5 string items, 3 visible at a time, UP/DOWN scrolls. Pre-allocated Label slots updated via `.string` on scroll.

### Tasks (multi-feature app)
```bash
EXAMPLE=tasks npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
List/detail view switching (string enum branching) + selection counter (numeric state) + selection highlight (skin reactivity) + 4-button navigation. The most complex working example.

### Analog Clock (circles + time)
```bash
./scripts/deploy.sh analog-clock
```
Analog-style clock face with 12 hour markers (circles), red center dot, digital time, seconds, and date. Showcases circles + useTime.

### Rich List (multi-label items)
```bash
./scripts/deploy.sh rich-list
```
5 items with title + status subtitle, 3 visible, scrollable. Each list item has 2 labels updated from an object array on scroll.

### Selected List (scroll + highlight)
```bash
./scripts/deploy.sh selected-list
```
Scrollable list with selection highlight (dark gray background on selected item) + counter text ("1/5") that updates on scroll.

### JIRA Lite (flagship demo)
```bash
./scripts/deploy.sh jira-lite
```
Full JIRA-style issue tracker: list/detail view switching + scrollable multi-label list + selection highlight + circle priority indicator + 4-button navigation. Uses every compiler feature.

### JIRA List (async data + complex layout)
```bash
EXAMPLE=jira-list SETTLE_MS=200 npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
```
Renders 5 JIRA issues with keys, summaries, statuses, and priorities. Static snapshot of the loaded state.

## Deploying to emulator

One-command deploy:
```bash
./scripts/deploy.sh watchface           # compile + build + install + screenshot
./scripts/deploy.sh jira-lite --logs    # with live log streaming
./scripts/deploy.sh counter             # auto-detects watchapp mode for buttons
```

Manual steps (from packages/react-pebble/):
```bash
EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
cd .pebble-build && pebble build && pebble install --emulator emery --logs
pebble screenshot /tmp/screenshot.png   # capture the screen
pebble emu-button click up              # simulate button press
pebble kill                             # stop emulator
```

Requires Pebble SDK v4.9+ (Rebble fork) with the Alloy project type.

## Architecture

```
packages/
  react-pebble/              — npm: react-pebble
    src/
      compiler/index.ts      — Programmatic compiler API
      plugin/index.ts        — Vite plugin (pebblePiu)
      components/index.tsx   — JSX wrappers (<Rect>, <Text>, <Circle>, etc.)
      hooks/index.ts         — Hooks (useTime, useButton, useState, useMessage)
      pebble-dom.ts          — Virtual DOM
      pebble-dom-shim.ts     — DOM adapter for Preact
      pebble-render.ts       — Mock renderer entry point
      platform.ts            — Screen dimensions (SCREEN.width/height)
      index.ts               — Public API
    scripts/
      compile-to-piu.ts      — The compiler: JSX → pebble-dom → piu output
    examples/                — 17 working examples
    test/                    — 14 snapshot tests
  create-pebble-app/         — npm: create-pebble-app
    index.js                 — Project scaffolder CLI
```

## Limitations

- **Emery/gabbro only.** Alloy projects target emery (200x228) and gabbro platforms. Basalt/chalk/aplite are not supported by Alloy.
- **~3 KB runtime heap.** Alloy mods get minimal heap from the firmware. No VDOM framework runs on-watch — all reactivity is compiled away.
- **Single-label list items.** `.map()` lists currently support one Label per item. Multi-label templates (e.g., IssueCard with title + status + priority) need extension.
- **No nested conditionals.** `if/else` inside `if/else` is not yet handled.
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
