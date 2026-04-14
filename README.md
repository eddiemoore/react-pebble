# react-pebble

[![CI](https://github.com/eddiemoore/react-pebble/actions/workflows/ci.yml/badge.svg)](https://github.com/eddiemoore/react-pebble/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-pebble)](https://www.npmjs.com/package/react-pebble)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Write Pebble watchfaces and apps in JSX — compiles to piu, Rocky.js, or native C that runs on the watch.

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

### Multi-target compilation

The compiler supports three output targets:

- **alloy** (default) — Emits Moddable piu scene-graph code for Pebble Alloy (emery/gabbro)
- **rocky** — Emits Rocky.js code for classic Pebble platforms (basalt, chalk)
- **c** — Emits native C code using the Pebble C SDK

Set via the `target` option in the Vite plugin or compiler API.

## Quick start

### Option 1: Vite plugin (recommended)

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { pebblePiu } from 'react-pebble/plugin';

export default defineConfig({
  plugins: [
    pebblePiu({
      entry: 'src/App.tsx',          // your component
      deploy: true,                   // auto build + install to emulator
      targetPlatforms: ['emery'],     // or ['emery', 'gabbro'] for multi-platform
      target: 'alloy',               // 'alloy' (piu) | 'rocky' (Rocky.js) | 'c' (native C)
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
- Generates phone-side JS with mock data for `useMessage` apps
- Runs `pebble build && pebble install` (when `deploy: true`)

### Option 2: CLI

```bash
npm install
EXAMPLE=watchface npx tsx scripts/compile-to-piu.ts > .pebble-build/src/embeddedjs/main.js
cd .pebble-build && pebble build && pebble install --emulator emery --logs
```

## Writing components

Components use standard Preact JSX with Pebble-specific primitives:

```tsx
import { render, Text, Rect, Circle, Group, Column } from 'react-pebble';
import { useTime, useButton, useState, useBattery } from 'react-pebble/hooks';

function WatchFace() {
  const time = useTime();
  const battery = useBattery();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={90} w={200} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>
      <Circle x={170} y={10} r={8} fill={battery.percent > 20 ? 'green' : 'red'} />
    </Group>
  );
}

export function main() {
  return render(<WatchFace />);
}
```

### Components

26 JSX components covering primitives, layout, composites, and navigation:

#### Primitives

| Component | Description |
|-----------|------------|
| `<Rect>` | Rectangle with fill, stroke, and optional `borderRadius` for rounded corners |
| `<Circle>` | Circle with fill and/or stroke (midpoint algorithm + piu RoundRect) |
| `<Text>` | Text with font, color, alignment. Auto-wraps to fit width. |
| `<Line>` | Line (axis-aligned or diagonal via Bresenham's algorithm) |
| `<Image>` | Bitmap image with optional `rotation` (radians) and `scale` |
| `<SVGImage>` | Vector graphics (PDC/SVG) with rotation, scale, and translation |
| `<Arc>` | Arc/ring segment with `startAngle`, `endAngle`, thickness, and fill |
| `<Path>` | Arbitrary polygon from coordinate pairs with rotation and offset |
| `<Canvas>` | Custom drawing surface with `onDraw` callback for imperative Poco access |

#### Layout

| Component | Description |
|-----------|------------|
| `<Window>` | Fullscreen container with button handler props |
| `<Group>` | Container with x/y offset and optional w/h sizing |
| `<Column>` | Vertical layout — stacks children with configurable `gap` |
| `<Row>` | Horizontal layout — stacks children with configurable `gap` |
| `<Scrollable>` | Scrollable container with scroll indicators and clip region |
| `<RoundSafeArea>` | Auto-insets children on round displays with configurable padding |

#### Composites

| Component | Description |
|-----------|------------|
| `<StatusBar>` | Status bar with centered time, background color, and separator style |
| `<ActionBar>` | Right-edge action bar with icon placeholders for up/select/down |
| `<Card>` | Composite: title bar + body text |
| `<Badge>` | Composite: circle + centered text |
| `<TextFlow>` | Multi-line flowing text with paragraph support |
| `<AnimatedImage>` | Frame sequence animation with FPS and loop control |

#### Navigation & Menus

| Component | Description |
|-----------|------------|
| `<MenuLayer>` | Scrollable menu with sections, headers, and item selection |
| `<SimpleMenu>` | Flat single-section menu (simplified MenuLayer) |
| `<ActionMenu>` | Hierarchical menu overlay with back button navigation |
| `<NumberWindow>` | Numeric input picker with min/max/step via up/down/select |
| `<WindowStack>` | Multi-window navigation with push/pop/replace and back button |
| `useNavigation()` | Hook for accessing the surrounding `WindowStack` (push/pop/replace) from descendants |

### Hooks

65+ hooks covering time, input, sensors, storage, networking, animation, workers, lifecycle, i18n, and system APIs:

#### Time & Animation

| Hook | Description |
|------|------------|
| `useTime(intervalMs?)` | Returns a `Date` that updates every N ms. Uses `watch` events on device for battery efficiency. |
| `useFormattedTime(format?)` | Formatted time string (HH:mm, hh:mm:ss a, etc.) |
| `useAnimation(options)` | Animate 0→1 progress with easing over a duration. Supports loop. Compiler samples keyframes. |
| `useAnimationSequence(steps)` | Sequential multi-step animation chain. |
| `useAnimationSpawn(animations)` | Multiple concurrent animations running in parallel. |
| `useInterval(callback, delay)` | Runs a callback on an interval. |
| `useTimer(callback)` | One-shot/repeating timer with start/stop/cancel. |
| `lerp(from, to, progress)` | Interpolate between two values. |
| `Easing` | 18 easing functions: quad, cubic, sine, expo, circular, bounce, elastic, back (in/out/inOut). |

#### Input

| Hook | Description |
|------|------------|
| `useButton(button, handler)` | Hardware button handler (up/down/select/back). Compiles to `PebbleButton` native module. |
| `useLongButton(button, handler)` | Long-press button handler. |
| `useMultiClick(button, handlers)` | Single/double/triple click detection with configurable timeout. |
| `useRepeatClick(button, options)` | Auto-repeating button press on hold. |
| `useRawClick(button, options)` | Raw button down/up events for low-level input handling. |
| `useListNavigation(items, opts)` | Up/down button navigation through a list with optional wrapping. |
| `useDictation()` | Voice dictation input: start/stop, transcript result. |

#### Sensors & Hardware

| Hook | Description |
|------|------------|
| `useBattery()` | Returns `{ percent, charging, plugged }` from the Battery sensor. |
| `useConnection()` | Returns `{ app, pebblekit }` connection status. |
| `useAccelerometer(options?)` | Returns `{ x, y, z }` motion data with optional `onTap`/`onDoubleTap` callbacks. |
| `useAccelerometerRaw(options?)` | Batched raw accelerometer samples at a chosen rate (10/25/50/100 Hz). |
| `useAccelerometerTap(handler)` | Direct tap-event subscription with `{ axis, direction }` payload. |
| `useCompass()` | Returns `{ heading }` in degrees (0-360). |
| `useHealth(pollInterval?)` | Health API: steps, sleep, heart rate, distance. |
| `useHealthAlert(options)` | Fires a callback when a health metric crosses a threshold. |
| `useHeartRateMonitor(options)` | High-sample-rate heart-rate monitoring session control. |
| `useHealthHistory(options)` | Time-series history of a health metric across N days. |
| `useMeasurementSystem()` | Reads the user's preferred measurement system (`metric`/`imperial`). |
| `useVibration()` | Haptic vibration patterns: short, long, double, custom sequences. |
| `useLight()` | Backlight control: on, off, auto. |
| `useLocation(options?)` | GPS location via phone: lat, lng, accuracy, altitude. |

#### State & Storage

| Hook | Description |
|------|------------|
| `useState(initialValue)` | Number, boolean, or string state. Compiles to piu Behavior instance fields. |
| `useLocalStorage(key, default)` | Like useState but persists to `localStorage` across reboots. |
| `useKVStorage(storeName)` | ECMA-419 binary key-value storage: `get`, `set`, `remove`. |
| `useFileStorage()` | Read/write/delete files on watch storage. |
| `useConfiguration(schema)` | Config page integration: reads settings, opens config page on phone. |
| `useAppSync(schema)` | AppSync key-value synchronization with phone companion. |

#### Data & Networking

| Hook | Description |
|------|------------|
| `useMessage(options)` | Phone→watch data via Alloy Message API. Compiler emits full wiring. |
| `useFetch(url, options?)` | HTTP data loading via `fetch()` / pebbleproxy. |
| `useWebSocket(url)` | Bidirectional WebSocket: `send`, `close`, `lastMessage`, `connected`. |
| `useHTTPClient()` | Low-level HTTP request/response client. |
| `useDataLogging(tag)` | Pebble data logging sessions: create, log, close. |

#### Watch Information

| Hook | Description |
|------|------------|
| `useWatchInfo()` | Watch model, color, firmware version. |
| `useLocale()` | Language, country, 24h time preference. |
| `useDisplayBounds(padding?)` | Screen dimensions with optional safe-area padding. |
| `useContentSize()` | Available content area dimensions. |
| `useUnobstructedArea()` | Visible area accounting for timeline peek. |

#### System & Lifecycle

| Hook | Description |
|------|------------|
| `useApp()` | Access PebbleApp instance from nested components. |
| `useAppFocus(options?)` | App focus/blur event callbacks. |
| `useAppGlance()` | App glance (launcher shortcut) management. |
| `appGlanceTimeUntil(ts, fmt)` | Template builder for countdown subtitles in glance slices. |
| `appGlanceTimeSince(ts, fmt)` | Template builder for "time-since" subtitles in glance slices. |
| `useTimeline()` | Timeline pin creation and management. |
| `useQuietTime()` | Whether quiet time / DND is active. |
| `useLaunchReason()` | Why the app was launched (user, timeline, wakeup). |
| `useLaunchInfo()` | Full launch context: reason, args, deep-link payload. |
| `useExitReason()` | Reads + writes the persisted app exit reason for next launch. |
| `useNotification()` | Display simple system notifications and alerts. |
| `useWakeup()` | Schedule future app wakeup events. |
| `usePreferredResultDuration()` | System preferred result display duration. |
| `useMemoryStats(pollInterval?)` | Live heap usage stats: used, free, largest free block. |
| `useMemoryPressure(handler)` | Subscribe to low-memory pressure callbacks (normal/high/critical). |
| `pebbleLog(level, ...args)` | Structured logging to watch console. |

#### Background Workers

| Hook | Description |
|------|------------|
| `useWorkerLaunch()` | Launch / kill the background worker process from the foreground app. |
| `useWorkerMessage(handler)` | Receive messages sent from the background worker. |
| `useWorkerSender()` | Send messages to the background worker. |

#### Companion & Sports

| Hook | Description |
|------|------------|
| `useSports(options)` | PebbleKit Sports protocol: time, distance, pace, heart-rate updates. |

#### Internationalization

| Hook | Description |
|------|------------|
| `defineTranslations(dict)` | Register translation strings per language/locale at module scope. |
| `useTranslation()` | Returns a `t(key, params?)` function that resolves to the active locale. |

#### Trig & Geometry Helpers

Pure helpers that work both in the compiler and on-device — no allocation, fixed-point trig where possible:

- `polarPoint(centerX, centerY, radius, angle)` — convert polar to cartesian
- `degreesToRadians(deg)`, `radiansToDegrees(rad)`
- `angleBetweenPoints(x1, y1, x2, y2)`
- `sinLookup(angle)`, `cosLookup(angle)`, `atan2Lookup(y, x)` — fixed-point trig matching the C SDK (`TRIG_MAX_ANGLE = 0x10000`)
- `clockIs24HourStyle()`, `clockToTimestamp(...)`, `startOfToday()`

### Configuration Pages

Build phone-side configuration pages declaratively with `react-pebble/config`:

```ts
import { renderConfigPage, ConfigPage, ConfigSection, ConfigColor, ConfigToggle } from 'react-pebble/config';

const page = ConfigPage([
  ConfigSection('Appearance', [
    ConfigColor('bgColor', 'Background', '000000'),
    ConfigToggle('showSeconds', 'Show Seconds', true),
  ]),
]);

const html = renderConfigPage(page);
```

Available builders (full Clay parity):

| Builder | Renders |
|---------|---------|
| `ConfigHeading(label, level?)` | Section/heading text (h1/h2/h3) |
| `ConfigText(key, label, default?)` | Free-text input |
| `ConfigInput(key, label, opts)` | Generic input with `type` (`text`, `email`, `tel`, `number`, `password`, `url`) |
| `ConfigColor(key, label, default?)` | Color picker |
| `ConfigToggle(key, label, default?)` | On/off switch |
| `ConfigSelect(key, label, options, default?)` | Dropdown select |
| `ConfigRadioGroup(key, label, options, default?)` | Radio button group |
| `ConfigCheckboxGroup(key, label, options, defaults?)` | Multi-select checkbox group |
| `ConfigRange(key, label, opts)` | Range slider with min/max/step |
| `ConfigSubmit(label?, color?)` | Custom submit button |
| `ConfigSection(title, items)` | Group of items under a heading |
| `ConfigPage(sections, opts?)` | Top-level page wrapper |
| `renderConfigPage(spec)` | Returns the full HTML string |
| `configPageToDataUri(spec)` | Returns a `data:` URI for `Pebble.openURL()` |

### Fonts

System fonts organized by family:

- **Gothic:** `gothic14`, `gothic14Bold`, `gothic18`, `gothic18Bold`, `gothic24`, `gothic24Bold`, `gothic28`, `gothic28Bold`
- **Bitham:** `bitham30Black`, `bitham42Bold`, `bitham42Light`, `bitham34MediumNumbers`, `bitham42MediumNumbers`
- **Roboto:** `robotoCondensed21`, `roboto21`
- **LECO:** `leco20`, `leco26`, `leco28`, `leco32`, `leco36`, `leco38`, `leco42`
- **Droid:** `droid28`

### Colors

Named palette: `black`, `white`, `red`, `green`, `blue`, `yellow`, `orange`, `cyan`, `magenta`, `clear`, `lightGray`, `darkGray`

## What the compiler detects automatically

The compiler renders your component multiple times with different state values and diffs the output to infer reactive bindings:

| Pattern | Detection method | Compiled output |
|---------|-----------------|-----------------|
| `useTime()` dependent text | Render at two mock times, diff labels | `onTimeChanged` + `pad(d.getHours())` |
| `useState(number)` dependent text | Perturb value +42, diff labels | `this.s0 += 1; this.sl1.string = "" + this.s0` |
| `useState(boolean)` conditional text | Perturb true/false, diff labels | `this.sl0.string = this.s0 ? "ON" : "OFF"` |
| `useState(boolean)` + time text | Perturb boolean, detect time format in result | Elapsed-time tracking: `Date.now() - this._startTime` |
| `useState(boolean)` conditional tree | Perturb true/false, diff tree shape | Two branch Containers with `.visible` toggling |
| `useState(string)` enum branching | Extract values from handler AST, perturb each | N-way `.visible` toggling |
| Skin/background reactivity | Perturb state, diff rect fills | `.skin` swap between pre-declared Skins |
| `useButton` increment/decrement | AST analysis of handler | `PebbleButton({ type: "up", onPush: ... })` |
| `useButton` clamped increment | Detects `Math.min(x+N, max)` / `Math.max(x-N, min)` | Same as increment with clamping |
| `useButton` modular increment | Detects `(x+N) % M` pattern | `this.s0 = (this.s0 + 1) % 3` |
| `useButton` toggle | AST detects `v => !v` pattern | `this.s0 = !this.s0; this.refresh()` |
| `useButton` set string | AST detects `setState('value')` | `this.s0 = "detail"; this.refresh()` |
| `.map()` list rendering | AST detects `.map()` + `.slice()` | Pre-allocated Label slots with scroll behavior |
| Multi-label list items | Detects labelsPerItem > 1, matches property order | Named groups with property-mapped labels |
| Setter→slot mapping | AST parses `const [x, setX] = useState` | Correct `this.s{N}` per setter |
| `useMessage` data loading | AST detects `useMessage({ key, mockData })` | `Message` class + `onReadable` + label updates |
| Phone-side JS generation | Extracts mockData from source AST | `Pebble.sendAppMessage` with mock data |
| Animated positions | Diff element positions between T1/T2, sample 60 keyframes | Keyframe arrays + position updates in `onTimeChanged` |
| Watchface vs watchapp mode | Auto-detects from button usage | Sets `package.json` watchface flag |

## Examples

53 working examples covering all features:

### Watchfaces
| Example | Features |
|---------|----------|
| `watchface` | Digital clock, date, useTime |
| `analog-clock` | Circle markers, time-driven layout |
| `polar-clock` | Polar coordinate clock with arcs |
| `dashboard` | StatusBar, useBattery, useConnection, rounded rects, Column layout |
| `weather` | Circles, multi-section layout |
| `config-watchface` | Watchface with phone configuration page |
| `color-palette` | Full Pebble 64-color palette showcase |

### Interactive Apps
| Example | Features |
|---------|----------|
| `counter` | UP/DOWN/SELECT buttons, useState |
| `toggle` | Boolean toggle, skin reactivity |
| `stopwatch` | Start/stop/reset, elapsed time tracking |
| `settings` | Font size +/-, theme cycling, rounded cards, ActionBar |
| `views` | Two-view branching (SELECT toggles) |
| `multiview` | Three-way string enum navigation |
| `action-menu` | ActionMenu overlay with hierarchical items |
| `number-window` | NumberWindow numeric picker |
| `multi-click` | Multi-click button detection patterns |
| `vibration` | Vibration pattern demos |
| `file-notes` | File storage note-taking app |

### Lists & Navigation
| Example | Features |
|---------|----------|
| `simple-list` | 5 items, 3 visible, scroll |
| `selected-list` | Scroll + highlight + counter |
| `rich-list` | Multi-label items (title + status) |
| `tasks` | List/detail + scroll + highlight + 4-button nav |
| `jira-lite` | Flagship: issues list/detail, priority circles, all features |
| `jira-list` | JIRA issues with useListNavigation |
| `async-list` | useMessage + phone data loading |
| `menu-layer` | Native MenuLayer with sections and headers |
| `simple-menu` | Flat SimpleMenu shorthand |
| `scrollable` | Scrollable container with scroll indicators |
| `window-stack` | Multi-window push/pop navigation |

### Graphics & Drawing
| Example | Features |
|---------|----------|
| `animation` | useAnimation, Easing.bounceEaseOut, keyframe-driven positions |
| `arc` | Arc/ring segment rendering |
| `path` | SVG-style path polygon rendering |
| `canvas-demo` | Imperative Canvas drawing with Poco |
| `image` | Bitmap image loading and display |
| `text-flow` | Multi-line flowing text layout |
| `circles` | Circle rendering showcase |
| `layout-demo` | Column, Row, diagonal lines, stroked circles |
| `round-safe` | Round display safe area insets |
| `nested-cond` | Nested conditional tree rendering |

### Data & Sensors
| Example | Features |
|---------|----------|
| `compass` | useCompass, useAccelerometer, diagonal lines |
| `health` | Health API: steps, sleep, heart rate |
| `health-advanced` | useHealthAlert, useHeartRateMonitor, useHealthHistory |
| `accel-advanced` | useAccelerometerRaw batched samples + useRawClick |
| `gps` | GPS location via phone |
| `transit-tracker` | Transit data with networking and useMessage |
| `sports` | useSports — PebbleKit Sports protocol companion |

### Lifecycle, Workers & System
| Example | Features |
|---------|----------|
| `worker-demo` | Background worker: useWorkerLaunch + useWorkerMessage + useWorkerSender |
| `launch-lifecycle` | useLaunchInfo, useExitReason, deep-link args |
| `app-glance-countdown` | Dynamic AppGlance subtitles with appGlanceTimeUntil/Since |
| `memory-monitor` | useMemoryStats + useMemoryPressure runtime introspection |
| `time-utils` | Wall-time helpers: useFormattedTime('auto'), clockToTimestamp |
| `i18n` | defineTranslations + useTranslation across locales |
| `config-rich` | All Clay config element types: heading, range, radio, checkbox group, etc. |

### Deploy any example

```bash
./scripts/deploy.sh watchface           # compile + build + install + screenshot
./scripts/deploy.sh jira-lite --logs    # with live log streaming
SETTLE_MS=200 ./scripts/deploy.sh async-list  # async data loading
```

## Emulator testing

Full emulator test suite with button press verification:

```bash
./scripts/test-emulator.sh              # test all examples
./scripts/test-emulator.sh counter      # test one example
```

The script deploys each example, takes screenshots, sends button presses via `pebble emu-button`, and screenshots each state transition. Results saved to `/tmp/react-pebble-emu-test/`.

Manual emulator commands:
```bash
pebble emu-button click up              # simulate button press
pebble emu-button click select
pebble emu-tap --direction x+           # simulate accelerometer tap
pebble screenshot /tmp/screenshot.png   # capture the screen
pebble kill                             # stop emulator
```

## Architecture

```
packages/
  react-pebble/              — npm: react-pebble
    src/
      compiler/index.ts      — Programmatic compiler API
      plugin/index.ts        — Vite plugin (pebblePiu) with multi-platform + phone JS generation
      components/index.tsx   — 26 JSX component wrappers (primitives, layout, composites, navigation)
      hooks/index.ts         — 65+ hooks (time, input, sensors, storage, networking, animation, workers, lifecycle, i18n, system)
      config/index.ts        — Declarative config page builder with full Clay element parity
      pebble-dom.ts          — Virtual DOM
      pebble-dom-shim.ts     — DOM adapter for Preact
      pebble-output.ts       — Poco renderer (circles, lines, rounded rects, text wrapping)
      pebble-render.ts       — Mock renderer entry point
      platform.ts            — Screen dimensions (SCREEN.width/height)
      types/moddable.d.ts    — Alloy runtime type declarations (Poco, Battery, Watch)
      index.ts               — Public API
    scripts/
      compile-to-piu.ts      — The compiler: JSX → pebble-dom → piu/rocky/C output
      analyzer.ts            — AST analysis and reactivity pattern detection
      emit-piu.ts            — piu scene-graph code generation
      emit-rocky.ts          — Rocky.js code generation
      emit-c.ts              — C SDK code generation
      emit-pkjs.ts           — PebbleKit companion JS generation
      deploy.sh              — One-command deploy to emulator
      test-emulator.sh       — Full emulator test suite with button verification
    examples/                — 53 working examples
    test/
      snapshot-test.ts       — Snapshot test runner
      snapshots/             — 52 piu snapshot tests
      snapshots-rocky/       — 42 Rocky.js snapshot tests
      snapshots-c/           — 42 C code generation snapshot tests
  create-pebble-app/         — npm: create-pebble-app
    index.js                 — Project scaffolder CLI
```

## Limitations

- **Emery/gabbro only.** Alloy projects target emery (200x228) and gabbro platforms. Basalt/chalk/aplite are not supported by Alloy.
- **~3 KB runtime heap.** Alloy mods get minimal heap. No VDOM framework runs on-watch — all reactivity is compiled away.
- **No nested conditionals.** `if/else` inside `if/else` is partially handled but may not compile correctly in all cases.
- **useLocalStorage not compiler-tracked.** The hook works at Preact runtime, but the piu compiler can't track setter→slot mappings through the wrapper. Use `useState` for state that buttons modify in compiled apps.
- **Animation is 1fps in compiled mode.** The keyframe sampling produces per-second updates. Smooth animation requires piu Timeline (not yet emitted).
- **Button API is best-guess.** `PebbleButton` from `"pebble/button"` works for click events. Long-press and multi-button combos are untested.

## Key discovery: why React can't run on Pebble

During development we tried React, then Preact, directly on the Alloy runtime. Both failed:

- **React + react-reconciler**: 192 KB XS bytecode. Emery has 128 KB RAM. XS panics at module load.
- **Preact**: 39 KB bytecode fits in resources, but XS slot allocation fails at module init — the mod's chunk heap (~3 KB) can't hold Preact's VDOM tree even for a simple render.
- **Direct Poco**: Works perfectly (the "hello world" probe). 10 KB bytecode, zero allocation pressure.
- **piu (Moddable's scene-graph)**: Pre-loaded in firmware, costs ~0 bytes of mod heap. This is what the compiled output uses.

The compile-time approach is the only way to have React-like DX while fitting in Alloy's memory budget.

## License

MIT
