# Rocky `useMessage` via native `postMessage` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `useMessage` work correctly on Rocky compile targets by emitting `Pebble.postMessage(obj)` on the phone side and reading `event.data[key]` without `JSON.parse` on the watch side.

**Architecture:** Branch at emit time in two files: `scripts/emit-pkjs.ts` and `scripts/emit-rocky.ts`. When the compile target is `rocky`, switch the wire format for the `useMessage` path from AppMessage (`Pebble.sendAppMessage({ [key]: JSON.stringify(data) })`) to Rocky-native postMessage (`Pebble.postMessage({ [key]: data })`). Alloy and C targets are untouched. Spec: `docs/superpowers/specs/2026-04-15-rocky-postmessage-design.md`.

**Tech Stack:** TypeScript (compiler/emitters), tsx (script runner), Node snapshot harness at `test/snapshot-test.ts`, no test runner dependency — tests are tsx scripts that assert and exit.

---

## Files

- **Modify:** `packages/react-pebble/scripts/emit-pkjs.ts` — accept `target` in options; branch the useMessage emit on `target === 'rocky'`.
- **Modify:** `packages/react-pebble/scripts/compile-to-piu.ts:140` — pass `target` through to `emitPKJS`.
- **Modify:** `packages/react-pebble/scripts/emit-rocky.ts:488-514` — drop `JSON.parse` unwrap in the `rocky.on('message', ...)` handler.
- **Create:** `packages/react-pebble/test/emit-pkjs-rocky.test.ts` — unit test that imports `emitPKJS` directly and asserts Rocky vs Alloy output shape.
- **Update (snapshot):** `packages/react-pebble/test/snapshots-rocky/async-list.js` — regenerate; expected diff is a one-line change on the `_data = ...` assignment.
- **Verify (no drift):** `packages/react-pebble/test/snapshots/*.js` (Alloy piu), `packages/react-pebble/test/snapshots-c/*.c` (C) — zero diff expected.

---

## Task 1: Thread `target` through to `emitPKJS`

**Files:**
- Modify: `packages/react-pebble/scripts/emit-pkjs.ts` (add `target` field to `PKJSOptions`)
- Modify: `packages/react-pebble/scripts/compile-to-piu.ts` (pass `target` when calling `emitPKJS`)

- [ ] **Step 1: Add `target` to `PKJSOptions` interface**

In `packages/react-pebble/scripts/emit-pkjs.ts`, extend the `PKJSOptions` interface (currently lines 14-25):

```ts
export interface PKJSOptions {
  /** The IR from the analyze phase */
  ir: CompilerIR;
  /** Configuration page URL (from useConfiguration) */
  configUrl?: string;
  /** Fetch URLs to proxy (from useFetch mockData patterns) */
  fetchUrls?: Array<{ key: string; url: string }>;
  /** AppSync keys (from useAppSync) */
  appSyncKeys?: string[];
  /** react-pebble hook names referenced in the entry source. */
  hooksUsed?: string[];
  /** Compile target — affects which phone-side API useMessage uses. */
  target?: 'alloy' | 'rocky' | 'c';
}
```

- [ ] **Step 2: Pass `target` from `compile-to-piu.ts`**

In `packages/react-pebble/scripts/compile-to-piu.ts:140`, change:

```ts
const pkjsCode = emitPKJS({ ir, configUrl, hooksUsed: hooksUsedList });
```

to:

```ts
const pkjsCode = emitPKJS({ ir, configUrl, hooksUsed: hooksUsedList, target });
```

The `target` const is already defined at line 29 (`const target = process.env.COMPILE_TARGET ?? 'alloy';`).

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-pkjs.ts scripts/compile-to-piu.ts
git commit -m "refactor: thread compile target into emitPKJS"
```

---

## Task 2: Write failing unit test for Rocky emitPKJS behavior

**Files:**
- Create: `packages/react-pebble/test/emit-pkjs-rocky.test.ts`

- [ ] **Step 1: Inspect CompilerIR shape**

Run: `head -80 packages/react-pebble/scripts/compiler-ir.ts`
Goal: confirm the `messageInfo` field shape (`key: string`, optional `mockDataSource`) before authoring the fixture.

- [ ] **Step 2: Write the test file**

Create `packages/react-pebble/test/emit-pkjs-rocky.test.ts`:

```ts
/**
 * test/emit-pkjs-rocky.test.ts — Unit test for Rocky-target PKJS emission.
 *
 * Verifies that when compile target is 'rocky', the useMessage path emits
 * Pebble.postMessage (native JS objects) instead of Pebble.sendAppMessage +
 * JSON.stringify wrapping (AppMessage dictionary protocol).
 *
 * Usage: npx tsx test/emit-pkjs-rocky.test.ts
 */

