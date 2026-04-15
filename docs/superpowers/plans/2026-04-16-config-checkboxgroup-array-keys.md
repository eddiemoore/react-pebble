# `ConfigCheckboxGroup` Array-Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ConfigCheckboxGroup` round-trip end-to-end on the C target: phone submits `string[]`, PKJS converts to `int[]` using the declared options, AppMessage carries it via `"KEY[N]"` notation, and C populates `settings.<key>[i]: bool` for each option.

**Architecture:** Extend `IRConfigKey` with a `'checkboxgroup'` type carrying `options` and array `default`. Analyzer captures from `ConfigCheckboxGroup(...)` AST. Plugin's `messageKeys` emission now includes all config keys, with `"KEY[N]"` notation for checkboxgroups. PKJS converts the `string[]` submission to an `int[]` aligned with the declared options. C emitter adds one `bool <key>[N]` struct field and a `for (i=0..N-1)` pointer-arithmetic loop in `prv_inbox_received`.

**Tech Stack:** Same as prior gaps — TypeScript emitters, tsx-run unit tests, the snapshot harness at `test/snapshot-test.ts`.

**Spec:** `docs/superpowers/specs/2026-04-16-config-checkboxgroup-array-keys-design.md`.

**SDK-derived wire convention** (discovered from `process_message_keys.py`): `"KEY[N]"` generates a single `MESSAGE_KEY_<KEY>` constant at the base slot; consecutive slots are addressed via pointer arithmetic (`MESSAGE_KEY_<KEY> + i`). PKJS sends the whole group as an array value under the base key name; the SDK's phone runtime expands it. This supersedes the spec's `KEY_1`/`KEY_2` suffix assumption (which was flagged as a risk; investigation resolved it in favor of the pointer-arithmetic pattern).

---

## Files

- **Modify** `packages/react-pebble/scripts/compiler-ir.ts` — extend `IRConfigKey`.
- **Modify** `packages/react-pebble/scripts/analyze.ts` — `ConfigCheckboxGroup` AST recognizer.
- **Modify** `packages/react-pebble/scripts/compile-to-piu.ts` — thread `configKeys` through stderr diagnostics so the plugin can read them.
- **Modify** `packages/react-pebble/src/compiler/index.ts` — parse the new diagnostic.
- **Modify** `packages/react-pebble/src/plugin/index.ts` — include config keys in `pebbleConfig.messageKeys`, with `"key[N]"` for checkboxgroup.
- **Modify** `packages/react-pebble/scripts/emit-pkjs.ts` — emit `__configOptions` table + array-to-int[] branch in `webviewclosed`.
- **Modify** `packages/react-pebble/scripts/emit-c.ts` — `ClaySettings` struct, `prv_default_settings`, `prv_inbox_received` branches.
- **Create** `packages/react-pebble/test/config-checkboxgroup.test.ts` — unit tests.
- **Extend** `packages/react-pebble/test/manifest-fields.test.ts` — add messageKeys assertion.
- **Update (snapshot regen)** `packages/react-pebble/test/snapshots-c/config-rich.c` — drift expected.
- **Update (snapshot regen)** `packages/react-pebble/test/snapshots/config-rich.js` — Alloy drift only if messageKeys emission touches it (verify).
- **No drift** `packages/react-pebble/test/snapshots-rocky/config-rich.js` — Rocky suppresses messageKeys.

---

## Task 1: Extend `IRConfigKey`

**Files:**
- Modify: `packages/react-pebble/scripts/compiler-ir.ts`

- [ ] **Step 1: Extend the type**

Find the existing `IRConfigKey` interface in `scripts/compiler-ir.ts`:

```ts
export interface IRConfigKey {
  key: string;
  label: string;
  type: 'color' | 'boolean' | 'string';
  default: string | boolean;
}
```

Replace with:

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

- [ ] **Step 2: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean (scripts/ isn't in tsconfig include; downstream emitters aren't rechecked until the test pulls them in).

- [ ] **Step 3: Commit**

```bash
cd packages/react-pebble
git add scripts/compiler-ir.ts
git commit -m "refactor: IRConfigKey supports 'checkboxgroup' type with options"
```

---

## Task 2: Analyzer recognizes `ConfigCheckboxGroup`

