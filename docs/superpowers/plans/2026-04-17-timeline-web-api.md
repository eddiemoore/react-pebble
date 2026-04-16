# Timeline Web API Server-Side Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `react-pebble/timeline` subpath export with five async functions (`pushUserPin`, `removeUserPin`, `pushSharedPin`, `removeSharedPin`, `pushUserGlance`) that call the Pebble Timeline public web API from Node/Edge Functions, plus a `TimelineApiError` class.

**Architecture:** One new file at `src/timeline/index.ts` re-exporting existing pin/glance types and implementing five thin `fetch()` wrappers. A new build entry + package.json exports entry wires it into `react-pebble/timeline`. Unit test mocks `globalThis.fetch` to assert HTTP method/path/headers/body without hitting the network.

**Tech Stack:** TypeScript, Node 18+ `fetch()`, Vite lib build (ESM + CJS), tsx test runner.

**Spec:** `docs/superpowers/specs/2026-04-17-timeline-web-api-design.md`.

---

## Files

- **Create** `packages/react-pebble/src/timeline/index.ts` — the module.
- **Modify** `packages/react-pebble/package.json` — add `"./timeline"` exports entry.
- **Modify** `packages/react-pebble/vite.config.lib.js` — add `timeline` build entry.
- **Create** `packages/react-pebble/test/timeline-api.test.ts` — unit test.
- **Modify** `README.md` — add Timeline Web API section.

---

## Task 1: Failing unit test

**Files:**
- Create: `packages/react-pebble/test/timeline-api.test.ts`

- [ ] **Step 1: Create the test file**

Create `packages/react-pebble/test/timeline-api.test.ts`:

```ts
/**
 * test/timeline-api.test.ts — Timeline Web API server-side module.
 *
 * Mocks globalThis.fetch to assert HTTP method/path/headers/body for each
 * of the five exported functions, plus error handling and baseUrl override.
 *
 * Usage: npx tsx test/timeline-api.test.ts
 */

import {
  pushUserPin,
  removeUserPin,
  pushSharedPin,
  removeSharedPin,
  pushUserGlance,
  TimelineApiError,
} from '../src/timeline/index.js';
import type { TimelinePin, AppGlanceSlice } from '../src/timeline/index.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// Capture fetch calls
interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let lastFetch: FetchCall | null = null;
let mockStatus = 200;
let mockStatusText = 'OK';
let mockBody = '';

const originalFetch = globalThis.fetch;

function installMock() {
  (globalThis as any).fetch = async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) headers[k] = v;
      } else {
        Object.assign(headers, init.headers);
      }
    }
    lastFetch = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    return {
      ok: mockStatus >= 200 && mockStatus < 300,
      status: mockStatus,
      statusText: mockStatusText,
      text: async () => mockBody,
    } as Response;
  };
}

function restoreMock() {
  globalThis.fetch = originalFetch;
  lastFetch = null;
  mockStatus = 200;
  mockStatusText = 'OK';
  mockBody = '';
}

const testPin: TimelinePin = {
  id: 'test-pin-1',
  time: 1700000000000,
  layout: { type: 'genericPin', title: 'Test Pin' },
};

const testSlices: AppGlanceSlice[] = [
  { subtitle: 'Hello from server' },
];

// -----------------------------------------------------------------------
// pushUserPin
// -----------------------------------------------------------------------
installMock();
await pushUserPin('tok123', testPin);
assert(lastFetch!.method === 'PUT', 'pushUserPin method must be PUT');
assert(
  lastFetch!.url === 'https://timeline-api.rebble.io/v1/user/pins/test-pin-1',
  `pushUserPin URL must match, got ${lastFetch!.url}`,
);
assert(lastFetch!.headers['X-User-Token'] === 'tok123', 'pushUserPin must send X-User-Token');
assert(lastFetch!.headers['Content-Type'] === 'application/json', 'pushUserPin must send Content-Type');
assert(lastFetch!.body === JSON.stringify(testPin), 'pushUserPin body must be JSON pin');
restoreMock();

// -----------------------------------------------------------------------
// removeUserPin
// -----------------------------------------------------------------------
installMock();
await removeUserPin('tok123', 'test-pin-1');
assert(lastFetch!.method === 'DELETE', 'removeUserPin method must be DELETE');
assert(
  lastFetch!.url === 'https://timeline-api.rebble.io/v1/user/pins/test-pin-1',
  `removeUserPin URL must match, got ${lastFetch!.url}`,
);
assert(lastFetch!.headers['X-User-Token'] === 'tok123', 'removeUserPin must send X-User-Token');
assert(lastFetch!.body === undefined || lastFetch!.body === '', 'removeUserPin must have no body');
restoreMock();

// -----------------------------------------------------------------------
// pushSharedPin
// -----------------------------------------------------------------------
installMock();
await pushSharedPin('apikey-abc', testPin, ['sports', 'scores']);
assert(lastFetch!.method === 'PUT', 'pushSharedPin method must be PUT');
assert(
  lastFetch!.url === 'https://timeline-api.rebble.io/v1/shared/pins/test-pin-1',
  `pushSharedPin URL must match, got ${lastFetch!.url}`,
);
assert(lastFetch!.headers['X-API-Key'] === 'apikey-abc', 'pushSharedPin must send X-API-Key');
assert(lastFetch!.headers['X-Pin-Topics'] === 'sports,scores', 'pushSharedPin must send X-Pin-Topics');
assert(lastFetch!.body === JSON.stringify(testPin), 'pushSharedPin body must be JSON pin');
restoreMock();

// -----------------------------------------------------------------------
// removeSharedPin
// -----------------------------------------------------------------------
installMock();
await removeSharedPin('apikey-abc', 'test-pin-1', ['sports']);
assert(lastFetch!.method === 'DELETE', 'removeSharedPin method must be DELETE');
assert(
  lastFetch!.url === 'https://timeline-api.rebble.io/v1/shared/pins/test-pin-1',
  `removeSharedPin URL must match, got ${lastFetch!.url}`,
);
assert(lastFetch!.headers['X-API-Key'] === 'apikey-abc', 'removeSharedPin must send X-API-Key');
assert(lastFetch!.headers['X-Pin-Topics'] === 'sports', 'removeSharedPin must send X-Pin-Topics');
restoreMock();

// -----------------------------------------------------------------------
// pushUserGlance
// -----------------------------------------------------------------------
installMock();
await pushUserGlance('tok456', testSlices);
assert(lastFetch!.method === 'PUT', 'pushUserGlance method must be PUT');
assert(
  lastFetch!.url === 'https://timeline-api.rebble.io/v1/user/glance',
  `pushUserGlance URL must match, got ${lastFetch!.url}`,
);
assert(lastFetch!.headers['X-User-Token'] === 'tok456', 'pushUserGlance must send X-User-Token');
assert(
  lastFetch!.body === JSON.stringify({ slices: testSlices }),
  'pushUserGlance body must wrap slices in { slices }',
);
restoreMock();

// -----------------------------------------------------------------------
// baseUrl override
// -----------------------------------------------------------------------
installMock();
await pushUserPin('tok123', testPin, { baseUrl: 'http://localhost:9999' });
assert(
  lastFetch!.url === 'http://localhost:9999/v1/user/pins/test-pin-1',
  `baseUrl override must land in URL, got ${lastFetch!.url}`,
);
restoreMock();

// -----------------------------------------------------------------------
// Error handling — non-2xx throws TimelineApiError
// -----------------------------------------------------------------------
installMock();
mockStatus = 401;
mockStatusText = 'Unauthorized';
mockBody = '{"error":"invalid token"}';
let caught: TimelineApiError | null = null;
try {
  await pushUserPin('bad-token', testPin);
} catch (e) {
  if (e instanceof TimelineApiError) caught = e;
}
assert(caught !== null, 'Non-2xx must throw TimelineApiError');
assert(caught!.status === 401, `Error status must be 401, got ${caught!.status}`);
assert(caught!.statusText === 'Unauthorized', 'Error statusText must match');
assert(caught!.body === '{"error":"invalid token"}', 'Error body must match');
restoreMock();

console.log('timeline-api.test.ts: PASS');
```

- [ ] **Step 2: Run the test — expect it to fail**

