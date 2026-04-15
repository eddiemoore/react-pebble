# Rocky `useMessage` via native `postMessage`

**Date:** 2026-04-15
**Status:** Draft
**Scope:** Fix `useMessage` on the Rocky.js compile target so phone→watch data uses Rocky's native `postMessage`/`message` event pair with raw JS objects, instead of routing through the AppMessage dictionary protocol.

## Background

`useMessage` compiles correctly on Alloy (piu) and C targets, where the compiler emits an AppMessage-backed data path: phone calls `Pebble.sendAppMessage({ [key]: JSON.stringify(data) }, ack, nack)`, watch receives via the AppMessage inbox, and the payload is unwrapped with `JSON.parse`.

On Rocky targets the compiler already scaffolds `rocky.on('message', ...)` on the watch side, but the companion PKJS code in `scripts/emit-pkjs.ts` still calls `Pebble.sendAppMessage(...)`. This produces two problems:

1. Rocky projects deliberately skip `messageKeys` registration in `package.json` (`scripts/plugin/index.ts:456` guards on this). Without registered keys, `Pebble.sendAppMessage` can't encode the payload reliably.
2. The AppMessage dictionary protocol requires `JSON.stringify` wrapping because dicts can't hold nested objects. Rocky's `postMessage` passes arbitrary JS objects natively — the stringify/parse round-trip is pure overhead.

The result is that `useMessage` on Rocky is effectively broken today. The `async-list` Rocky snapshot compiles but the emitted PKJS + watch code do not actually interoperate.

## Goal

Rocky target uses the native Rocky postMessage protocol end-to-end for `useMessage`. No change to the public API: users keep writing `useMessage({ key, mockData })` exactly as today.

## Non-goals

- `useAppSync`, `useFetch` phone-proxy, and identity-token forwarding (`_rpTokens`, `_rpTokTL`, `_rpTLSubs`) continue to use AppMessage on Rocky. These are separate gaps tracked outside this spec.
- No new watch→phone send hook (`useMessageSender` or equivalent).
- No connection-lifecycle hook for `postmessageconnected` / `postmessagedisconnected` / `postmessageerror`.
- No ACK/NACK callback surface on `useMessage`.
- No support for multiple concurrent `useMessage` calls per app — the compiler IR still carries a single `messageInfo` entry; expanding that is a separate change.

## Design

### Wire format

**Phone → watch (Rocky):**
```js
Pebble.postMessage({ [key]: data });   // data is a native JS object
```

**Watch (Rocky):**
```js
rocky.on('message', function(event) {
  var data = event.data;
  if (data && data['<key>'] !== undefined) {
    _data = data['<key>'];               // no JSON.parse
    // ...update branch state, requestDraw
  }
});
```

The outer `{ [key]: data }` wrapper is preserved (rather than sending `data` directly) so the key prop continues to identify the message, allowing future expansion to multiple concurrent `useMessage` calls and leaving room for other Rocky postMessage consumers (e.g. identity-token forwarding) to coexist.

### File-level changes

| File | Change |
|------|--------|
| `scripts/emit-pkjs.ts` | When `target === 'rocky'` and `ir.messageInfo` is present: emit `Pebble.postMessage({ [key]: data })` in place of `Pebble.sendAppMessage({ [key]: JSON.stringify(data) }, ack, nack)`. Applies to both the mock-URL fetch-proxy path and the non-mock path. Keeps the existing listener scaffolding for comments. |
| `scripts/emit-rocky.ts` | In the `rocky.on('message', ...)` block (currently L488–L514): drop `JSON.parse(data[key])`; read `_data = data[key]` directly. Keep the key-gated guard. Keep the existing `rocky.postMessage({ ready: true })` signal. |
| `scripts/emit-piu.ts` | No change. Alloy continues to use AppMessage. |
| `scripts/emit-c.ts` | No change. C continues to use AppMessage. |
| `scripts/compile-to-piu.ts` | No change. `ir.messageInfo` shape unchanged; branching happens at emit time. |
| `src/hooks/useMessage.ts` | No change. Runtime (mock) behavior identical. |
| `src/plugin/index.ts` | No change. Rocky `messageKeys` suppression at L456 still correct — Rocky postMessage doesn't need them. |

### Input plumbing

`emit-pkjs.ts` must know the target. If it already receives `target` in its options, use it directly. If not, thread `target` through the single call site in `scripts/compile-to-piu.ts` that invokes it. This is a mechanical change; no interface redesign.

## Testing

### Snapshot tests

- **`test/snapshots-rocky/async-list.js`** — existing snapshot will change. Expected diff:
  - Watch side: `JSON.parse(data['items'])` → `data['items']`
  - PKJS side: `Pebble.sendAppMessage({ items: JSON.stringify(...) })` → `Pebble.postMessage({ items: ... })`
- **`test/snapshots-rocky/transit-tracker.js`** — regenerate if it uses `useMessage`.
- **`test/snapshots/*`** (Alloy) — must not drift. This is the regression guard confirming the branch is target-gated.
- **`test/snapshots-c/*`** — must not drift. Same guard.

Regenerate with the repo's snapshot-update command (inspect `package.json` scripts during implementation).

### Device smoke test

Snapshots verify shape, not wire compatibility. After snapshot diffs look right:

1. `./scripts/deploy.sh async-list` with the Rocky-target Vite config.
2. Observe mock data reaching the watch and rendering the list.
3. Confirm no `Parse error` logs (the `JSON.parse` branch is gone but the `try/catch` stays as a belt-and-braces guard).

If no Rocky-target deploy path exists for `async-list` today, add a minimal Rocky variant of the example during implementation so the smoke test has a target.

## Risks & mitigations

- **Rocky firmware variance.** `postMessage` has been stable in Rocky since early SDK 4.x, but if a user's watch runs an old firmware without it, messages will silently drop. Mitigation: documented as a requirement in the Rocky section of the README; out of scope to polyfill.
- **Identity-token forwarding still uses `Pebble.sendAppMessage`.** Those messages continue to work on Rocky because the reserved-key names (`_rpTokens`, `_rpTokTL`, etc.) are not declared in `messageKeys`, and `sendAppMessage` without matching keys degrades to a raw dict send that Rocky *does* receive via `appmessage` events. Confirm during implementation that the Rocky watch emitter still wires an `appmessage` listener for these; if not, a separate fix is needed (flagged as out of scope here).
- **Snapshot churn across unrelated Rocky tests.** Since only Rocky snapshots with `useMessage` should diff, unexpected diffs in other Rocky snapshots indicate accidental coupling — investigate before accepting.

## Acceptance criteria

1. Rocky snapshot for `async-list` emits `Pebble.postMessage` and no `JSON.stringify` on the useMessage payload.
2. Rocky watch emitter reads `event.data[key]` without `JSON.parse`.
3. Alloy and C snapshots show zero diff.
4. `async-list` deployed to the Rocky emulator renders the mocked items list from phone to watch.