**Files:**
- Modify: `packages/react-pebble/scripts/analyze.ts` (inside `detectUseConfiguration`)

- [ ] **Step 1: Locate the existing config-builder recognizer**

Run: `grep -n "ConfigRadioGroup\|ConfigCheckboxGroup\|'radiogroup'" packages/react-pebble/scripts/analyze.ts | head -10`
Goal: find the AST visitor block that handles `ConfigRadioGroup` and extend the same pattern for `ConfigCheckboxGroup`.

- [ ] **Step 2: Add the checkboxgroup branch**

Follow the existing `ConfigRadioGroup` pattern. A checkboxgroup call has signature:

```ts
ConfigCheckboxGroup(key, label, options, default)
// e.g. ConfigCheckboxGroup('metrics', 'Show metrics',
//        [{label:'Pace', value:'pace'}, …], ['pace', 'hr'])
```

Inside the visitor, when the callee is `ConfigCheckboxGroup`:
- Read arg 0 (key) — string literal.
- Read arg 1 (label) — string literal.
- Read arg 2 (options) — array of object literals; extract `.value` from each.
- Read arg 3 (default) — array literal of string literals; `[]` if absent.
- Emit an `IRConfigKey` with:
  ```ts
  {
    key,
    label,
    type: 'checkboxgroup',
    options: [<extracted values>],
    default: [<extracted defaults>],
  }
  ```

If the exact AST library pattern for Radio/Select/Toggle is not clear, inspect those cases in the same file — one of them decodes an `options: Array<{ label, value }>` argument and the checkboxgroup parses identically.

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd packages/react-pebble
git add scripts/analyze.ts
git commit -m "feat(analyzer): recognize ConfigCheckboxGroup with options + array default"
```

---

## Task 3: Failing unit test

**Files:**
- Create: `packages/react-pebble/test/config-checkboxgroup.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/react-pebble/test/config-checkboxgroup.test.ts`:

```ts
/**
 * test/config-checkboxgroup.test.ts — ConfigCheckboxGroup wire format.
 *
 *   1. emit-c ClaySettings adds `bool <key>[N];`
 *   2. emit-c prv_default_settings initializes slots per default membership
 *   3. emit-c prv_inbox_received reads N slots via pointer arithmetic
 *   4. emit-pkjs emits __configOptions table + array-to-int[] conversion
 *
 * Usage: npx tsx test/config-checkboxgroup.test.ts
 */

import { emitC } from '../scripts/emit-c.js';
import { emitPKJS } from '../scripts/emit-pkjs.js';
import type { CompilerIR, IRConfigKey } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function makeIR(overrides: Partial<CompilerIR> = {}): CompilerIR {
  const key: IRConfigKey = {
    key: 'metrics',
    label: 'Show metrics',
    type: 'checkboxgroup',
    options: ['pace', 'hr', 'cal'],
    default: ['pace', 'hr'],
  };
  return {
    tree: [],
    platform: { name: 'basalt', width: 144, height: 168 },
    stateSlots: [],
    timeDeps: new Map(),
    stateDeps: new Map(),
    skinDeps: new Map(),
    branches: new Map(),
    conditionalChildren: [],
    listInfo: null,
    listSlotLabels: new Set(),
    timeReactiveGraphics: [],
    animatedElements: [],
    messageInfo: null,
    configInfo: {
      keys: [key],
      url: 'data:fake',
      appName: null,
      sectionTitles: [],
    },
    hasButtons: false,
    hasTimeDeps: false,
    hasStateDeps: false,
    hasBranches: false,
    hasConditionals: false,
    hasSkinDeps: false,
    hasList: false,
    hasAnimatedElements: false,
    hasImages: false,
    imageResources: [],
    timeGranularity: null,
    ...overrides,
  } as unknown as CompilerIR;
}

// C emitter
const cOut = emitC(makeIR());