Run: `cd packages/react-pebble && npx tsx test/timeline-api.test.ts 2>&1 | head -5`
Expected: import error — the `src/timeline/index.ts` module doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
cd packages/react-pebble
git add test/timeline-api.test.ts
git commit -m "test: add failing Timeline Web API tests"
```

---

## Task 2: Implement the module

**Files:**
- Create: `packages/react-pebble/src/timeline/index.ts`

- [ ] **Step 1: Create the module**

Create `packages/react-pebble/src/timeline/index.ts`:

```ts
/**
 * src/timeline/index.ts — Timeline Web API server-side module.
 *
 * Five async functions that call the Pebble Timeline public web API from
 * Node / Edge Functions. Uses globalThis.fetch (Node 18+).
 *
 * Usage:
 *   import { pushUserPin, TimelineApiError } from 'react-pebble/timeline';
 *   await pushUserPin(userToken, pin);
 */

// Re-export pin types so consumers don't need a separate import path.
export type {
  TimelinePin,
  TimelinePinLayout,
  TimelinePinLayoutType,
  TimelineColor,
  TimelinePinAction,
  TimelinePinActionHttp,
  TimelinePinActionOpenWatchApp,
  TimelinePinActionRemove,
  TimelinePinReminder,
  TimelinePinNotification,
} from '../hooks/useTimeline.js';

export type { AppGlanceSlice } from '../hooks/useAppGlance.js';

import type { TimelinePin } from '../hooks/useTimeline.js';
import type { AppGlanceSlice } from '../hooks/useAppGlance.js';

const DEFAULT_BASE_URL = 'https://timeline-api.rebble.io';

export interface TimelineOptions {
  baseUrl?: string;
}

export class TimelineApiError extends Error {
  status: number;
  statusText: string;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`Timeline API ${status} ${statusText}: ${body}`);
    this.name = 'TimelineApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

async function request(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<void> {
  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new TimelineApiError(res.status, res.statusText, text);
  }
}

export async function pushUserPin(
  userToken: string,
  pin: TimelinePin,
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request('PUT', `${base}/v1/user/pins/${encodeURIComponent(pin.id)}`, {
    'Content-Type': 'application/json',
    'X-User-Token': userToken,
  }, JSON.stringify(pin));
}

export async function removeUserPin(
  userToken: string,
  pinId: string,
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request('DELETE', `${base}/v1/user/pins/${encodeURIComponent(pinId)}`, {
    'X-User-Token': userToken,
  });
}

export async function pushSharedPin(
  apiKey: string,
  pin: TimelinePin,
  topics: string[],
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request('PUT', `${base}/v1/shared/pins/${encodeURIComponent(pin.id)}`, {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-Pin-Topics': topics.join(','),
  }, JSON.stringify(pin));
}

export async function removeSharedPin(
  apiKey: string,
  pinId: string,
  topics: string[],
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request('DELETE', `${base}/v1/shared/pins/${encodeURIComponent(pinId)}`, {
    'X-API-Key': apiKey,
    'X-Pin-Topics': topics.join(','),
  });
}

export async function pushUserGlance(
  userToken: string,
  slices: AppGlanceSlice[],
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request('PUT', `${base}/v1/user/glance`, {
    'Content-Type': 'application/json',
    'X-User-Token': userToken,
  }, JSON.stringify({ slices }));
}
```

- [ ] **Step 2: Run the test**

Run: `cd packages/react-pebble && npx tsx test/timeline-api.test.ts`
Expected: `timeline-api.test.ts: PASS`.

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd packages/react-pebble
git add src/timeline/index.ts
git commit -m "feat: add react-pebble/timeline server-side module"
```

---

## Task 3: Wire the build entry + package.json exports

**Files:**
- Modify: `packages/react-pebble/vite.config.lib.js:26-32`
- Modify: `packages/react-pebble/package.json` (exports map)

- [ ] **Step 1: Add build entry**

In `packages/react-pebble/vite.config.lib.js`, find the `entry` object (lines 26-33):

```js
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        hooks: resolve(__dirname, 'src/hooks/index.ts'),
        components: resolve(__dirname, 'src/components/index.tsx'),
        compiler: resolve(__dirname, 'src/compiler/index.ts'),
        plugin: resolve(__dirname, 'src/plugin/index.ts'),
        config: resolve(__dirname, 'src/config/index.ts'),
        platform: resolve(__dirname, 'src/platform.ts'),
      },
```

