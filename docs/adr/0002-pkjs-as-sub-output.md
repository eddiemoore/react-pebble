# PKJS is a sub-output of each Target, not a 4th Target

PebbleKit JS companion code is generated when an app uses `useMessage`, `useConfiguration`, or any timeline/token hook. We considered modeling PKJS as a fourth Target alongside `piu`, `rocky`, `c`. As of 2026-05-15 it is instead a sub-output of each Target: `target.emit(ir, ctx)` returns `{ code, pkjsCode?, diagnostics }`, and each Adapter decides whether to invoke the shared `pkjs` helper.

## Why

- PKJS output **depends on the watch-side Target** (the existing `emitPKJS` already took `target` as a switch). Coupling it to the Target Adapter makes that dependency explicit instead of a string argument passed in from outside.
- "Needs PKJS?" is a property of the Target's view of the IR, not of an independent backend. Letting each Adapter decide keeps Locality with the rest of that Target's behavior.
- Avoids forcing the orchestrator to compose two Targets per build.

## Rejected alternatives

- **Fourth Target (`pkjsTarget`).** Splits the decision: orchestrator picks the watch-side Target, then must also know to invoke `pkjsTarget`. Worse Locality — Rocky-vs-C differences in PKJS would have to live in a Target that doesn't know what its sibling chose.
- **Orchestrator-owned helper (status quo before refactor).** Required passing `target` as a string into `emitPKJS`, which then branched internally. The branching is what we just removed.

## Consequence

The PKJS helper (`src/compiler/targets/pkjs.ts`) remains shared — one implementation, called by Adapters that need it. Only the *decision to invoke* and the *config passed in* are Adapter-local.
