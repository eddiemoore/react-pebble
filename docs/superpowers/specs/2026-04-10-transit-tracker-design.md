# Transit Tracker — Design Spec

## Purpose

A real-world Pebble app that shows next bus/train departures with live countdowns. Designed to stress-test the full react-pebble stack: useMessage (phone data), useTime (live countdown), useButton (navigation), list/detail views, and the compile-to-piu pipeline.

## Views

### List View
- StatusBar at top (time, separator)
- Header: stop name + route count ("Central Station  3/5")
- 3 visible route items, scrollable with UP/DOWN
- Each item: colored circle badge (route color), route name, countdown ("2 min")
- Selected item highlighted with darkGray background
- SELECT opens detail view

### Detail View
- Blue header with route name + direction
- Next 3 departures listed vertically ("2 min", "14 min", "28 min")
- Crowdedness indicator: circle (green/yellow/red) + label
- "BACK to return" help text at bottom
- BACK returns to list view

## Data

### Shape
```ts
interface Route {
  id: string;         // "F", "L", "N"
  name: string;       // "F-Line"
  color: string;      // "red", "blue", "green"
  direction: string;  // "Westbound to Beach"
  arrivals: number[]; // minutes until arrival: [2, 14, 28]
  crowd: string;      // "low" | "moderate" | "high"
}
```

### Mock Data (5 routes)
```ts
const MOCK_ROUTES: Route[] = [
  { id: 'F', name: 'F-Line', color: 'red', direction: 'Westbound to Beach', arrivals: [2, 14, 28], crowd: 'moderate' },
  { id: 'L', name: 'L-Train', color: 'blue', direction: 'Southbound to Airport', arrivals: [5, 20, 35], crowd: 'low' },
  { id: 'N', name: 'N-Bus', color: 'green', direction: 'Northbound to Park', arrivals: [1, 12, 24], crowd: 'high' },
  { id: '7', name: '7-Express', color: 'orange', direction: 'Eastbound to Downtown', arrivals: [8, 22, 40], crowd: 'low' },
  { id: 'K', name: 'K-Rail', color: 'cyan', direction: 'Westbound to Coast', arrivals: [3, 18, 30], crowd: 'moderate' },
];
```

### Data Flow
1. Phone JS (`pkjs/index.js`) sends mock data via `Pebble.sendAppMessage({ departures: JSON.stringify(routes) })`
2. Watch receives via `useMessage({ key: 'departures', mockData: MOCK_ROUTES })`
3. Compiler emits `Message` class + `onReadable` handler
4. Phone JS structured so swapping mock data for a real API fetch is a one-line change

## Hooks Used

| Hook | Purpose |
|------|---------|
| `useMessage` | Load route data from phone |
| `useTime(60000)` | Tick every minute to decrement arrival countdowns |
| `useState(number)` | Selected route index (scroll position) |
| `useState(string)` | View state: 'list' or 'detail' |
| `useButton('up')` | Scroll up in list |
| `useButton('down')` | Scroll down in list |
| `useButton('select')` | Open detail view |
| `useButton('back')` | Return to list view |

## Components Used

| Component | Usage |
|-----------|-------|
| `StatusBar` | Top bar with time |
| `Rect` (borderRadius) | Rounded cards for list items |
| `Circle` | Route color badge, crowdedness indicator |
| `Text` | Route names, countdown, direction, help text |
| `Group` | Item containers, view containers |
| `Column` | Detail view layout |

## Live Countdown

Arrivals tick down using `useTime(60000)`:
- On each minute tick, the displayed "X min" decreases by 1
- When an arrival reaches 0, display "Now" 
- When negative, display "Gone"
- The compiler detects this as time-dependent text and emits `onTimeChanged`

Implementation: store arrival times as minutes-from-now at data receipt time, compute display value as `arrival - minutesElapsed`.

## Layout (200x228 pixels)

### List View
```
 0 ┌──────────────────────┐
16 │ StatusBar    15:42    │
   ├──────────────────────┤
18 │ Central Stn    1/5   │ header
   ├──────────────────────┤
44 │ (F) F-Line    2 min  │ item 0 (highlighted)
   ├──────────────────────┤
104│ (L) L-Train   5 min  │ item 1
   ├──────────────────────┤
164│ (N) N-Bus     1 min  │ item 2
228└──────────────────────┘
```

### Detail View
```
 0 ┌──────────────────────┐
   │ F-LINE               │ blue bg
28 │ Westbound to Beach   │
   ├──────────────────────┤
50 │ Next departures:     │
70 │   2 min              │
90 │   14 min             │
110│   28 min             │
   ├──────────────────────┤
140│ (o) Moderate          │ yellow circle
   │                      │
   │                      │
210│ BACK to return       │
228└──────────────────────┘
```

## File

Single example file: `examples/transit-tracker.tsx`

## Phone-Side JS

The compiler plugin auto-generates phone JS from mockData. The generated code sends mock data 2 seconds after ready. Structure for easy API swap:

```js
// To use a real API, replace the data variable with a fetch:
// var data = await fetch('https://api.transit.example/departures?stop=central').then(r => r.json());
var data = [/* mock routes */];
Pebble.sendAppMessage({ "departures": JSON.stringify(data) });
```

## Verification

1. `npm test` — snapshot test passes
2. `SETTLE_MS=200 EXAMPLE=transit-tracker npx tsx scripts/compile-to-piu.ts` — compiles without errors, emits Message wiring
3. `./scripts/deploy.sh transit-tracker` — renders on emulator with mock data
4. Button test: UP/DOWN scrolls list, SELECT opens detail, BACK returns
5. Time tick: arrival minutes decrement every 60 seconds