Add after the `platform` line:

```js
        timeline: resolve(__dirname, 'src/timeline/index.ts'),
```

- [ ] **Step 2: Add package.json exports entry**

In `packages/react-pebble/package.json`, find the `"exports"` object. After the `"./config"` entry, add:

```json
    "./timeline": {
      "types": "./dist/lib/src/timeline/index.d.ts",
      "import": "./dist/lib/timeline.js",
      "require": "./dist/lib/timeline.cjs"
    }
```

Follow the same format as the existing entries (e.g. `"./config"`).

- [ ] **Step 3: Verify the lib builds**

Run: `cd packages/react-pebble && npm run build 2>&1 | tail -10`
Expected: build succeeds with `timeline.js` + `timeline.cjs` in `dist/lib/`.

Run: `ls dist/lib/timeline.* dist/lib/src/timeline/ 2>/dev/null`
Expected: `timeline.js`, `timeline.cjs`, and `src/timeline/index.d.ts` exist.

- [ ] **Step 4: Run existing test suite to confirm no regression**

Run: `cd packages/react-pebble && npm test 2>&1 | tail -3`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd packages/react-pebble
git add vite.config.lib.js package.json
git commit -m "build: add react-pebble/timeline subpath export + build entry"
```

---

## Task 4: README documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the Timeline Web API section**

In `README.md`, find the section before `## What the compiler detects automatically` (around line 418 after the existing Auto-inferred capabilities / Plugin manifest options tables). Insert before that section:

```markdown
### Timeline Web API (server-side)

Push timeline pins and app glances from a backend (Node, Edge Functions, Deno, Bun) without going through the watch or PKJS:

\`\`\`ts
import { pushUserPin, pushSharedPin, pushUserGlance, TimelineApiError } from 'react-pebble/timeline';
import type { TimelinePin, AppGlanceSlice } from 'react-pebble/timeline';

// Push a pin to one user's timeline (auth: X-User-Token from useTimelineToken)
const pin: TimelinePin = {
  id: 'meeting-123',
  time: Date.now() + 3600_000,
  layout: { type: 'calendarPin', title: 'Team standup', locationName: 'Zoom' },
};
await pushUserPin(userToken, pin);

// Broadcast a shared pin to all subscribers of a topic (auth: developer API key)
await pushSharedPin(apiKey, pin, ['team-meetings']);

// Set the app's launcher glance
const slices: AppGlanceSlice[] = [{ subtitle: 'Next: Team standup' }];
await pushUserGlance(userToken, slices);
\`\`\`

| Function | Method | Path | Auth header |
|----------|--------|------|-------------|
| `pushUserPin(token, pin)` | PUT | `/v1/user/pins/:id` | `X-User-Token` |
| `removeUserPin(token, id)` | DELETE | `/v1/user/pins/:id` | `X-User-Token` |
| `pushSharedPin(key, pin, topics)` | PUT | `/v1/shared/pins/:id` | `X-API-Key` + `X-Pin-Topics` |
| `removeSharedPin(key, id, topics)` | DELETE | `/v1/shared/pins/:id` | `X-API-Key` + `X-Pin-Topics` |
| `pushUserGlance(token, slices)` | PUT | `/v1/user/glance` | `X-User-Token` |

All functions accept an optional trailing `{ baseUrl }` to override the default `https://timeline-api.rebble.io`. Non-2xx responses throw `TimelineApiError` with `status`, `statusText`, and `body`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Timeline Web API section to README"
```

---

## Task 5: Full verification sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Typecheck**

Run: `cd packages/react-pebble && npm run typecheck`
Expected: clean.

- [ ] **Step 2: Full Alloy test suite**

Run: `cd packages/react-pebble && npm test 2>&1 | tail -3`
Expected: 59 passed.

- [ ] **Step 3: Rocky + C snapshots**

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target rocky 2>&1 | tail -3`
Expected: 50 passed.

Run: `cd packages/react-pebble && npx tsx test/snapshot-test.ts --target c 2>&1 | tail -3`
Expected: 50 passed.

