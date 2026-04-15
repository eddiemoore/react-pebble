# `useTime` Native Tick Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Alloy/piu `app.interval = 1000` redraw loop with native `watch.addEventListener('<granularity>change', …)`, extend granularity detection (`second`/`minute`/`day` auto-detected; `hour` via explicit override) across all three compile targets, and add an optional `useTime(granularity)` parameter.

**Architecture:** One new IR field (`timeGranularity`), one analyzer extension (AST-visit `useTime` calls + derive granularity from existing `TimeFormat` tokens), three emitter updates, and one hook-runtime signature extension. Back-compat preserved for `useTime()` and `useTime(1000)` forms.

**Tech Stack:** TypeScript compiler/emitters, tsx script runner, the repo's existing snapshot harness at `test/snapshot-test.ts`. No test runner dependency — unit tests are tsx scripts that `assert()` and `process.exit(1)` on failure.

**Spec:** `docs/superpowers/specs/2026-04-15-usetime-native-ticks-design.md`.

---

## Files

- **Modify** `packages/react-pebble/src/hooks/useTime.ts` — signature + resolveGranularity helper.
- **Modify** `packages/react-pebble/src/hooks/index.ts` — re-export `TimeGranularity`.
- **Modify** `packages/react-pebble/scripts/compiler-ir.ts` — add `timeGranularity` field + `TimeGranularity` type.
- **Modify** `packages/react-pebble/scripts/analyze.ts` — AST-visit `useTime(...)` calls for explicit arg; compute detected granularity from existing `timeDeps` format tokens; attach to IR.
- **Modify** `packages/react-pebble/scripts/emit-piu.ts:618-621` — swap `app.interval`/`app.start()` for `watch.addEventListener`. Also emit matching `onUndisplaying`.
- **Modify** `packages/react-pebble/scripts/emit-rocky.ts:475-477` — generalize event picker from 2 to 4 events.
- **Modify** `packages/react-pebble/scripts/emit-c.ts:1382` — generalize unit picker from 2 to 4 units.
- **Create** `packages/react-pebble/test/time-granularity.test.ts` — unit tests for `resolveGranularity` + emitter outputs on fixture IRs.
- **Update (snapshot regen)** `packages/react-pebble/test/snapshots/*.js` — Alloy snapshots touching `useTime` will drift.
- **Update (snapshot regen)** `packages/react-pebble/test/snapshots-rocky/*.js` + `snapshots-c/*.c` — likely minimal drift (only when granularity moves from `minute` to `day`).

---

## Task 1: Add `TimeGranularity` type + IR field

**Files:**
- Modify: `packages/react-pebble/scripts/compiler-ir.ts`

- [ ] **Step 1: Add `TimeGranularity` type and IR field**

In `packages/react-pebble/scripts/compiler-ir.ts`, after the existing `TimeFormat` type (line 121), add:

```ts
export type TimeGranularity = 'second' | 'minute' | 'hour' | 'day';
```

Then, inside the `CompilerIR` interface (after `hasTimeDeps`, around line 271), add a new field. Find this block:

```ts
  /** Convenience flags */
  hasButtons: boolean;
  hasTimeDeps: boolean;
```

and extend it to:

```ts
  /** Convenience flags */
  hasButtons: boolean;
  hasTimeDeps: boolean;
  /**
   * Tick cadence for this app. `null` when `hasTimeDeps` is false.
   * Explicit `useTime('minute')` overrides detection.
   */
  timeGranularity: TimeGranularity | null;
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: 1–2 errors pointing at the `analyze.ts` IR constructor — the analyzer builds a `CompilerIR` literal and we haven't set the new field yet. Those errors vanish in Task 2.

- [ ] **Step 3: Commit**

```bash
cd packages/react-pebble
git add scripts/compiler-ir.ts
git commit -m "refactor: add TimeGranularity type and CompilerIR.timeGranularity field"
```

---

## Task 2: Analyzer — detect granularity from format tokens + explicit arg

**Files:**
- Modify: `packages/react-pebble/scripts/analyze.ts` (around line 1821 where `hasTimeDeps` is computed; around line 1934 where the IR literal is returned)

- [ ] **Step 1: Inspect current timeDeps extraction**

Run: `grep -n "timeDeps" packages/react-pebble/scripts/analyze.ts | head -20`
Goal: locate the `Map<number, TimeFormat>` construction and the point where the IR literal is returned.

- [ ] **Step 2: Add `detectGranularity` helper near the top of `analyze.ts` imports**

Near the top of `packages/react-pebble/scripts/analyze.ts`, after the existing imports, add:

```ts
import type { TimeFormat, TimeGranularity } from './compiler-ir.js';