assert(
  cOut.includes('bool metrics[3];'),
  'ClaySettings must declare bool metrics[3]',
);
assert(
  cOut.includes('settings.metrics[0] = true;'),
  "Default for 'pace' (included) must be true",
);
assert(
  cOut.includes('settings.metrics[1] = true;'),
  "Default for 'hr' (included) must be true",
);
assert(
  cOut.includes('settings.metrics[2] = false;'),
  "Default for 'cal' (not included) must be false",
);
assert(
  /dict_find\(iter,\s*MESSAGE_KEY_metrics\s*\+\s*i\)/.test(cOut),
  'prv_inbox_received must use pointer-arithmetic dict_find(iter, MESSAGE_KEY_metrics + i)',
);
assert(
  cOut.includes('for (int i = 0; i < 3; i++)'),
  'prv_inbox_received must loop i from 0 to N-1',
);

// PKJS emitter
const pkjsOut = emitPKJS({
  ir: makeIR(),
  configUrl: 'data:fake',
});

assert(
  pkjsOut.includes('var __configOptions'),
  'PKJS must emit __configOptions lookup table',
);
assert(
  pkjsOut.includes('"metrics":'),
  'PKJS __configOptions must list "metrics"',
);
assert(
  /\["pace",\s*"hr",\s*"cal"\]/.test(pkjsOut),
  'PKJS __configOptions["metrics"] must equal ["pace","hr","cal"]',
);
assert(
  pkjsOut.includes('Array.isArray(val)'),
  'PKJS must branch on Array.isArray(val) before the generic else',
);
assert(
  /msg\[key\]\s*=\s*out/.test(pkjsOut),
  'PKJS must emit msg[key] = out (single-key array value, not per-slot expansion)',
);

console.log('config-checkboxgroup.test.ts: PASS');
```

- [ ] **Step 2: Run the test — expect it to fail**

Run: `cd packages/react-pebble && npx tsx test/config-checkboxgroup.test.ts 2>&1 | head -3; echo "exit=$?"`
Expected: either a type/export error or a `FAIL:` assertion. Either counts as "red".

- [ ] **Step 3: Commit**

```bash
cd packages/react-pebble
git add test/config-checkboxgroup.test.ts
git commit -m "test: add failing ConfigCheckboxGroup wire-format tests"
```

---

## Task 4: C emitter changes

**Files:**
- Modify: `packages/react-pebble/scripts/emit-c.ts:417-431` (ClaySettings struct)
- Modify: `packages/react-pebble/scripts/emit-c.ts:437-450` (prv_default_settings)
- Modify: `packages/react-pebble/scripts/emit-c.ts:1101-1118` (prv_inbox_received)

- [ ] **Step 1: Extend `ClaySettings` struct**

Find the existing `switch (k.type)` block at L418-429:

```ts
    lines.push('typedef struct ClaySettings {');
    for (const k of cfg.keys) {
      switch (k.type) {
        case 'color':
          lines.push(`  GColor ${k.key};`);
          break;
        case 'boolean':
          lines.push(`  bool ${k.key};`);
          break;
        case 'string':
          lines.push(`  char ${k.key}[64];`);
          break;
      }
    }
    lines.push('} ClaySettings;');
```

Add a `checkboxgroup` case inside the switch:

```ts
        case 'checkboxgroup': {
          const size = (k.options ?? []).length;
          lines.push(`  bool ${k.key}[${size}];`);
          break;
        }
```

- [ ] **Step 2: Extend `prv_default_settings`**

Find the existing `switch (k.type)` block at L438-449:

```ts
    lines.push('static void prv_default_settings(void) {');
    for (const k of cfg.keys) {
      switch (k.type) {
        case 'color':
          lines.push(`  settings.${k.key} = GColorFromHEX(0x${k.default});`);
          break;
        case 'boolean':
          lines.push(`  settings.${k.key} = ${k.default ? 'true' : 'false'};`);
          break;
        case 'string':
          lines.push(`  strncpy(settings.${k.key}, "${String(k.default).replace(/"/g, '\\"')}", sizeof(settings.${k.key}) - 1);`);
          break;
      }
    }
```

Add a `checkboxgroup` case inside the switch:

```ts
        case 'checkboxgroup': {
          const options = k.options ?? [];
          const defaults = Array.isArray(k.default) ? k.default : [];
          for (let i = 0; i < options.length; i++) {
            const selected = defaults.includes(options[i]!);
            lines.push(`  settings.${k.key}[${i}] = ${selected ? 'true' : 'false'};`);
          }
          break;
        }