import { emitPKJS } from '../scripts/emit-pkjs.js';
import type { CompilerIR } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// Minimal IR with a useMessage call (no mock URL — simpler non-proxy path)
const ir: CompilerIR = {
  messageInfo: { key: 'items' },
} as unknown as CompilerIR;

// -----------------------------------------------------------------------
// Rocky target: should emit postMessage, no sendAppMessage/stringify
// -----------------------------------------------------------------------
const rockyOut = emitPKJS({ ir, target: 'rocky' });

assert(
  rockyOut.includes('Pebble.postMessage({ "items": '),
  'Rocky PKJS must emit Pebble.postMessage({ "items": ... })'
);
assert(
  !rockyOut.includes('JSON.stringify(yourData)'),
  'Rocky PKJS must not JSON.stringify the useMessage payload'
);
assert(
  !/Pebble\.sendAppMessage\(\s*\{\s*"items"/.test(rockyOut),
  'Rocky PKJS must not call sendAppMessage for the useMessage key'
);

// -----------------------------------------------------------------------
// Alloy target: must keep sendAppMessage + JSON.stringify (regression guard)
// -----------------------------------------------------------------------
const alloyOut = emitPKJS({ ir, target: 'alloy' });

assert(
  alloyOut.includes('Pebble.sendAppMessage'),
  'Alloy PKJS must still use sendAppMessage (not regressed)'
);
assert(
  alloyOut.includes('JSON.stringify(yourData)'),
  'Alloy PKJS must still JSON.stringify the useMessage payload'
);
assert(
  !alloyOut.includes('Pebble.postMessage('),
  'Alloy PKJS must not use postMessage'
);

// -----------------------------------------------------------------------
// Default (no target): treat as alloy (back-compat with existing callers)
// -----------------------------------------------------------------------
const defaultOut = emitPKJS({ ir });
assert(
  defaultOut.includes('Pebble.sendAppMessage'),
  'Default PKJS (no target) must behave like Alloy'
);

console.log('emit-pkjs-rocky.test.ts: PASS');
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `cd packages/react-pebble && npx tsx test/emit-pkjs-rocky.test.ts`
Expected: `FAIL: Rocky PKJS must emit Pebble.postMessage({ "items": ... })` — exits non-zero.

This failure proves the test is checking real behavior and the Rocky branch isn't implemented yet.

- [ ] **Step 4: Commit the failing test**

```bash
cd packages/react-pebble
git add test/emit-pkjs-rocky.test.ts
git commit -m "test: add failing Rocky postMessage test for emitPKJS"
```

---

## Task 3: Branch emitPKJS to use `Pebble.postMessage` on Rocky target

**Files:**
- Modify: `packages/react-pebble/scripts/emit-pkjs.ts` (useMessage emit blocks, currently lines 100-137)

- [ ] **Step 1: Edit the useMessage emit blocks**

In `packages/react-pebble/scripts/emit-pkjs.ts`, the current code (lines 100-137) handles two sub-cases: (a) `mi.mockDataSource` set → fetch-and-send proxy, (b) no mock source → informational stub.

Replace the entire block at lines 100-138 with:

```ts
  // If we have message info, emit the phone→watch send path.
  // Rocky uses native postMessage (raw JS objects); Alloy/C use AppMessage.
  if (ir.messageInfo) {
    const mi = ir.messageInfo;
    const rocky = options.target === 'rocky';
    if (mi.mockDataSource) {
      lines.push('');
      lines.push('  // Fetch data and send to watch');
      lines.push('  function fetchAndSend() {');
      lines.push(`    var url = ${JSON.stringify(mi.mockDataSource)};`);
      lines.push('    var xhr = new XMLHttpRequest();');
      lines.push('    xhr.onload = function() {');
      lines.push('      try {');
      lines.push('        var data = JSON.parse(this.responseText);');
      lines.push('        var msg = {};');
      if (rocky) {
        lines.push(`        msg["${mi.key}"] = data;`);
        lines.push('        Pebble.postMessage(msg);');
        lines.push('        console.log("Data posted to watch");');
      } else {
        lines.push(`        msg["${mi.key}"] = JSON.stringify(data);`);
        lines.push('        Pebble.sendAppMessage(msg, function() {');
        lines.push('          console.log("Data sent to watch successfully");');
        lines.push('        }, function(e) {');
        lines.push('          console.log("Failed to send data: " + JSON.stringify(e));');
        lines.push('        });');
      }
      lines.push('      } catch (e) {');
      lines.push('        console.log("Parse error: " + e);');
      lines.push('      }');
      lines.push('    };');
      lines.push('    xhr.onerror = function() {');
      lines.push('      console.log("Fetch error for " + url);');
      lines.push('    };');
      lines.push('    xhr.open("GET", url);');
      lines.push('    xhr.send();');
      lines.push('  }');
      lines.push('');
      lines.push('  fetchAndSend();');
    } else {
      // No mock data URL — emit a usage comment showing how to send data.
      lines.push('');
      lines.push(`  // Message key: "${mi.key}"`);
      lines.push('  // Send data to watch using:');
      if (rocky) {
        lines.push(`  //   Pebble.postMessage({ "${mi.key}": yourData });`);
      } else {
        lines.push(`  //   Pebble.sendAppMessage({ "${mi.key}": JSON.stringify(yourData) });`);
      }
    }
  }
