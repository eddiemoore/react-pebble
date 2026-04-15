# `useTime` native tick events across all targets

**Date:** 2026-04-15
**Status:** Draft
**Scope:** Replace the Alloy/piu `app.interval = 1000` loop with `watch.addEventListener('<granularity>change', …)` native ticks, and extend granularity detection across all three compile targets to include `hour` and `day` in addition to `second` and `minute`. Add an explicit `useTime(granularity)` override for components whose format is state-dependent.

## Background

`useTime` today returns a `Date` that updates on a time tick. Each emitter currently drives those updates differently:

- **Rocky** (`scripts/emit-rocky.ts:475-477`): picks `rocky.on('secondchange' | 'minutechange', …)` based on whether the app's formats contain the `SS`/`MMSS` token. Already native.
- **C** (`scripts/emit-c.ts:1382`): picks `tick_timer_service_subscribe(SECOND_UNIT | MINUTE_UNIT, …)` from the same `hasSeconds` detection. Already native.
- **Alloy/piu** (`scripts/emit-piu.ts:619`): always emits `app.interval = 1000; app.start();` and implements `onTimeChanged`. Fires every second regardless of whether the app only renders `HH:mm` — 60× more ticks than needed.

On the runtime side, `src/hooks/useTime.ts` already prefers `watch.addEventListener('secondchange'|'minutechange', fn)` when the Alloy `watch` global is present; it falls back to `setInterval` in Node mock mode. The gap is only in the compiled output.

Neither target currently handles `hour` or `day` granularity. An app showing only the date could use `daychange` / `DAY_UNIT` and tick once per day. No knob today lets the user request that.

## Public API

```ts
type TimeGranularity = 'second' | 'minute' | 'hour' | 'day';

function useTime(granularity?: TimeGranularity | number): Date;
```

Behavior:

- `useTime()` — auto-detect the coarsest granularity the component actually needs (compiler-side detection at build time; runtime mock defaults to `'second'`).
- `useTime('minute')` — force the granularity; skip detection. Useful when the format is selected by runtime state the compiler can't see.
- `useTime(1000)` — legacy number form, kept for back-compat. Mapped via thresholds:
  - `≤ 1000` → `'second'`
  - `≤ 60_000` → `'minute'`
  - `≤ 3_600_000` → `'hour'`
  - else → `'day'`

Return value shape is unchanged: a `Date`. Granularity is a contract about *update cadence*, not about which `Date` fields are meaningful.

Caveat to document: if a component calls `useTime('day')` but reads `.getHours()` off the result, the hours value will be stale until the next day boundary. That's intentional — the user took responsibility for the coarser cadence.

## Auto-detection

The compiler already tracks per-label format strings in `ir.timeDeps`. Today we collapse them to a boolean `hasSeconds`. Replace that with `ir.timeGranularity: TimeGranularity | null` computed as follows:

| Condition | Granularity |
|-----------|-------------|
| Any `SS` format token, or `ir.hasAnimatedElements`, or `ir.timeReactiveGraphics.length > 0` | `second` |
| `mm` present without `SS` | `minute` |
| `HH` / `hh` present without `mm` / `SS` | `hour` |
| Only date tokens (`dddd`, `DD`, `MM`, `YYYY`), no time tokens | `day` |
| `hasTimeDeps` true but no tokens matched | `minute` (safe default) |
| `hasTimeDeps` false | `null` |

If the user passed an explicit `useTime('X')`, that value overrides detection and is captured by the analyzer AST visitor, attached to the IR, and consumed by emitters directly.

## File-level changes

| File | Change |
|------|--------|
| `src/hooks/useTime.ts` | Extend signature to `useTime(granularity?: TimeGranularity \| number): Date`. Introduce `resolveGranularity(arg)` helper that maps the argument to a concrete `TimeGranularity`. Map granularity to mock-mode interval: `second` → 1000, `minute` → 60_000, `hour` → 3_600_000, `day` → recomputed each tick to next local-midnight via `setTimeout` chain (not `setInterval`). Export `TimeGranularity` type from the hooks entry point. |
| `scripts/analyze.ts` | AST-visit `useTime(...)` calls: capture any explicit granularity argument (string literal or number literal). Attach to a new IR field. Compute `detectedGranularity` from `timeDeps` format tokens + animation flags. Final `ir.timeGranularity = explicit ?? detected`. |
| `scripts/compiler-ir.ts` | Add `timeGranularity: TimeGranularity \| null` to `CompilerIR`. Keep `hasTimeDeps` as a boolean convenience flag. |
| `scripts/emit-piu.ts` | In `onCreate`: replace `app.interval = 1000; app.start();` with registering a `watch` tick listener for the computed granularity. Store the bound listener on `this` so `onDispose` can remove it. Add `onDispose` if not already present. Keep `onTimeChanged` as the redraw entry point. |
| `scripts/emit-rocky.ts` | Extend the event-picker from two to four events keyed on `ir.timeGranularity`. |
| `scripts/emit-c.ts` | Extend `unit` selection from `SECOND_UNIT` / `MINUTE_UNIT` to also include `HOUR_UNIT` / `DAY_UNIT`. |