function detectGranularity(
  timeDeps: Map<number, TimeFormat>,
  hasAnimatedElements: boolean,
  hasTimeReactiveGraphics: boolean,
): TimeGranularity | null {
  if (timeDeps.size === 0 && !hasAnimatedElements && !hasTimeReactiveGraphics) {
    return null;
  }
  if (hasAnimatedElements || hasTimeReactiveGraphics) return 'second';
  const formats = [...timeDeps.values()];
  if (formats.some(f => f === 'SS' || f === 'MMSS')) return 'second';
  if (formats.some(f => f === 'HHMM')) return 'minute';
  if (formats.every(f => f === 'DATE')) return 'day';
  // Fallback if we saw only unknown formats
  return 'minute';
}
```

If `TimeFormat` or `TimeGranularity` is already imported on an existing line, merge rather than adding a duplicate import.

- [ ] **Step 3: Add `detectExplicitGranularity` helper**

Immediately below `detectGranularity`, add an AST-visit helper. The analyzer already parses the component source via ts-morph / TypeScript compiler API — inspect the existing useHooks-discovery code at `analyze.ts:1821` for the exact AST library used and mirror its visitor pattern.

Conceptually the helper inspects every `useTime(...)` CallExpression and returns the first literal argument. String form: `'second' | 'minute' | 'hour' | 'day'`. Numeric form: map via `resolveNumeric` thresholds. Return `null` when no explicit arg.

Minimal shape (adapt the AST walker to whatever library analyze.ts is already using):

```ts
function detectExplicitGranularity(sourceText: string): TimeGranularity | null {
  // Inline regex fallback — covers the 95% case without adding a new AST walker.
  // Matches useTime('second' | "minute" | …) and useTime(<numericLiteral>).
  // Multiple calls: the FIRST explicit granularity wins (components almost never
  // call useTime twice with different granularities).
  const strMatch = /\buseTime\s*\(\s*['"](second|minute|hour|day)['"]\s*\)/.exec(sourceText);
  if (strMatch?.[1]) return strMatch[1] as TimeGranularity;
  const numMatch = /\buseTime\s*\(\s*(\d+)\s*\)/.exec(sourceText);
  if (numMatch?.[1]) {
    const n = Number(numMatch[1]);
    if (n <= 1000) return 'second';
    if (n <= 60_000) return 'minute';
    if (n <= 3_600_000) return 'hour';
    return 'day';
  }
  return null;
}
```

Regex rather than AST walker: rest of `analyze.ts` already mixes regex and AST for hook detection (see `hooksUsed` collection in `compile-to-piu.ts:57-62`). Matches the project's style.

- [ ] **Step 4: Wire into the IR construction**

Find the IR literal construction at `packages/react-pebble/scripts/analyze.ts:~1934`. It currently has `hasTimeDeps,` among the returned fields. Extend to also compute and return `timeGranularity`:

```ts
// … existing variables in scope:
//   const hasTimeDeps = dynamicLabels.size > 0 || stateNeedsTime || hasAnimatedElements || hasTimeReactiveGraphics;
//   const timeDeps: Map<number, TimeFormat> = …;
//   const entrySrc: string = …; // the source text used for useHooks detection; if
//                               // the analyzer doesn't already hold it, read it
//                               // here via readFileSync(entryPath, 'utf-8').

const detectedGranularity = detectGranularity(timeDeps, hasAnimatedElements, hasTimeReactiveGraphics.length > 0);
const explicitGranularity = detectExplicitGranularity(entrySrc);
const timeGranularity = hasTimeDeps ? (explicitGranularity ?? detectedGranularity ?? 'minute') : null;
```

And add `timeGranularity,` to the returned IR literal.

If `entrySrc` is not already a local variable at the IR-construction site, add at the top of the `analyze()` function body:

```ts
import { readFileSync } from 'node:fs';
// ...
const entrySrc = readFileSync(entryPath, 'utf-8');
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd packages/react-pebble
git add scripts/analyze.ts
git commit -m "feat(analyzer): derive ir.timeGranularity from formats + explicit useTime arg"
```

---

## Task 3: Failing unit test for `resolveGranularity` + emitter behavior

**Files:**
- Create: `packages/react-pebble/test/time-granularity.test.ts`

- [ ] **Step 1: Create the test file**

Create `packages/react-pebble/test/time-granularity.test.ts` with the following content:

```ts
/**
 * test/time-granularity.test.ts — useTime native-tick surface.
 *
 * Covers:
 *   - runtime resolveGranularity(arg) mapping
 *   - emit-piu uses watch.addEventListener (not app.interval)
 *   - emit-rocky picks the right of 4 events
 *   - emit-c picks the right of 4 units
 *
 * Usage: npx tsx test/time-granularity.test.ts
 */

import { resolveGranularity } from '../src/hooks/useTime.js';
import { emitPiu } from '../scripts/emit-piu.js';
import { emitRocky } from '../scripts/emit-rocky.js';
import { emitC } from '../scripts/emit-c.js';
import type { CompilerIR, TimeGranularity } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------
// Runtime: resolveGranularity
// -----------------------------------------------------------------------
assert(resolveGranularity('minute') === 'minute', "resolveGranularity('minute')");
assert(resolveGranularity('second') === 'second', "resolveGranularity('second')");
assert(resolveGranularity('hour') === 'hour', "resolveGranularity('hour')");
assert(resolveGranularity('day') === 'day', "resolveGranularity('day')");

assert(resolveGranularity(1000) === 'second', 'resolveGranularity(1000)');
assert(resolveGranularity(500) === 'second', 'resolveGranularity(500)');
assert(resolveGranularity(60_000) === 'minute', 'resolveGranularity(60_000)');
assert(resolveGranularity(3_600_000) === 'hour', 'resolveGranularity(3_600_000)');
assert(resolveGranularity(86_400_000) === 'day', 'resolveGranularity(86_400_000)');

assert(resolveGranularity(undefined) === 'second', 'resolveGranularity(undefined) defaults to second');

// -----------------------------------------------------------------------
// Emitter fixtures
// -----------------------------------------------------------------------
function makeIR(granularity: TimeGranularity): CompilerIR {
  return {
    tree: [{ type: 'root', x: 0, y: 0, w: 144, h: 168, children: [
      {
        type: 'text', x: 0, y: 0, w: 144, h: 24,
        text: '', font: 'gothic24', color: '#ffffff',
        isTimeDynamic: true, labelIndex: 0, name: 'tl0',
      },
    ] }],
    platform: { name: 'basalt', width: 144, height: 168 },
    stateSlots: [],
    timeDeps: new Map([[0, granularity === 'day' ? 'DATE' : granularity === 'second' ? 'SS' : 'HHMM']]),
    stateDeps: new Map(),
    skinDeps: new Map(),
    branches: new Map(),
    conditionalChildren: [],
    listInfo: null,
    listSlotLabels: new Set(),
    timeReactiveGraphics: [],
    animatedElements: [],
    messageInfo: null,
    configInfo: null,
    hasButtons: false,
    hasTimeDeps: true,
    hasStateDeps: false,
    hasBranches: false,
    hasConditionals: false,
    hasSkinDeps: false,
    hasList: false,
    hasAnimatedElements: false,
    hasImages: false,
    imageResources: [],
    timeGranularity: granularity,
  } as unknown as CompilerIR;
}

// -----------------------------------------------------------------------
// emit-piu: minute granularity uses watch.addEventListener('minutechange')
// -----------------------------------------------------------------------
{
  const piuMin = emitPiu(makeIR('minute'), 'fixture');
  assert(
    piuMin.includes("watch.addEventListener('minutechange'"),
    'Alloy minute must emit watch.addEventListener(\'minutechange\')',
  );
  assert(
    !piuMin.includes('app.interval = 1000'),
    'Alloy must not emit app.interval = 1000 anymore',
  );
  assert(
    !piuMin.includes('app.start()'),
    'Alloy must not emit app.start() for time ticks',
  );
}

// Second granularity uses secondchange
{
  const piuSec = emitPiu(makeIR('second'), 'fixture');
  assert(
    piuSec.includes("watch.addEventListener('secondchange'"),
    'Alloy second must emit watch.addEventListener(\'secondchange\')',
  );
}

// Day granularity uses daychange
{
  const piuDay = emitPiu(makeIR('day'), 'fixture');
  assert(
    piuDay.includes("watch.addEventListener('daychange'"),
    'Alloy day must emit watch.addEventListener(\'daychange\')',
  );
}

// -----------------------------------------------------------------------
// emit-rocky
// -----------------------------------------------------------------------
assert(emitRocky(makeIR('second')).includes("rocky.on('secondchange'"), 'Rocky second');
assert(emitRocky(makeIR('minute')).includes("rocky.on('minutechange'"), 'Rocky minute');
assert(emitRocky(makeIR('hour')).includes("rocky.on('hourchange'"), 'Rocky hour');
assert(emitRocky(makeIR('day')).includes("rocky.on('daychange'"), 'Rocky day');

// -----------------------------------------------------------------------
// emit-c
// -----------------------------------------------------------------------
assert(emitC(makeIR('second')).includes('tick_timer_service_subscribe(SECOND_UNIT'), 'C second');
assert(emitC(makeIR('minute')).includes('tick_timer_service_subscribe(MINUTE_UNIT'), 'C minute');
assert(emitC(makeIR('hour')).includes('tick_timer_service_subscribe(HOUR_UNIT'), 'C hour');
assert(emitC(makeIR('day')).includes('tick_timer_service_subscribe(DAY_UNIT'), 'C day');

console.log('time-granularity.test.ts: PASS');
```

- [ ] **Step 2: Run the test — expect it to fail**

Run: `cd packages/react-pebble && npx tsx test/time-granularity.test.ts 2>&1`
Expected: fails with either a missing-export error for `resolveGranularity` or a `FAIL: ...` assertion. Either is a valid "red" for TDD.

- [ ] **Step 3: Commit the failing test**

```bash
cd packages/react-pebble
git add test/time-granularity.test.ts
git commit -m "test: add failing time-granularity tests for resolveGranularity + emitters"
```

---

## Task 4: Hook runtime — signature + `resolveGranularity`

**Files:**
- Modify: `packages/react-pebble/src/hooks/useTime.ts`
- Modify: `packages/react-pebble/src/hooks/index.ts`

- [ ] **Step 1: Rewrite `useTime.ts`**

Replace the current `useTime` + `clockIs24HourStyle` preamble in `packages/react-pebble/src/hooks/useTime.ts` with the version below. Keep the `clockIs24HourStyle` / `startOfToday` / `clockToTimestamp` functions from the current file intact (they're unchanged; just copy them back after the new `useTime` block).

```ts
/**
 * Time hooks
 *
 * On Alloy, `watch.addEventListener('secondchange'|'minutechange'|'hourchange'|
 * 'daychange', fn)` is the canonical tick source — it fires exactly on
 * boundaries and is far more battery-efficient than setInterval. In Node mock
 * mode we fall back to setInterval, or (for 'day') a setTimeout-to-next-
 * midnight chain.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export type TimeGranularity = 'second' | 'minute' | 'hour' | 'day';

/**
 * Map the `useTime` argument to a concrete granularity.
 *  - `undefined` → 'second' (runtime mock default)
 *  - `TimeGranularity` string → itself
 *  - `number` (legacy intervalMs): ≤1000 → 'second', ≤60_000 → 'minute',
 *    ≤3_600_000 → 'hour', else 'day'.
 */
export function resolveGranularity(arg?: TimeGranularity | number): TimeGranularity {
  if (arg === undefined) return 'second';
  if (typeof arg === 'string') return arg;
  if (arg <= 1000) return 'second';
  if (arg <= 60_000) return 'minute';
  if (arg <= 3_600_000) return 'hour';
  return 'day';
}

function granularityToEvent(g: TimeGranularity): 'secondchange' | 'minutechange' | 'hourchange' | 'daychange' {
  return `${g}change` as 'secondchange' | 'minutechange' | 'hourchange' | 'daychange';
}

function granularityToIntervalMs(g: TimeGranularity): number {
  switch (g) {
    case 'second': return 1000;
    case 'minute': return 60_000;
    case 'hour':   return 3_600_000;
    case 'day':    return 86_400_000; // overridden for 'day' via next-midnight scheduling
  }
}

function msToNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function useTime(granularity?: TimeGranularity | number): Date {
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const g = resolveGranularity(granularity);
    const tick = () => setTime(new Date());

    // On Alloy: use watch tick events for battery efficiency
    if (typeof watch !== 'undefined' && watch) {
      const event = granularityToEvent(g);
      watch.addEventListener(event, tick);
      return () => watch!.removeEventListener(event, tick);
    }

    // Mock mode — 'day' uses setTimeout chain so midnight boundaries don't
    // drift over long runs.
    if (g === 'day') {
      let id: ReturnType<typeof setTimeout>;
      const schedule = () => {
        id = setTimeout(() => { tick(); schedule(); }, msToNextLocalMidnight());
      };
      schedule();
      return () => clearTimeout(id);
    }

    const id = setInterval(tick, granularityToIntervalMs(g));
    return () => clearInterval(id);
  }, [granularity]);

  return time;
}
```

Then re-append the **existing unchanged** `clockIs24HourStyle` / `startOfToday` / `clockToTimestamp` exports verbatim from the prior file content.

- [ ] **Step 2: Re-export `TimeGranularity` from the hooks barrel**

Check `packages/react-pebble/src/hooks/index.ts` for the current export of `useTime`. Find the line:

```ts
export { useTime, clockIs24HourStyle, startOfToday, clockToTimestamp } from './useTime.js';
```

(or similar — match whatever form is there) and extend it to also re-export `resolveGranularity` and the type:

```ts
export { useTime, resolveGranularity, clockIs24HourStyle, startOfToday, clockToTimestamp } from './useTime.js';
export type { TimeGranularity } from './useTime.js';
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd packages/react-pebble
git add src/hooks/useTime.ts src/hooks/index.ts
git commit -m "feat(useTime): accept TimeGranularity | number; native tick events on Alloy"
```

---

## Task 5: emit-rocky — 4-way event picker

**Files:**
- Modify: `packages/react-pebble/scripts/emit-rocky.ts:475-478`

- [ ] **Step 1: Replace the event-picker block**

Find the block around line 475:

```ts
    // Use secondchange for second-level precision, minutechange for minute-level
    const hasSeconds = [...ir.timeDeps.values()].some(fmt => fmt === 'SS' || fmt === 'MMSS') || ir.hasAnimatedElements;
    const event = hasSeconds ? 'secondchange' : 'minutechange';
