# Quick wins: Rocky guardrails, useCompass enrichment, wakeupLaunchId

**Date:** 2026-04-17
**Status:** Draft
**Scope:** Three small, independent improvements batched into one spec. They share a feature branch but don't interact.

## 1. Rocky compile-time guardrails

### Background

Rocky.js has no button events, no on-watch network APIs, and no on-watch storage. Today, using `useButton`, `useFetch`, `useLocalStorage`, etc. in a Rocky-target app silently compiles and then fails at runtime with no useful error. The compiler already collects `hooksUsedList` from the entry source (`compile-to-piu.ts:66-80`) and reads `COMPILE_TARGET` (`compile-to-piu.ts:29`).

### Design

Add a validation step in `compile-to-piu.ts` after `hooksUsedList` is collected. When `target === 'rocky'`, check the list against a blocklist. If any blocked hook is found, log a clear error to stderr and exit non-zero.

Blocked hooks:
- **Buttons:** `useButton`, `useLongButton`, `useMultiClick`, `useRepeatClick`, `useRawClick`
- **Network:** `useFetch`, `useHTTPClient`, `useWebSocket`
- **Storage:** `useLocalStorage`, `useKVStorage`, `useFileStorage`

Error format: `[react-pebble] ERROR: ${hookName} is not supported on the Rocky.js target. Rocky watchfaces have no ${reason}. Route ${alternative} through PKJS instead.`

Where `reason` is "button events" / "on-watch network APIs" / "on-watch storage" and `alternative` hints at the PKJS workaround (e.g. "network requests" → "use useMessage to request data from PKJS").

### Files

- **Modify:** `packages/react-pebble/scripts/compile-to-piu.ts` — add validation block after hooksUsedList collection.

### Testing

New unit test `test/rocky-guardrails.test.ts`: compile a minimal example that uses `useButton` with `COMPILE_TARGET=rocky` and assert the process exits non-zero with an error message containing `useButton` and `not supported on the Rocky.js target`.

No snapshot changes.

---

## 2. useCompass enrichment

### Background

`src/hooks/useCompass.ts` currently returns only `{ heading: number }`. The Pebble C SDK exposes compass calibration state (`CompassStatusDataInvalid | Calibrating | Calibrated`), magnetic vs true heading, and a heading-change filter (`compass_service_set_heading_filter`).

### Design

Extend the return type:

```ts
type CompassStatus = 'dataInvalid' | 'calibrating' | 'calibrated';

interface CompassResult {
  heading: number;
  magneticHeading: number;
  status: CompassStatus;
  setHeadingFilter: (degrees: number) => void;
}
```

- `heading` — existing field, unchanged (true heading in degrees, 0-360).
- `magneticHeading` — raw magnetic heading before declination correction. In mock mode, equals `heading`.
- `status` — calibration state. In mock mode, defaults to `'calibrated'`.
- `setHeadingFilter` — only fire update events when heading changes by at least N degrees. In mock mode, no-op. On Alloy, calls `compass_service_set_heading_filter` or equivalent.

This is a runtime-hook-only enrichment. The compiled emitters (piu/rocky/c) don't consume compass data reactively today — `useCompass` is a read-at-render hook like `useLocation`. No emitter changes needed.

### Files

- **Modify:** `packages/react-pebble/src/hooks/useCompass.ts` — extend return type + mock implementation.
- **Modify:** `packages/react-pebble/src/hooks/index.ts` — re-export `CompassStatus` type if not already.

### Testing

Extend or create `test/compass.test.ts`: import `useCompass` in a mock render, assert the result has `heading`, `magneticHeading`, `status`, `setHeadingFilter` fields with correct types/defaults.

No snapshot changes.

---

## 3. `wakeupLaunchId` in useLaunchInfo

### Background

`src/hooks/useLaunchInfo.ts` returns `{ reason, args }` where `reason` is one of 7 values and `args` is a generic launch argument. When `reason === 'wakeup'`, the Pebble C SDK provides an additional `wakeup_get_launch_id()` that returns the wakeup event ID (the cookie passed when scheduling the wakeup). This is not currently surfaced.

### Design

Extend `UseLaunchInfoResult`:

```ts
interface UseLaunchInfoResult {
  reason: LaunchReason;
  args: number;
  /** Wakeup event ID (cookie). Only meaningful when reason === 'wakeup'; null otherwise. */
  wakeupId: number | null;
}
```

Runtime mock: `wakeupId` is always `null`. On Alloy/C, read `wakeup_get_launch_id()` when `reason === 'wakeup'`; store in the result.

### Files

- **Modify:** `packages/react-pebble/src/hooks/useLaunchInfo.ts` — add `wakeupId` field.

### Testing

Extend or create a test asserting `useLaunchInfo()` returns an object with `wakeupId: null` in mock mode.

No snapshot changes.

---

## Non-goals

- Emitter changes for any of these three items.
- `useVibration` custom patterns — already implemented (`customPattern(durations[])`).
- Full `LaunchReason` enum expansion — already complete (7 values covering all C SDK launch reasons).

## Acceptance criteria

1. `COMPILE_TARGET=rocky` + a component using `useButton` → compile fails with a clear error naming `useButton` and "Rocky.js target".
2. `useCompass()` returns `{ heading, magneticHeading, status, setHeadingFilter }` with correct mock defaults.
3. `useLaunchInfo()` returns `{ reason, args, wakeupId }` with `wakeupId: null` in mock mode.
4. All existing snapshot tests pass unchanged (Alloy/Rocky/C).
