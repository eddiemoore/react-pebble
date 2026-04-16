# Timeline Web API server-side module

**Date:** 2026-04-17
**Status:** Draft
**Scope:** Add a `react-pebble/timeline` subpath export with five async functions that call the Pebble Timeline public web API from Node/Edge Functions. Reuses the existing `TimelinePin` and `AppGlanceSlice` types. No watch-side or compiler changes.

## Background

`useTimeline()` pushes pins from the watch side by relaying through PKJS to `https://timeline-api.rebble.io/v1/user/pins/:id`. That covers watch-initiated pin push. But the canonical timeline flow — a backend pushing pins on behalf of a user or broadcasting to subscribers — has no react-pebble surface today. A developer who wants to push weather forecasts, sports scores, or calendar events from a server must hand-roll the HTTP calls and pin JSON.

The pin types (`TimelinePin`, `TimelinePinLayout`, `TimelinePinAction`, `TimelinePinReminder`, `TimelinePinNotification`) and the `AppGlanceSlice` type are already defined and exported. The server module reuses them as-is.

## API

### Subpath export

```ts
import {
  pushUserPin, removeUserPin,
  pushSharedPin, removeSharedPin,
  pushUserGlance,
  TimelineApiError,
} from 'react-pebble/timeline';

// Types re-exported for convenience:
import type {
  TimelinePin, TimelinePinLayout, TimelinePinLayoutType,
  TimelinePinAction, TimelinePinActionHttp, TimelinePinActionOpenWatchApp,
  TimelinePinActionRemove, TimelinePinReminder, TimelinePinNotification,
  AppGlanceSlice,
} from 'react-pebble/timeline';
```

### Function signatures

```ts
interface TimelineOptions {
  /** Override the base URL (default: 'https://timeline-api.rebble.io'). */
  baseUrl?: string;
}

// User pins — auth via X-User-Token (obtained from useTimelineToken on the
// watch, or Pebble.getTimelineToken in PKJS, then forwarded to the server).
async function pushUserPin(
  userToken: string,
  pin: TimelinePin,
  options?: TimelineOptions,
): Promise<void>;

async function removeUserPin(
  userToken: string,
  pinId: string,
  options?: TimelineOptions,
): Promise<void>;

// Shared pins — auth via X-API-Key (developer API key from Rebble).
// topics: array of topic strings the pin should be delivered to.
async function pushSharedPin(
  apiKey: string,
  pin: TimelinePin,
  topics: string[],
  options?: TimelineOptions,
): Promise<void>;

async function removeSharedPin(
  apiKey: string,
  pinId: string,
  topics: string[],
  options?: TimelineOptions,
): Promise<void>;

// AppGlance — auth via X-User-Token.
async function pushUserGlance(
  userToken: string,
  slices: AppGlanceSlice[],
  options?: TimelineOptions,
): Promise<void>;
```

### Error handling

```ts
class TimelineApiError extends Error {
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
```

All five functions resolve on 2xx; throw `TimelineApiError` on any other status. Callers handle retries.

### HTTP details

| Function | Method | Path | Headers |
|----------|--------|------|---------|
| `pushUserPin` | `PUT` | `/v1/user/pins/<pin.id>` | `Content-Type: application/json`, `X-User-Token: <token>` |
| `removeUserPin` | `DELETE` | `/v1/user/pins/<pinId>` | `X-User-Token: <token>` |
| `pushSharedPin` | `PUT` | `/v1/shared/pins/<pin.id>` | `Content-Type: application/json`, `X-API-Key: <key>`, `X-Pin-Topics: <topics.join(',')>` |
| `removeSharedPin` | `DELETE` | `/v1/shared/pins/<pinId>` | `X-API-Key: <key>`, `X-Pin-Topics: <topics.join(',')>` |
| `pushUserGlance` | `PUT` | `/v1/user/glance` | `Content-Type: application/json`, `X-User-Token: <token>` |

Body for PUT requests: `JSON.stringify(pin)` for pins, `JSON.stringify({ slices })` for glance.

Uses `globalThis.fetch` (Node 18+ built-in). No external dependencies.

Default `baseUrl`: `https://timeline-api.rebble.io`.

## Files

| File | Action |
|------|--------|
| `src/timeline/index.ts` | **Create.** Five functions + `TimelineApiError` + re-exports of pin/glance types. |
| `package.json` | **Modify.** Add `"./timeline"` exports entry (types/import/require). |
| `vite.config.lib.js` | **Modify.** Add `timeline` build entry. |
| `test/timeline-api.test.ts` | **Create.** Mock `globalThis.fetch`, assert HTTP method/path/headers/body for each function; assert error throwing on non-2xx; assert baseUrl override. |
| `README.md` | **Modify.** Add "Timeline Web API" section with usage examples. |

## Testing

Unit test `test/timeline-api.test.ts` mocks `globalThis.fetch` (save and restore around each test) and asserts:

1. `pushUserPin(token, pin)` → `PUT /v1/user/pins/<id>`, headers include `X-User-Token`, body is `JSON.stringify(pin)`.
2. `removeUserPin(token, id)` → `DELETE /v1/user/pins/<id>`, headers include `X-User-Token`, no body.
3. `pushSharedPin(apiKey, pin, ['sports', 'scores'])` → `PUT /v1/shared/pins/<id>`, headers include `X-API-Key` + `X-Pin-Topics: sports,scores`.
4. `removeSharedPin(apiKey, id, ['sports'])` → `DELETE /v1/shared/pins/<id>`, correct headers.
5. `pushUserGlance(token, slices)` → `PUT /v1/user/glance`, body is `JSON.stringify({ slices })`.
6. Non-2xx (e.g. 401) throws `TimelineApiError` with matching `status`, `statusText`, `body`.
7. `baseUrl` override: `pushUserPin(token, pin, { baseUrl: 'http://localhost:9999' })` hits the overridden URL.

No snapshot changes. No compiler/emitter changes. Pure runtime module.

## Non-goals

- Retry / backoff on 429 or 5xx.
- Server-side `getTimelineToken` (PKJS-only API; server receives the token via its own auth flow).
- Topic management (subscribe/unsubscribe) — watch-side only (`useTimelineSubscriptions`).
- Streaming or long-polling.

## Risks

- **Rebble API availability.** The `timeline-api.rebble.io` endpoint may be unreliable or rate-limited. The `baseUrl` override + `TimelineApiError.status` surface give callers enough to adapt. Not our problem to solve with retry logic.
- **Pin JSON spec drift.** If Rebble adds new layout types or fields, the existing `TimelinePinLayout` has `[key: string]: unknown` to absorb them. New `TimelinePinLayoutType` union members would need a type update.

## Related work

- `useTimeline()` (`src/hooks/useTimeline.ts`) — watch-side pin push via PKJS relay. The types it defines are reused by this module.
- `useAppGlance()` (`src/hooks/useAppGlance.ts`) — watch-side glance update. The `AppGlanceSlice` type is reused.
- `useTimelineToken()` / `useTimelineSubscriptions()` — watch-side token + subscription management.
- `emit-pkjs.ts:331-370` — PKJS `_rpTimelinePush` / `_rpTimelineRemove` helpers that HTTP-PUT/DELETE to the same endpoints.

This is gap #5 of five from the developer.repebble.com docs audit.