```

- [ ] **Step 3: Extend `prv_inbox_received`**

Find the existing loop at L1102-1115:

```ts
    lines.push('static void prv_inbox_received(DictionaryIterator *iter, void *ctx) {');
    for (const k of cfg.keys) {
      lines.push(`  Tuple *${k.key}_t = dict_find(iter, MESSAGE_KEY_${k.key});`);
      switch (k.type) {
        case 'color':
          lines.push(`  if (${k.key}_t) settings.${k.key} = GColorFromHEX(${k.key}_t->value->int32);`);
          break;
        case 'boolean':
          lines.push(`  if (${k.key}_t) settings.${k.key} = ${k.key}_t->value->int32 == 1;`);
          break;
        case 'string':
          lines.push(`  if (${k.key}_t) strncpy(settings.${k.key}, ${k.key}_t->value->cstring, sizeof(settings.${k.key}) - 1);`);
          break;
      }
    }
    lines.push('  prv_save_settings();');
    lines.push('  prv_update_config();');
    lines.push('}');
```

Change the loop to special-case `checkboxgroup` BEFORE emitting the generic `dict_find`:

```ts
    lines.push('static void prv_inbox_received(DictionaryIterator *iter, void *ctx) {');
    for (const k of cfg.keys) {
      if (k.type === 'checkboxgroup') {
        const size = (k.options ?? []).length;
        lines.push(`  for (int i = 0; i < ${size}; i++) {`);
        lines.push(`    Tuple *t = dict_find(iter, MESSAGE_KEY_${k.key} + i);`);
        lines.push(`    if (t) settings.${k.key}[i] = t->value->int32 == 1;`);
        lines.push('  }');
        continue;
      }
      lines.push(`  Tuple *${k.key}_t = dict_find(iter, MESSAGE_KEY_${k.key});`);
      switch (k.type) {
        case 'color':
          lines.push(`  if (${k.key}_t) settings.${k.key} = GColorFromHEX(${k.key}_t->value->int32);`);
          break;
        case 'boolean':
          lines.push(`  if (${k.key}_t) settings.${k.key} = ${k.key}_t->value->int32 == 1;`);
          break;
        case 'string':
          lines.push(`  if (${k.key}_t) strncpy(settings.${k.key}, ${k.key}_t->value->cstring, sizeof(settings.${k.key}) - 1);`);
          break;
      }
    }
    lines.push('  prv_save_settings();');
    lines.push('  prv_update_config();');
    lines.push('}');
```

- [ ] **Step 4: Run the unit test**

Run: `cd packages/react-pebble && npx tsx test/config-checkboxgroup.test.ts 2>&1 | head -5`
Expected: C assertions pass; PKJS assertions still fail.

- [ ] **Step 5: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-c.ts
git commit -m "feat(c): ClaySettings + inbox handler for checkboxgroup keys"
```

---

## Task 5: PKJS emitter changes

**Files:**
- Modify: `packages/react-pebble/scripts/emit-pkjs.ts:194-228` (webviewclosed handler)
- Modify: `packages/react-pebble/scripts/emit-pkjs.ts` (add `__configOptions` emission before the `showConfiguration` block)

- [ ] **Step 1: Emit the options lookup table**

In `scripts/emit-pkjs.ts`, locate the `if (options.configUrl) {` block (around L161 — the one that emits `Pebble.addEventListener("showConfiguration", ...)`). Immediately inside that block, BEFORE any other lines, add:

```ts
    // Lookup table for checkboxgroup option-value arrays; keys reference the
    // ConfigCheckboxGroup declaration at compile time. Used during
    // webviewclosed to convert the submitted string[] to an int[] aligned
    // with the declared options.
    const checkboxGroups = (ir.configInfo?.keys ?? []).filter(
      (k): k is typeof k & { options: string[] } =>
        k.type === 'checkboxgroup' && Array.isArray(k.options),
    );
    if (checkboxGroups.length > 0) {
      lines.push('');
      lines.push('var __configOptions = {');
      for (const k of checkboxGroups) {
        lines.push(`  "${k.key}": ${JSON.stringify(k.options)},`);
      }
      lines.push('};');
    }
```

- [ ] **Step 2: Extend `webviewclosed`'s conversion loop**

Find the existing conversion block at L204-212:

```ts
    lines.push('      for (var key in settings) {');
    lines.push('        var val = settings[key];');
    lines.push('        if (typeof val === "string" && /^[0-9a-fA-F]{6}$/.test(val)) {');
    lines.push('          msg[key] = parseInt(val, 16);  // 0xRRGGBB for GColorFromHEX');
    lines.push('        } else if (typeof val === "boolean") {');
    lines.push('          msg[key] = val ? 1 : 0;');
    lines.push('        } else {');
    lines.push('          msg[key] = val;');
    lines.push('        }');
    lines.push('      }');
```

Replace with:

```ts
    lines.push('      for (var key in settings) {');
    lines.push('        var val = settings[key];');
    lines.push('        if (typeof val === "string" && /^[0-9a-fA-F]{6}$/.test(val)) {');
    lines.push('          msg[key] = parseInt(val, 16);  // 0xRRGGBB for GColorFromHEX');
    lines.push('        } else if (typeof val === "boolean") {');
    lines.push('          msg[key] = val ? 1 : 0;');
    lines.push('        } else if (Array.isArray(val) && typeof __configOptions !== "undefined" && __configOptions[key]) {');
    lines.push('          // Checkboxgroup: convert string[] of selected values to int[] aligned with declared options.');
    lines.push('          var opts = __configOptions[key];');
    lines.push('          var out = [];');
    lines.push('          for (var i = 0; i < opts.length; i++) {');
    lines.push('            out.push(val.indexOf(opts[i]) >= 0 ? 1 : 0);');
    lines.push('          }');
    lines.push('          msg[key] = out;');
    lines.push('        } else {');
    lines.push('          msg[key] = val;');
    lines.push('        }');
    lines.push('      }');
```

- [ ] **Step 3: Run the unit test**

Run: `cd packages/react-pebble && npx tsx test/config-checkboxgroup.test.ts`
Expected: `config-checkboxgroup.test.ts: PASS`.

- [ ] **Step 4: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-pkjs.ts
git commit -m "feat(pkjs): convert checkboxgroup string[] → int[] using __configOptions table"
```

---

## Task 6: Thread config keys to the plugin; extend `messageKeys` emission

**Files:**
- Modify: `packages/react-pebble/scripts/compile-to-piu.ts` (emit a new stderr diagnostic)
- Modify: `packages/react-pebble/src/compiler/index.ts` (parse the diagnostic)
- Modify: `packages/react-pebble/src/plugin/index.ts` (include config keys in `pebbleConfig.messageKeys`)

- [ ] **Step 1: Emit a new `configKeys=` diagnostic**

Find the stderr diagnostic block in `packages/react-pebble/scripts/compile-to-piu.ts` (around line 48-50 where `imageResources=` is emitted):

```ts
if (ir.imageResources.length > 0) {
  process.stderr.write('imageResources=' + JSON.stringify(ir.imageResources) + '\n');
}
```

Add immediately after:

```ts
if (ir.configInfo && ir.configInfo.keys.length > 0) {
  const exported = ir.configInfo.keys.map(k => ({
    key: k.key,
    type: k.type,
    ...(k.type === 'checkboxgroup' ? { size: (k.options ?? []).length } : {}),
  }));
  process.stderr.write('configKeys=' + JSON.stringify(exported) + '\n');
}
```

- [ ] **Step 2: Parse the diagnostic in `CompileResult`**

In `packages/react-pebble/src/compiler/index.ts`, extend `CompileResult`:

```ts
export interface CompileResult {
  // ... existing fields ...
  /** Config keys with their types and sizes (for messageKeys emission). */
  configKeys: Array<{ key: string; type: string; size?: number }>;
}
```

And in the `compileToPiu` function, after the existing diagnostic parses (around `hooksMatch`):

```ts
const configKeysMatch = diagnostics.match(/configKeys=(\[.*?\])/);
const configKeys: CompileResult['configKeys'] = configKeysMatch?.[1]
  ? JSON.parse(configKeysMatch[1])
  : [];