```

Replace with:

```ts
    // Pick the coarsest tick event that still captures the app's time deps.
    // ir.timeGranularity is authoritative (analyzer honors explicit useTime(arg)).
    const event = `${ir.timeGranularity ?? 'minute'}change`;
```

- [ ] **Step 2: Run the unit test**

Run: `cd packages/react-pebble && npx tsx test/time-granularity.test.ts 2>&1`
Expected: Rocky assertions now pass. Alloy & C still fail. One step forward.

- [ ] **Step 3: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-rocky.ts
git commit -m "feat(rocky): emit 4-way time-tick event from ir.timeGranularity"
```

---

## Task 6: emit-c — 4-way unit picker

**Files:**
- Modify: `packages/react-pebble/scripts/emit-c.ts:1382-1383`

- [ ] **Step 1: Replace the unit-picker block**

Find the block around line 1377-1383:

```ts
  if (needsTick) {
    // If there's a showSeconds config key, always use SECOND_UNIT since user might enable it
    const hasShowSecondsConfig = hasConfig && ir.configInfo!.keys.some(
      k => k.type === 'boolean' && k.key.toLowerCase().includes('second')
    );
    const unit = (hasSeconds || hasShowSecondsConfig) ? 'SECOND_UNIT' : 'MINUTE_UNIT';
    lines.push(`  tick_timer_service_subscribe(${unit}, tick_handler);`);
  }
```