- [ ] **Step 4: All unit tests**

```bash
cd packages/react-pebble
npx tsx test/timeline-api.test.ts
npx tsx test/config-checkboxgroup.test.ts
npx tsx test/time-granularity.test.ts
npx tsx test/emit-c-appmessage.test.ts
npx tsx test/emit-pkjs-rocky.test.ts
npx tsx test/manifest-fields.test.ts
```

Expected: each reports `PASS`.

- [ ] **Step 5: Verify build output**

Run: `cd packages/react-pebble && npm run build 2>&1 | tail -5 && ls dist/lib/timeline.* dist/lib/src/timeline/ 2>/dev/null`
Expected: `timeline.js`, `timeline.cjs`, `src/timeline/index.d.ts` exist.

No commit — this task is pure verification.

---

## Self-Review

**Spec coverage.** Walking each section:
- *Subpath export at `react-pebble/timeline`* → Task 3.
- *Five functions + TimelineApiError + re-exported types* → Task 2.
- *HTTP details (method/path/headers/body per function)* → Task 1 assertions + Task 2 implementation.
- *Error handling (non-2xx throws)* → Task 1 assertion block + Task 2 `request()` helper.
- *`baseUrl` override* → Task 1 assertion + Task 2's `options?.baseUrl` parameter.
- *Testing with fetch mock* → Task 1.
- *README docs* → Task 4.
- *package.json + vite build entry* → Task 3.
- *Non-goals (retry, getTimelineToken, subscriptions, streaming)* — no task, intentional.

**Placeholder scan.** No TBDs/TODOs. Every code block is complete. Test uses concrete data (`'tok123'`, `'test-pin-1'`, known pin JSON).

**Type consistency.** `TimelinePin` from `../hooks/useTimeline.js` is re-exported and used consistently in Task 1's test fixture and Task 2's function signatures. `AppGlanceSlice` from `../hooks/useAppGlance.js` same. `TimelineApiError` class shape is identical between Task 2's implementation and Task 1's assertions. `TimelineOptions` interface is consistent (Task 2 defines it, Task 1's `baseUrl` test exercises it). Header casing: `request()` sends `'X-User-Token'` (capitalized), and the mock's `Headers` normalizes to lowercase — the test asserts `lastFetch!.headers['X-User-Token']` (lowercase), matching how the `Headers` class works under the hood. If the mock uses a plain object (`Object.assign(headers, init.headers)`) instead of `Headers`, casing stays as-passed: the test mock handles both paths but the plain-object branch preserves capitalization. Task 1's mock assigns directly via `Object.assign(headers, init.headers)`, so headers stay as `X-User-Token`. The assertions in the test need to match the case used in the implementation. **Fix applied:** assertions use lowercase form `'x-user-token'` but the mock's Object.assign path preserves capitalization. This would cause a test failure. Updating the test assertions to use the original casing: `'X-User-Token'`, `'X-API-Key'`, `'X-Pin-Topics'`, `'Content-Type'`. Let me fix the plan's test code.

Actually — re-reading the mock: it checks `if (init.headers instanceof Headers)` — which only fires if the implementation passes a `Headers` instance. The implementation uses plain objects (`{ 'Content-Type': ..., 'X-User-Token': ... }`), so the mock hits the `else Object.assign(headers, init.headers)` branch, which preserves the original casing. So assertions should match the casing in the implementation: `'X-User-Token'`, `'Content-Type'`, `'X-API-Key'`, `'X-Pin-Topics'`.

I've already written the test with lowercase. This needs to be corrected in the plan. Let me note this: **the test file in Task 1 must use the original header casing, not lowercase.** I'll update.

Wait, re-reading the test... I used `lastFetch!.headers['X-User-Token']` (lowercase) but the mock stores them as-is from the plain object. That mismatch WILL fail. The plan itself shows the wrong casing. Since the plan is already written, I'll note this as a known fix needed at implementation time — the engineer should use `'X-User-Token'` in assertions, not `'x-user-token'`.

Actually I can just fix the plan now before saving. Let me correct the test in the plan.

Hmm, the plan is already written to the file. Let me edit it.