```

- [ ] **Step 2: Run the unit test to confirm it passes**

Run: `cd packages/react-pebble && npx tsx test/emit-pkjs-rocky.test.ts`
Expected: `emit-pkjs-rocky.test.ts: PASS` — exits 0.

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-pkjs.ts
git commit -m "feat: emit Pebble.postMessage for useMessage on Rocky target"
```

---

## Task 4: Drop `JSON.parse` unwrap in the Rocky watch emitter

**Files:**
- Modify: `packages/react-pebble/scripts/emit-rocky.ts:488-514`

- [ ] **Step 1: Edit the `rocky.on('message', ...)` block**

In `packages/react-pebble/scripts/emit-rocky.ts`, find the block at lines 488-514:

```ts
  if (ir.messageInfo) {
    lines.push('// Phone → watch data');
    lines.push("rocky.on('message', function(event) {");
    lines.push('  var data = event.data;');
    lines.push(`  if (data && data['${ir.messageInfo.key}']) {`);
    lines.push('    try {');
    lines.push(`      _data = JSON.parse(data['${ir.messageInfo.key}']);`);

    // Update branch state if applicable
    if (ir.hasBranches) {
      for (const [si, branchList] of ir.branches) {
        if (branchList[0]?.isBaseline) {
          lines.push(`      s${si} = ${JSON.stringify(branchList[0].value)};`);
        }
      }
    }

    lines.push('      rocky.requestDraw();');
    lines.push("    } catch (e) { console.log('Parse error: ' + e.message); }");
    lines.push('  }');
    lines.push('});');
    lines.push('');

    // Post ready event to phone
    lines.push("rocky.postMessage({'ready': true});");
    lines.push('');
  }
```

Replace with:

```ts
  if (ir.messageInfo) {
    const key = ir.messageInfo.key;
    lines.push('// Phone → watch data (Rocky postMessage: native objects, no JSON.parse)');
    lines.push("rocky.on('message', function(event) {");
    lines.push('  var data = event.data;');
    lines.push(`  if (data && data['${key}'] !== undefined) {`);
    lines.push(`    _data = data['${key}'];`);

    // Update branch state if applicable
    if (ir.hasBranches) {
      for (const [si, branchList] of ir.branches) {
        if (branchList[0]?.isBaseline) {
          lines.push(`    s${si} = ${JSON.stringify(branchList[0].value)};`);
        }
      }
    }

    lines.push('    rocky.requestDraw();');
    lines.push('  }');
    lines.push('});');
    lines.push('');

    // Post ready event to phone
    lines.push("rocky.postMessage({'ready': true});");
    lines.push('');
  }
```

Key changes:
- Gate on `data[key] !== undefined` (allows `0`, `false`, `""`, `null` as valid payloads; the old `if (data[key])` was truthy-only and silently dropped those).
- Assign `_data = data[key]` directly — no `JSON.parse`.
- Remove the `try/catch` around the assignment — there's nothing left that can throw.
- Indent the `s${si}` and `rocky.requestDraw()` lines by one level (4 spaces, not 6), since we removed the `try {` wrapper.
- Update the comment to signal the change for readers.

- [ ] **Step 2: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Regenerate Rocky snapshots**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target rocky --update`
Expected: prints `UPDATED: async-list` (and possibly other `useMessage`-using examples like `transit-tracker`). All other Rocky examples should be unchanged.

- [ ] **Step 4: Inspect the snapshot diff**

Run: `cd packages/react-pebble && git diff test/snapshots-rocky/`

Expected diff shape for `async-list.js` (approximate):

```diff
-rocky.on('message', function(event) {
+// Phone → watch data (Rocky postMessage: native objects, no JSON.parse)
+rocky.on('message', function(event) {
   var data = event.data;
-  if (data && data['items']) {
-    try {
-      _data = JSON.parse(data['items']);
-      rocky.requestDraw();
-    } catch (e) { console.log('Parse error: ' + e.message); }
+  if (data && data['items'] !== undefined) {
+    _data = data['items'];
+    rocky.requestDraw();
   }
 });
```

If any Rocky example *without* `useMessage` shows a diff, something is wrong — investigate before continuing. Also confirm no Alloy (`test/snapshots/`) or C (`test/snapshots-c/`) diffs appear (those dirs should not be touched by the `--target rocky` update run, but double-check with `git status`).

- [ ] **Step 5: Commit**

```bash
cd packages/react-pebble
git add scripts/emit-rocky.ts test/snapshots-rocky/
git commit -m "feat: drop JSON.parse in Rocky watch-side useMessage handler"
```

---

## Task 5: Verify Alloy and C snapshots are unchanged

**Files:**
- Verify: `packages/react-pebble/test/snapshots/` (Alloy)
- Verify: `packages/react-pebble/test/snapshots-c/` (C)

- [ ] **Step 1: Run Alloy snapshots**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts`
Expected: all PASS, zero diffs. (This is the default target — no flags.)

- [ ] **Step 2: Run C snapshots**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target c`
Expected: all PASS, zero diffs.

- [ ] **Step 3: Run Rocky snapshots (regression confirmation)**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target rocky`
Expected: all PASS, zero diffs (snapshots were just regenerated in Task 4).

- [ ] **Step 4: Run the emitPKJS unit test**

Run: `cd packages/react-pebble && npx tsx test/emit-pkjs-rocky.test.ts`
Expected: `emit-pkjs-rocky.test.ts: PASS`.

- [ ] **Step 5: Run the full test script**

Run: `cd packages/react-pebble && npm test`
Expected: typecheck passes, snapshot run passes (default target = Alloy). The bespoke Rocky tests must be invoked separately today; extending `npm test` to include them is out of scope for this plan.

No commit in this task — it's pure verification.

---

## Task 6: Device smoke test

**Files:** none modified — this is manual verification.

- [ ] **Step 1: Confirm Rocky deploy path exists for `async-list`**

Run: `cd packages/react-pebble && cat examples/async-list.tsx | head -10`
Also inspect any Rocky-specific vite config or deploy script:

Run: `ls scripts/ | grep -i rocky`
Run: `cat scripts/deploy-basalt.sh`

If there's no turn-key path to deploy `async-list` as a Rocky project, this step becomes: skip the smoke test and flag a follow-up task to add Rocky-target deploy automation. Document the skip in the commit message.

- [ ] **Step 2: Deploy to Rocky emulator**

If the deploy path exists, run it (the exact command depends on what Step 1 revealed — likely something along the lines of `COMPILE_TARGET=rocky PEBBLE_PLATFORM=basalt ./scripts/deploy-basalt.sh async-list`).

Expected: emulator launches, the async-list watchface displays the mocked `items` list.

- [ ] **Step 3: Check logs for parse errors**

Run: `pebble emu-log` (or tail the deploy log) while the app runs for ~10 seconds.

Expected: no `Parse error:` lines. The `try/catch` that previously wrapped the `JSON.parse` is gone, so any residual parse error would now crash the draw loop — visually obvious on the emulator screenshot.

- [ ] **Step 4: Screenshot for the record**

Run: `pebble screenshot /tmp/rocky-async-list.png`
Inspect the PNG — the mocked list items (`["Fix bug", "Write tests", ...]` or whatever `mockData` contains) should render.

- [ ] **Step 5: Document and commit**

No code changes in this task. If the smoke test passed, write a short note in the PR description. If the smoke test was skipped (no Rocky deploy automation), flag it as a follow-up:

```bash
# Only run if notes were added — otherwise skip this commit
```

---

## Self-Review Notes

- **Spec coverage:** Each spec section is covered — file-level changes (Tasks 1, 3, 4), testing (Tasks 2, 5, 6), non-goals explicitly carried through (no `useAppSync`/`useFetch` or watch→phone send surface in any task).
- **Placeholder scan:** No TBDs. The only conditional step is Task 6 Step 1, which is a discovery step whose fallback is clearly documented (skip + follow-up).
- **Type consistency:** `target?: 'alloy' | 'rocky' | 'c'` matches the existing `COMPILE_TARGET` env values in `compile-to-piu.ts:29`. `ir.messageInfo.key` is referenced consistently.
- **Scope:** Single-plan scope confirmed — 6 tasks, five files touched, one new file, one snapshot regen. All tasks produce atomic commits.