```

Then add `configKeys` to the returned object.

- [ ] **Step 3: Propagate through `ScaffoldOptions`**

In `packages/react-pebble/src/plugin/index.ts`:

Find the call site where `scaffoldPebbleProject(...)` is invoked (around L240-246). Add `configKeys: result.configKeys` to the options object.

Find the `ScaffoldOptions` interface and add:

```ts
  /** Config keys extracted from useConfiguration — used for messageKeys emission. */
  configKeys?: Array<{ key: string; type: string; size?: number }>;
```

- [ ] **Step 4: Extend `pebbleConfig.messageKeys`**

Find the messageKeys emission block around L495-498:

```ts
  // Rocky.js projects don't support custom messageKeys
  if (!isRocky) {
    pebbleConfig.messageKeys = options.messageKeys.length > 0 ? options.messageKeys : ['dummy'];
  }
```

Replace with:

```ts
  // Rocky.js projects don't support custom messageKeys
  if (!isRocky) {
    const msgKeys: string[] = [...options.messageKeys];
    for (const ck of options.configKeys ?? []) {
      const entry = ck.type === 'checkboxgroup' && ck.size
        ? `${ck.key}[${ck.size}]`
        : ck.key;
      // Avoid duplicates if a config key happens to share a name with a useMessage key
      if (!msgKeys.includes(entry)) msgKeys.push(entry);
    }
    pebbleConfig.messageKeys = msgKeys.length > 0 ? msgKeys : ['dummy'];
  }
```

- [ ] **Step 5: Extend the manifest test**

In `packages/react-pebble/test/manifest-fields.test.ts`, after the last existing test block, before `console.log('manifest-fields.test.ts: PASS')`, append:

```ts
// -----------------------------------------------------------------------
// Config keys flow into pebble.messageKeys
// -----------------------------------------------------------------------
{
  const { dir, pkg } = scaffold({
    configKeys: [
      { key: 'theme', type: 'color' },
      { key: 'metrics', type: 'checkboxgroup', size: 3 },
    ],
  });
  assert(
    Array.isArray(pkg.pebble.messageKeys),
    'messageKeys must be an array when config keys are present',
  );
  assert(
    pkg.pebble.messageKeys.includes('theme'),
    "Scalar config key 'theme' must appear in messageKeys",
  );
  assert(
    pkg.pebble.messageKeys.includes('metrics[3]'),
    "Checkboxgroup config key must appear as 'metrics[3]' in messageKeys",
  );
  cleanup(dir);
}
```

- [ ] **Step 6: Typecheck + run manifest test**

Run: `cd packages/react-pebble && npm run typecheck 2>&1 | tail -3`
Expected: clean.

Run: `cd packages/react-pebble && npx tsx test/manifest-fields.test.ts`
Expected: `manifest-fields.test.ts: PASS`.

- [ ] **Step 7: Commit**

```bash
cd packages/react-pebble
git add scripts/compile-to-piu.ts src/compiler/index.ts src/plugin/index.ts test/manifest-fields.test.ts
git commit -m "$(cat <<'EOF'
feat(plugin): include config keys in pebble.messageKeys