Replace with:

```ts
  if (needsTick) {
    // showSeconds config key forces SECOND_UNIT regardless of detected granularity
    const hasShowSecondsConfig = hasConfig && ir.configInfo!.keys.some(
      k => k.type === 'boolean' && k.key.toLowerCase().includes('second')
    );
    const granularity = hasShowSecondsConfig ? 'second' : (ir.timeGranularity ?? 'minute');
    const unit = `${granularity.toUpperCase()}_UNIT`;
    lines.push(`  tick_timer_service_subscribe(${unit}, tick_handler);`);
  }
```

Note: the existing `hasSeconds` local above this block becomes unused after this change. If it's not used elsewhere in the file (grep to confirm), delete that line too.

- [ ] **Step 2: Confirm `hasSeconds` cleanup**

Run: `grep -n "hasSeconds" packages/react-pebble/scripts/emit-c.ts`
Expected: possibly used elsewhere (e.g. line 391). If so, leave it; otherwise delete the unused binding to keep lint clean.

- [ ] **Step 3: Run the unit test**

Run: `cd packages/react-pebble && npx tsx test/time-granularity.test.ts 2>&1`
Expected: Rocky + C assertions pass; Alloy still fails. Closing in.

- [ ] **Step 4: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-c.ts
git commit -m "feat(c): emit 4-way tick_timer unit from ir.timeGranularity"
```

---

## Task 7: emit-piu — watch.addEventListener replaces app.interval

**Files:**
- Modify: `packages/react-pebble/scripts/emit-piu.ts:618-621` (`onDisplaying` body)
- Modify: `packages/react-pebble/scripts/emit-piu.ts:~691` (after `onTimeChanged`, add `onUndisplaying` if missing)

- [ ] **Step 1: Replace the `onDisplaying` tick-registration lines**

Find the block at `emit-piu.ts:618-621`:

```ts
    if (ir.hasTimeDeps) {
      lines.push('    app.interval = 1000;');
      lines.push('    app.start();');
    }
