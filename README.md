# react-pebble

A React renderer for Pebble smartwatch apps, targeting the Pebble Alloy/XS JavaScript engine.

> **Status**: Experimental / proof of concept

## Architecture

Modeled after [Ink](https://github.com/vadimdemedes/ink) (React for the terminal), react-pebble uses a three-layer architecture:

```
┌─────────────────────────────────────────────┐
│  Your React Components                      │
│  <App> → <WatchFace> → <Text>, <Rect>, etc  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Layer 1: Reconciler  (pebble-reconciler.js)│
│  react-reconciler host config               │
│  Maps React tree ops → virtual DOM          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Layer 2: Virtual DOM  (pebble-dom.js)      │
│  Lightweight node tree: type, props,        │
│  children. No Yoga — absolute positioning.  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Layer 3: Output  (pebble-output.js)        │
│  Tree walker → Pebble Graphics API calls    │
│  fillRect, drawText, fillCircle, etc.       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Pebble Window                              │
│  onDraw(ctx, bounds) → Graphics context     │
└─────────────────────────────────────────────┘
```

## Quick Start

```jsx
import React, { useState } from 'react';
import { render, Text, Rect, Group } from 'react-pebble';
import { useButton, useTime } from 'react-pebble/hooks';

function WatchFace() {
  const time = useTime();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  return (
    <Group>
      <Rect x={0} y={0} w={144} h={168} fill="black" />
      <Text x={0} y={50} w={144} h={50}
            font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>
    </Group>
  );
}

render(<WatchFace />);
```

## Components

| Component     | Element Type     | Description                              |
|---------------|-----------------|------------------------------------------|
| `<Rect>`      | `pbl-rect`      | Rectangle (fill, stroke, or both)        |
| `<Circle>`    | `pbl-circle`    | Circle (fill, stroke, or both)           |
| `<Text>`      | `pbl-text`      | Text with Pebble font                    |
| `<Line>`      | `pbl-line`      | Line between two points                  |
| `<Image>`     | `pbl-image`     | Bitmap image                             |
| `<Group>`     | `pbl-group`     | Container with x/y offset               |
| `<StatusBar>` | `pbl-statusbar` | Pebble status bar                        |
| `<ActionBar>` | `pbl-actionbar` | Right-side action bar with icons         |
| `<Card>`      | composite       | Title bar + body text pattern            |

### Rect Props
`x`, `y`, `w` (or `width`), `h` (or `height`), `fill`, `stroke`, `strokeWidth`

### Circle Props
`x`, `y`, `r` (or `radius`), `fill`, `stroke`, `strokeWidth`

### Text Props
`x`, `y`, `w`, `h`, `font`, `color`, `align` (`'left'` | `'center'` | `'right'`)

**Available fonts**: `gothic14`, `gothic14Bold`, `gothic18`, `gothic18Bold`, `gothic24`, `gothic24Bold`, `gothic28`, `gothic28Bold`, `bitham30Black`, `bitham42Bold`, `bitham42Light`, `bitham34MediumNumbers`, `leco20`, `leco26`, `leco28`, `leco32`, `leco36`, `leco38`, `roboto21`, `droid28`

## Hooks

### `useButton(button, handler)`
Subscribe to hardware button presses. Buttons: `'up'`, `'down'`, `'select'`, `'back'`.

### `useTime(intervalMs?)`
Returns a `Date` that updates every `intervalMs` (default: 1000).

### `useFormattedTime(format?)`
Returns a formatted time string. Format tokens: `HH`, `hh`, `mm`, `ss`, `a`.

### `useBattery()`
Returns `{ level, charging, plugged }`.

### `useConnection()`
Returns `boolean` — Bluetooth connection state.

### `useAccelerometer(options?)`
Returns `{ x, y, z }` accelerometer data.

### `useAppMessage()`
Returns `{ send, lastMessage }` for phone↔watch communication.

### `useInterval(callback, delay)`
Runs a callback on an interval (null delay to pause).

### `useListNavigation(items, options?)`
Returns `{ index, item, next, prev }` with up/down buttons wired.

## How It Works

The key insight from studying Ink's source is that `resetAfterCommit` in the reconciler is the bridge between React and the platform. When React finishes a batch of updates:

1. The reconciler calls `resetAfterCommit(rootNode)`
2. We call `window.markDirty()` to request a Pebble redraw
3. Pebble fires `onDraw(ctx, bounds)`
4. We walk our virtual DOM tree and issue `ctx.fillRect()`, `ctx.drawText()`, etc.

This means React handles all the state management, diffing, and update batching — we just translate the final tree to draw calls.

## Testing

The renderer includes a mock mode that works in Node.js (when `Pebble` global isn't available). The mock captures all draw calls in a log you can inspect:

```javascript
const app = render(<MyComponent />);
const calls = app._window.getDrawLog();
// [{ op: 'fillRect', x: 0, y: 0, w: 144, h: 168 }, ...]
```

## Differences from Ink

| Ink (Terminal)               | react-pebble (Pebble)           |
|------------------------------|----------------------------------|
| Yoga flexbox layout          | Absolute positioning (x, y, w, h)|
| Character grid output        | Graphics context draw calls      |
| ANSI escape codes            | Pebble color constants           |
| stdin for input              | Hardware button events           |
| stdout for output            | Window.onDraw callback           |
| `<Box>`, `<Text>`            | `<Rect>`, `<Text>`, `<Circle>`  |

## Open Questions

- **Can `react-reconciler` run on XS?** The package is ~20KB minified. XS is spec-compliant but memory-constrained. May need a stripped-down mini-reconciler.
- **Bundle size budget**: Pebble apps have ~64KB RAM. The reconciler + virtual DOM + components need to fit comfortably.
- **JSX transform**: Need a build step (esbuild/Rollup) to compile JSX to `createElement` calls before deploying to Pebble.

## License

MIT