Scalar config keys become plain "key" entries; ConfigCheckboxGroup
entries become "key[N]" to allocate N consecutive AppMessage slots.
Threaded via a new configKeys stderr diagnostic from the compiler.
EOF
)"
```

---

## Task 7: Snapshot drift + verification sweep

**Files:**
- Update: `packages/react-pebble/test/snapshots-c/config-rich.c` (expected drift)
- Verify: `packages/react-pebble/test/snapshots/config-rich.js` (Alloy — review diff)
- Verify: `packages/react-pebble/test/snapshots-rocky/config-rich.js` (Rocky — expect no drift)

- [ ] **Step 1: Regenerate snapshots**

```bash
cd packages/react-pebble
npx tsx test/snapshot-test.ts --update 2>&1 | tail -3
npx tsx test/snapshot-test.ts --target rocky --update 2>&1 | tail -3
npx tsx test/snapshot-test.ts --target c --update 2>&1 | tail -3
```

- [ ] **Step 2: Inspect diffs**

Run: `cd /Users/ed/projects/react-pebble && git diff --stat packages/react-pebble/test/snapshots-c/ packages/react-pebble/test/snapshots-rocky/ packages/react-pebble/test/snapshots/`

Expected:
- `test/snapshots-c/config-rich.c` — changes: new `bool metrics[3]` in struct, 3 default lines, 3-iteration for-loop in inbox handler.
- `test/snapshots/config-rich.js` (Alloy) — verify: only changes if Moddable Message handling was indirectly touched; ideally zero diff. If non-trivial, investigate and explain.
- `test/snapshots-rocky/config-rich.js` — expect zero diff.

- [ ] **Step 3: Inspect the C diff in detail**

Run: `cd /Users/ed/projects/react-pebble && git diff packages/react-pebble/test/snapshots-c/config-rich.c | head -40`

Expected shape (approximate — `config-rich` uses a `metrics` checkboxgroup):

```diff
 typedef struct ClaySettings {
   ...
+  bool metrics[3];
 } ClaySettings;

 static void prv_default_settings(void) {
   ...
+  settings.metrics[0] = true;
+  settings.metrics[1] = true;
+  settings.metrics[2] = false;
 }

 static void prv_inbox_received(DictionaryIterator *iter, void *ctx) {
   ...
+  for (int i = 0; i < 3; i++) {
+    Tuple *t = dict_find(iter, MESSAGE_KEY_metrics + i);
+    if (t) settings.metrics[i] = t->value->int32 == 1;
+  }
   prv_save_settings();
```

- [ ] **Step 4: Run the full verification sweep**

```bash
cd packages/react-pebble
npm run typecheck
npm test 2>&1 | tail -3
npx tsx test/snapshot-test.ts --target rocky 2>&1 | tail -3
npx tsx test/snapshot-test.ts --target c 2>&1 | tail -3
npx tsx test/config-checkboxgroup.test.ts
npx tsx test/time-granularity.test.ts
npx tsx test/emit-c-appmessage.test.ts
npx tsx test/emit-pkjs-rocky.test.ts
npx tsx test/manifest-fields.test.ts
```

Expected: each reports PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ed/projects/react-pebble
git add packages/react-pebble/test/snapshots/ packages/react-pebble/test/snapshots-rocky/ packages/react-pebble/test/snapshots-c/
git commit -m "$(cat <<'EOF'
test: regenerate snapshots for checkboxgroup array-keys wire format
EOF
)"
```

---

## Self-Review

**Spec coverage.** Walking each spec section:
- *IR extension* → Task 1.
- *Analyzer* → Task 2.
- *Plugin messageKeys emission* → Task 6.
- *PKJS emitter* → Task 5.
- *C emitter* → Task 4.
- *Testing: new unit test* → Task 3 (red) + Tasks 4, 5 (green).
- *Testing: manifest-fields extension* → Task 6 Step 5.
- *Snapshot drift* → Task 7.
- *Non-goals* (perturbation analysis, Rocky/Alloy changes, useConfiguration runtime changes) — no task, intentional.
- *Risks: SDK key-suffix format* — resolved upstream via the waf-script inspection documented in the plan header; the wire format is pointer-arithmetic, so no probe needed.
- *Risks: pre-existing config-key/messageKeys mismatch* — Task 6 fixes this as a side-effect; acceptance criteria in the spec covers regression check via snapshots.

**Placeholder scan.** No TBDs/TODOs. Task 2 Step 2 references "inspect those cases in the same file" — that's a concrete discovery pointer, acceptable for code the plan can't fully enumerate without running. Each emitter extension shows the exact code block.

**Type consistency.** `IRConfigKey` extension (Task 1) is consistently referenced by Tasks 2–6. `configKeys: Array<{ key, type, size? }>` is consistent across `compile-to-piu.ts` → `CompileResult` → `ScaffoldOptions` → `pebbleConfig.messageKeys`. PKJS `__configOptions` lookup name is consistent across Task 3's test, Task 5's emission, and the exclusive-else branch chain. C pointer-arithmetic dict_find pattern (`MESSAGE_KEY_<key> + i`) is consistent between Task 3's assertion regex and Task 4's emitted code.

**Order.** Failing test (Task 3) precedes both emitter implementations. C emitter (Task 4) lands before PKJS (Task 5) so C assertions pass first — the test's ordering-by-assertion makes this concrete. Plugin messageKeys threading (Task 6) lands after emitters — it consumes `ir.configInfo.keys` via stderr diagnostic, independent of the emitter code changes. Snapshots (Task 7) last so the diff reflects the full implementation.
