# Medium trio: piu Image rotation, useHealth averaged, PKJS appGlanceReload

**Date:** 2026-04-17
**Status:** Draft
**Scope:** Three independent improvements batched into one spec.

## 1. Piu Image rotation

### Background

`<Image rotation={angle} pivotX={x} pivotY={y}>` already works on C (`graphics_draw_rotated_bitmap` at `emit-c.ts:1566-1580`) and Rocky (`ctx.rotate()` at `emit-rocky.ts:241-268`). The piu/Alloy emitter's `case 'image'` block (`emit-piu.ts:347-362`) does NOT handle `rotation` — images always render axis-aligned. SVGImage already supports rotation via `r:` option.

### Design

In `emit-piu.ts`, extend the `case 'image'` content declaration: when `el.rotation` is set and non-zero, emit a `rotation` property on the piu `Content` (or `Port`) node. Piu's `Content` class accepts a `rotation` property in radians. If `pivotX`/`pivotY` are set, they map to the content's `anchor` property.

### Files

- **Modify:** `packages/react-pebble/scripts/emit-piu.ts` — image case rotation handling.

### Testing

Regenerate the Alloy snapshot for the `image` example (if it uses rotation) or any example that uses `<Image rotation={...}>`. Verify the snapshot contains the `rotation:` property. Add a targeted unit test if no example exercises rotation.

---

## 2. useHealth averaged metrics + activities

### Background

`src/hooks/useHealth.ts` returns basic metrics: `steps`, `distance`, `activeSeconds`, `calories`, `heartRate`, `sleepSeconds`. Missing: daily/weekly averaged metrics (`health_service_metric_averaged_accessible` / `_sum_averaged`) and current activities bitmask (`health_service_peek_current_activities()` → Sleep, Walk, Run, OpenWorkout).

`useHealthHistory.ts` provides minute-level history, not averages. `useHealthAlert.ts` provides threshold alerts. Neither covers this gap.

### Design

Extend `src/hooks/useHealth.ts` return type:

```ts
interface HealthResult {
  // ...existing fields (steps, distance, etc.)...

  /** Daily/weekly averaged metrics. Null when health service is unavailable. */
  averaged: {
    daily: HealthData;
    weekly: HealthData;
  } | null;

  /** Currently active health activities (empty array in mock mode). */
  currentActivities: HealthActivity[];
}

type HealthActivity = 'sleep' | 'restfulSleep' | 'walk' | 'run' | 'openWorkout';
```

**Mock mode:** `averaged` returns the same values as the base metrics (no real averaging in Node). `currentActivities` returns `[]`.

**Alloy runtime:** Use `Health.getAveraged('daily')` / `Health.getAveraged('weekly')` for averaged data (if the global provides it). Use `Health.getCurrentActivities()` or equivalent for the activities array. If neither API is available on the runtime, fall back to `null` / `[]`.

This is a runtime-hook-only enrichment. No emitter changes — useHealth is not consumed reactively by the compiler.

### Files

- **Modify:** `packages/react-pebble/src/hooks/useHealth.ts` — extend return type + mock + runtime paths.
- **Modify:** `packages/react-pebble/src/hooks/index.ts` — re-export `HealthActivity` type.

### Testing

Unit test asserting mock mode returns `averaged` (non-null with numeric fields) and `currentActivities: []`.

---

## 3. PKJS appGlanceReload

### Background

`useAppGlance()` (`src/hooks/useAppGlance.ts:48-59`) only works when the Alloy `AppGlance` global exists. For Rocky+PKJS apps, the watch has no `AppGlance` global. The canonical PKJS API is `Pebble.appGlanceReload(slices, successCb, errorCb)`.

The same pattern exists for `useTimeline`: when no native `Timeline` global is available, it falls back to forwarding via AppMessage to PKJS using reserved keys (`_rpTLPush`). Mirror that pattern for AppGlance.

### Design

**Watch-side (`src/hooks/useAppGlance.ts`):** When `AppGlance` global is not available, fall back to sending via AppMessage using a reserved key `_rpGlanceUpdate`:

```ts
// Fallback: forward to PKJS over AppMessage
getPebbleGlobal()?.sendAppMessage?.({
  _rpGlanceUpdate: JSON.stringify(slices),
});
```

**PKJS emitter (`scripts/emit-pkjs.ts`):** When `useAppGlance` is in `hooksUsed`, generate a handler in the `appmessage` listener that calls `Pebble.appGlanceReload`:

```js
if (typeof p._rpGlanceUpdate === "string") {
  try {
    var slices = JSON.parse(p._rpGlanceUpdate);
    Pebble.appGlanceReload(function(glances) {
      glances.length = 0; // clear existing
      for (var i = 0; i < slices.length; i++) {
        glances.push(slices[i]);
      }
      return slices;
    }, function() {
      console.log("AppGlance updated via PKJS");
    }, function(err) {
      console.log("AppGlance update failed: " + err);
    });
  } catch (e) { console.log("AppGlance parse error: " + e); }
}
```

**Capability auto-inference:** `useAppGlance` doesn't currently trigger a capability. No change needed — AppGlance is available on all platforms that support PKJS.

### Files

- **Modify:** `packages/react-pebble/src/hooks/useAppGlance.ts` — add PKJS fallback.
- **Modify:** `packages/react-pebble/scripts/emit-pkjs.ts` — generate `_rpGlanceUpdate` handler when `useAppGlance` in hooksUsed.

### Testing

Unit test for `emitPKJS`: construct an options object with `hooksUsed: ['useAppGlance']` and assert the output contains `_rpGlanceUpdate` and `appGlanceReload`.

No snapshot changes expected — the PKJS code goes to stderr/plugin-written files, not the main snapshot output.

---

## Non-goals

- New `RotBitmapLayer` component — unnecessary; `<Image rotation>` already covers it.
- Emitter changes for useHealth — runtime-hook-only.
- Rocky-side AppGlance rendering (Rocky has no glance concept; it's phone-side only).

## Acceptance criteria

1. Alloy snapshot for an image-with-rotation example contains a `rotation:` property on the image content node.
2. `useHealth()` returns `averaged.daily.steps` (number) and `currentActivities` (array) in mock mode.
3. `emitPKJS` output contains `_rpGlanceUpdate` handler with `Pebble.appGlanceReload` when `useAppGlance` is in hooksUsed.
4. All existing snapshot tests pass unchanged (Alloy/Rocky/C), except image-rotation if applicable.