## Testing

**New unit test** (`test/time-granularity.test.ts`):
- `resolveGranularity('minute')` → `'minute'`.
- Numeric mapping (1000 → `'second'`, 60_000 → `'minute'`, 86_400_000 → `'day'`).
- `resolveGranularity(undefined)` at runtime defaults to `'second'` (runtime mock behavior).
- `emitPiu(makeIR({ timeGranularity: 'minute' }))` output contains `watch.addEventListener('minutechange'`.
- `emitPiu(...)` output does not contain `app.interval = 1000`.
- `emitRocky(...)` with `'hour'` emits `rocky.on('hourchange'`.
- `emitC(...)` with `'day'` emits `tick_timer_service_subscribe(DAY_UNIT, …)`.

**Snapshot churn:**

- Alloy (`test/snapshots/`): every example that uses `useTime` drifts. Expected per-file diff: `app.interval = 1000; app.start();` lines gone; a `watch.addEventListener` call appears in `onCreate`; a matching `removeEventListener` may appear in `onDispose`. Review one representative example (e.g. `watchface.js`) manually before accepting the batch.
- Rocky (`test/snapshots-rocky/`): drifts only where detection would move from `minutechange` to `hourchange`/`daychange`. Likely 0–few examples, since most existing faces render `HH:mm` (already `minute`).
- C (`test/snapshots-c/`): same shape as Rocky.

**Smoke test on Alloy:** deploy one watchface (e.g. `watchface`) to the emery emulator and confirm the clock still updates minute-to-minute. This verifies piu's `watch` global works from within `AppBehavior` — the one piece of runtime behavior this change relies on that isn't exercised by snapshots.

## Risks & mitigations

- **Alloy `watch` global inside `AppBehavior` is untested.** If `watch.addEventListener` isn't reachable from that scope on emery, watchfaces stop updating. Mitigation: the smoke test above; if it fails, fall back to reading `watch` off a global import and wiring through `onCreate`'s `app` argument.
- **Day granularity needs careful mock-mode cadence.** `setInterval(fn, 86_400_000)` drifts over weeks and fires at the wrong wall-clock time. Use a `setTimeout`-to-next-local-midnight chain instead. Constrained to the runtime mock path; does not affect compiled output.
- **Back-compat for `useTime(1000)`.** Existing examples pass `1000` by habit. The numeric mapping keeps them working; snapshot tests guard against regression.

## Non-goals

- `useTickTimer` / separate hour/day hook variants.
- Exposing `rocky.on('secondchange')` etc. as standalone hooks (users can still access them via `useTime`).
- Changing `useAnimation`'s internal clock.
- Supporting tick intervals finer than 1 second (Pebble's `tick_timer_service` doesn't either).

## Acceptance criteria

1. Alloy snapshot for a minute-granularity watchface contains `watch.addEventListener('minutechange'` in `onCreate` and no `app.interval = 1000`.
2. A component using only date tokens compiles to `daychange` (Rocky) / `DAY_UNIT` (C) / `daychange` (Alloy).
3. Explicit `useTime('hour')` in user code overrides auto-detection end-to-end on all three targets.
4. `useTime(1000)` and `useTime()` without args continue to work; their compiled output matches second-granularity behavior.
5. A representative Alloy watchface deployed to the emery emulator still updates its minute display.

## Related work

- `654d4b4 Merge branch 'feat/rocky-postmessage'` (gap #1 — Rocky useMessage)
- `992a4d7 Merge branch 'feat/manifest-fields'` (gap #2 — manifest fields)

This is gap #3 of five from the developer.repebble.com docs audit. Remaining after this: Timeline Web API server-side builder, messageKeys array notation.