```

Replace with:

```ts
    if (ir.hasTimeDeps) {
      const g = ir.timeGranularity ?? 'minute';
      // Bind listener once per behavior instance; store on `this` so
      // onUndisplaying can removeEventListener with the exact same reference.
      lines.push(`    this._tick = () => this.onTimeChanged();`);
      lines.push(`    watch.addEventListener('${g}change', this._tick);`);
    }
```

- [ ] **Step 2: Add `onUndisplaying` handler for removal**

Find the `onTimeChanged` block at `emit-piu.ts:686-691`:

```ts
    // onTimeChanged
    if (ir.hasTimeDeps) {
      lines.push('  onTimeChanged() {');
      lines.push('    this.refresh();');
      lines.push('  }');
    }
```

Immediately after it, add:

```ts
    // onUndisplaying — remove the watch listener so we don't leak across
    // Application rebuilds (mostly a defensive hook; watchface Applications
    // are long-lived in practice).
    if (ir.hasTimeDeps) {
      const g = ir.timeGranularity ?? 'minute';
      lines.push('  onUndisplaying(app) {');
      lines.push(`    if (this._tick) watch.removeEventListener('${g}change', this._tick);`);
      lines.push('  }');
    }
```

- [ ] **Step 3: Run the unit test — should fully pass now**

Run: `cd packages/react-pebble && npx tsx test/time-granularity.test.ts 2>&1; echo "exit=$?"`
Expected:

```
time-granularity.test.ts: PASS
exit=0
```

- [ ] **Step 4: Regenerate Alloy snapshots**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --update 2>&1 | tail -20`
Expected: many Alloy snapshots marked "updated" (but most actual file content unchanged — see Task 1 of the prior Rocky branch for the same pattern; git diff is the source of truth).

