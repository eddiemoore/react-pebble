# `ConfigCheckboxGroup` array-keys wire format

**Date:** 2026-04-16
**Status:** Draft
**Scope:** Make `ConfigCheckboxGroup` round-trip end-to-end on the C target. Config page produces `settings[key]: string[]`; PKJS expands the array into N consecutive AppMessage slots using Pebble's `"KEY[N]"` messageKey notation; C-side decodes into `bool <key>[N]` on `ClaySettings`.

## Background

`ConfigCheckboxGroup(key, label, options, default)` (`src/config/index.ts:212`) produces a multi-select control whose submitted value is `string[]` — the array of selected option values. Today the C-target wire path breaks that contract silently:

- `submitSettings()` correctly produces `settings.metrics = ['pace', 'hr']` (`src/config/index.ts:558`).
- PKJS `webviewclosed` handler falls through to the generic `msg[key] = val` branch (`scripts/emit-pkjs.ts:211`) — passing a JS array to `Pebble.sendAppMessage`. AppMessage cannot encode an array of strings; the send either errors out or arrives with unusable encoding.
- `emit-c.ts:1101-1118` emits one `dict_find(iter, MESSAGE_KEY_<KEY>)` per config key regardless of type; there is no multi-slot read path.
- `ClaySettings` in `emit-c.ts:417-431` has no struct field shape for an array; it only models `GColor | bool | char[64]`.
- `pebbleConfig.messageKeys` in `src/plugin/index.ts:495-498` is populated from `useMessage` detection only; config keys are not in the list at all.

The Pebble SDK documents a `"KEY[N]"` notation in `package.json`'s `messageKeys` that allocates `N` consecutive resource IDs starting at `MESSAGE_KEY_<KEY>`. That is the canonical way to carry N-valued data over AppMessage. This spec wires it through end-to-end for checkboxgroup.

## Non-goals

- Perturbation analysis for array values. JSX expressions like `settings.metrics.includes('pace')` will not compile to reactive C branches. Data arrives in `ClaySettings.<key>[i]`; whether user code can use it to drive reactivity is a separate, larger spec.
- Rocky target changes. Rocky uses `rocky.postMessage` which carries JS arrays natively (no AppMessage dictionary); today's path works once settings reach PKJS.
- Alloy/piu `Message` path. Moddable's `Message` API is richer than AppMessage and may already handle the array case. Verify during implementation. If it does not, document the gap and follow up separately.
- `useConfiguration` runtime hook changes. The hook already returns `string[]` from localStorage in mock mode.

## Design

### IR extension

Extend `IRConfigKey` in `scripts/compiler-ir.ts`:

```ts
export interface IRConfigKey {
  key: string;
  label: string;
  type: 'color' | 'boolean' | 'string' | 'checkboxgroup';
  default: string | boolean | string[];
  /** Only set when type === 'checkboxgroup'. Option values in declaration order. */
  options?: string[];
}
```

### Analyzer

`scripts/analyze.ts` `detectUseConfiguration` already walks the config-spec AST and recognizes builder calls. Extend the call-site recognizer for `ConfigCheckboxGroup(key, label, optionsArray, defaultArray)` to:

- Capture `optionsArray` — extract `.value` from each object literal; error if any option is non-literal.
- Capture `defaultArray` — array of string literals; allow empty.
- Emit an `IRConfigKey` with `type: 'checkboxgroup'`, `options: string[]`, `default: string[]`.

`ConfigRadioGroup` stays `type: 'string'`; it picks one value.

### Plugin: `messageKeys` emission

In `src/plugin/index.ts`, thread a new `configKeys: IRConfigKey[]` entry through `CompileResult` → `ScaffoldOptions`. In the `pebbleConfig.messageKeys` assembly (currently `src/plugin/index.ts:495-498`):

- Keep the existing `useMessage`-derived entries.
- Append one entry per `IRConfigKey`:
  - `type === 'checkboxgroup'` → `"${key}[${options.length}]"`
  - any other type → `"${key}"`

Suppress when target is Rocky (existing `!isRocky` guard still applies).

### PKJS emitter

`scripts/emit-pkjs.ts:194-228` `webviewclosed` handler gets two additions:

1. **Options lookup table** at the top of the emitted file (once, before the `showConfiguration` block): `var __configOptions = { "metrics": ["pace","hr","cal"], … };` — only emitted when any checkboxgroup config key exists.
2. **Array branch** inside the `for (var key in settings)` loop, ordered after the existing `boolean` branch and before the generic `msg[key] = val` fallback:

```js
} else if (Array.isArray(val) && __configOptions[key]) {
  var opts = __configOptions[key];
  for (var i = 0; i < opts.length; i++) {
    var slot = (i === 0) ? key : key + "_" + i;
    msg[slot] = val.indexOf(opts[i]) >= 0 ? 1 : 0;
  }
}
```

Slot-naming convention follows the documented Pebble SDK expansion for `"KEY[N]"`: first slot is `KEY`, subsequent slots are `KEY_1` … `KEY_{N-1}`. Implementation must verify this by inspecting a real `pebble build`'s generated `pebble.h` and adjust both emit-pkjs and emit-c in lockstep if the SDK uses a different convention (e.g. zero-based `KEY_0`).

### C emitter

Three sites in `scripts/emit-c.ts`:

**`ClaySettings` struct** (L417-431): add a case for `'checkboxgroup'`:
```c
bool <key>[<N>];
```

**`prv_default_settings`** (L437-450): initialize each slot from the `default: string[]`:
```c
settings.<key>[0] = <default.includes(options[0]) ? 'true' : 'false'>;
// … one line per option
```

**`prv_inbox_received`** (L1101-1118): add a case that reads N consecutive keys. For each index `i` in `0..N-1`:
```c
Tuple *<key>_<i>_t = dict_find(iter, MESSAGE_KEY_<key><suffix>);
if (<key>_<i>_t) settings.<key>[<i>] = <key>_<i>_t->value->int32 == 1;
```
where `<suffix>` is empty for `i === 0` and `_<i>` otherwise, mirroring the PKJS slot names.

## Testing

### New unit test: `test/config-checkboxgroup.test.ts`

Fixture IR with one `checkboxgroup` key (`metrics`, 3 options, default `['pace','hr']`). Assertions:

- `emitC(ir)` output contains `bool metrics[3];`
- `prv_default_settings` assigns `settings.metrics[0] = true; settings.metrics[1] = true; settings.metrics[2] = false;`
- `prv_inbox_received` contains 3 `dict_find(iter, MESSAGE_KEY_metrics)` / `MESSAGE_KEY_metrics_1` / `MESSAGE_KEY_metrics_2` calls.
- `emitPKJS(ir, { configUrl: 'data:…' })` contains `__configOptions["metrics"] = ["pace","hr","cal"]`
- `emitPKJS(...)` contains the `Array.isArray(val) && __configOptions[key]` branch
- `emitPKJS(...)` does NOT contain the problematic `msg[key] = val` path for array-typed values (verify by checking the conditional structure).

### Extended existing test: `test/manifest-fields.test.ts`

Scaffold a project with a checkboxgroup config key via `scaffoldPebbleProject`; parse the emitted `package.json` and assert `pkg.pebble.messageKeys` includes `"metrics[3]"`.

### Snapshot drift

- `test/snapshots-c/config-rich.c` — expected drift: new struct field, new default-settings lines, new inbox_received dict_find calls.
- `test/snapshots/config-rich.js` (Alloy) — expected drift only if `messageKeys` or config handling in piu also needs updating. Review diff carefully.
- `test/snapshots-rocky/config-rich.js` — no drift expected (postMessage path untouched).

### No emulator smoke test

Pebble SDK `waf` build is broken in this environment for reasons unrelated to this change. The wire format is straightforward enough to verify by:
1. Inspecting the emitted `package.json` messageKeys.
2. Inspecting the emitted PKJS for correct array expansion.
3. Inspecting the emitted C for N dict_finds.

If the SDK key-suffix convention disagrees with this spec (see Risks), add emulator verification as a follow-up task.

## Risks & mitigations

**`MESSAGE_KEY_<KEY>[_<i>]` suffix format.** The spec assumes Pebble SDK expands `"KEY[N]"` into `KEY`, `KEY_1`, … `KEY_{N-1}`. Documentation sources differ (some say `KEY_0` onwards). Mitigation: first implementation task includes a build probe — scaffold a minimal app with `messageKeys: ["probe[3]"]`, run `pebble build`, grep the generated `pebble.h` for `MESSAGE_KEY_probe*`, adjust emitters to match.

**Pre-existing config-key / messageKeys mismatch.** Today the plugin does not emit config keys at all in `pebble.messageKeys`, yet `emit-c.ts` references `MESSAGE_KEY_<KEY>` constants that would be undefined at compile time. Either:
(a) a prior mechanism auto-generates those constants (SDK auto-adds them from source scan — unlikely but possible), or
(b) every existing C-target config app has been broken silently, or
(c) the `config-watchface` example works by accident because its keys are short/valid identifiers.

Task 1 investigates this; if (b) is the case, this spec's plugin change fixes it as a side-effect and the acceptance criteria include "existing scalar config keys still work after the change".

## Acceptance criteria

1. `pebble.messageKeys` in the generated `package.json` contains `"<key>[<N>]"` for every checkboxgroup config key and `"<key>"` for every scalar config key.
2. `prv_inbox_received` in the emitted C code reads N dict_finds for each checkboxgroup, populating `settings.<key>[0..N-1]`.
3. PKJS `webviewclosed` expands each array-typed setting into N consecutive `msg[slot]` entries matching the SDK's expansion convention.
4. `ClaySettings` includes `bool <key>[<N>]` for each checkboxgroup.
5. `prv_default_settings` initializes each slot based on membership in the declared `default: string[]`.
6. Existing scalar config keys (color/boolean/string) continue to work — no regression in `config-watchface` snapshot.
7. Rocky and Alloy snapshots show zero drift, or the Alloy diff is reviewed and explained.

## Related work

- `654d4b4 Merge branch 'feat/rocky-postmessage'` (gap #1)
- `992a4d7 Merge branch 'feat/manifest-fields'` (gap #2) — the `_maximum()` AppMessage buffer default here is what makes 50-option checkboxgroups feasible without heap explosion.
- `af8b360 Merge branch 'feat/usetime-native-ticks'` (gap #3)

This is gap #4 of five from the developer.repebble.com docs audit. Remaining after this: Timeline Web API server-side builder.