- [ ] **Step 5: Inspect the Alloy diff on one representative example**

Run: `cd /Users/ed/projects/react-pebble && git diff packages/react-pebble/test/snapshots/watchface.js`
Expected diff shape (approximate):

```diff
   onDisplaying(app) {
     this.refresh();
-    app.interval = 1000;
-    app.start();
+    this._tick = () => this.onTimeChanged();
+    watch.addEventListener('minutechange', this._tick);
   }
   onTimeChanged() {
     this.refresh();
   }
+  onUndisplaying(app) {
+    if (this._tick) watch.removeEventListener('minutechange', this._tick);
+  }
```

If the diff looks wrong (e.g. wrong granularity, missing listener, or non-`useTime` snapshots also diff), investigate before continuing. Pay attention to `stopwatch.js` (expect `secondchange`) and any date-only face (expect `daychange`).

- [ ] **Step 6: Regenerate C & Rocky snapshots (should produce minimal drift)**

```bash
cd packages/react-pebble
npx tsx test/snapshot-test.ts --target rocky --update 2>&1 | tail -3
npx tsx test/snapshot-test.ts --target c --update 2>&1 | tail -3
git diff --stat packages/react-pebble/test/snapshots-rocky/ packages/react-pebble/test/snapshots-c/
```

Expected: `--stat` shows 0-few files actually changed (file modifications are rewrites; git diff filters to real content changes).

- [ ] **Step 7: Commit**

```bash
cd /Users/ed/projects/react-pebble
git add packages/react-pebble/scripts/emit-piu.ts packages/react-pebble/test/snapshots/ packages/react-pebble/test/snapshots-rocky/ packages/react-pebble/test/snapshots-c/
git commit -m "$(cat <<'EOF'
feat(piu): swap app.interval for watch.addEventListener time ticks

Matches the native tick pattern Rocky and C already use. Granularity
comes from ir.timeGranularity (second / minute / hour / day), which the
analyzer derives from format tokens and explicit useTime(granularity)
calls.
EOF
)"
```

---

## Task 8: Full verification sweep

**Files:** none modified.

- [ ] **Step 1: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 2: Full test suite (Alloy default + snapshot)**

Run: `cd packages/react-pebble && npm test 2>&1 | tail -3`
Expected: `59 passed, 0 failed out of 59 examples.` (or current Alloy example count).

- [ ] **Step 3: Rocky and C snapshots**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target rocky 2>&1 | tail -3`
Expected: all pass.

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target c 2>&1 | tail -3`
Expected: all pass.

- [ ] **Step 4: Dedicated unit tests**

```bash
cd packages/react-pebble
npx tsx test/time-granularity.test.ts
npx tsx test/emit-c-appmessage.test.ts
npx tsx test/emit-pkjs-rocky.test.ts
npx tsx test/manifest-fields.test.ts
```

Expected: each reports `PASS`.

No commit in this task.

---

## Task 9: Alloy emulator smoke test

**Files:** none modified — manual verification.

- [ ] **Step 1: Deploy a representative Alloy watchface**

```bash
cd packages/react-pebble
./scripts/deploy.sh watchface
```

Expected: compile succeeds, pebble build either succeeds or fails at the SDK-level waf step (that's a pre-existing environmental issue unrelated to this change). Regardless of the build outcome, confirm the emitted `.pebble-build/src/embeddedjs/main.js` contains:

```
watch.addEventListener('minutechange', this._tick);
```

and does NOT contain:

```
app.interval = 1000;
```

```bash
grep -E "watch.addEventListener|app\.interval" .pebble-build/src/embeddedjs/main.js
```

- [ ] **Step 2: If pebble build succeeded, verify on-device behavior**

Run the emulator for ~90 seconds and watch the time change from `HH:MM` → `HH:(MM+1)`. Confirm via `pebble screenshot /tmp/rocky-watchface-tick.png` at start and end. If the screenshots are identical across minutes, `watch.addEventListener('minutechange')` likely doesn't fire from within `AppBehavior` and we need the fallback documented in the spec (read `watch` via import / `app.watch` / whichever piu path is correct — investigate the Moddable Alloy docs before changing).

If the SDK's waf build fails (pre-existing issue), skip this step and document it.

- [ ] **Step 3: Document results**

No code changes. If everything worked, flag it in the PR/merge notes. If the device test surfaced an issue, stop and revisit the spec's "Risks & mitigations" section with the user.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task: API change → Task 4; auto-detection → Task 2; IR field → Task 1; per-target emitters → Tasks 5/6/7; tests → Task 3; smoke test → Task 9.
- **Placeholder scan:** no TBDs/TODOs. Task 2 has one "inspect current timeDeps extraction" discovery step whose outcome is exact line numbers, which are already attached to each subsequent edit. Task 9 Step 2 is conditional on an external factor (pebble SDK build) and says what to do in both branches.
- **Type consistency:** `TimeGranularity` is defined in Task 1, imported by Tasks 2 and 4, used as IR field type in Tasks 5/6/7. `resolveGranularity` is defined in Task 4 and tested in Task 3 (declared failing until Task 4 lands — standard TDD ordering). `granularityToEvent` and `granularityToIntervalMs` are Task 4–internal and not referenced elsewhere.
- **Ordering:** Task 3 (failing test) precedes the implementation tasks that make it pass. Task 7 (emit-piu) is last among the emitter tasks because it has the biggest snapshot diff; Tasks 5 and 6 knock out the Rocky and C pieces first so Alloy's diff is easier to review in isolation.
