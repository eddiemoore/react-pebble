# Targets are Adapters behind one Interface

The compiler emits to three runtimes — piu, Rocky.js, native C — and was structured as three parallel `emit-*.ts` modules with the orchestrator branching on a `target` env var. As of 2026-05-15 we collapsed this into a single `Target` Interface (`validate`, `emit`) with three Adapters (`piuTarget`, `rockyTarget`, `cTarget`) registered in `scripts/targets/index.ts`. The orchestrator looks up an Adapter by name; it does not know which backends exist.

Adapters live under `scripts/` rather than `src/compiler/` because `src/compiler/index.ts` is a Vite library entry — importing Adapters from there would bundle the entire emitter tree (and analyze.ts + dependencies) into consumer-facing dist/lib. They move to `src/compiler/targets/` once the subprocess wrapper in `src/compiler/index.ts` is replaced by direct calls (a future ADR).

## Why

- **Locality.** Rocky-specific compile-time guardrails (the blocked-hook list) used to live in the orchestrator. They now live with the `rockyTarget` Adapter where the rest of Rocky's knowledge sits.
- **Leverage.** Adding a fourth Target is one Adapter file + one registry entry. No orchestrator edits, no caller branching.
- **Tests.** The Interface is the test surface — one parameterized snapshot harness iterates all Targets instead of three sibling test directories.

## Rejected alternatives

- **Keep parallel files, share helpers only.** Insufficient — caller branching stays, font tables stay in lockstep manually, Rocky guardrails stay in the wrong place.
- **One mega-emitter with internal target switches.** Worse Locality — every emit function would branch on target. Adapters keep each backend's code physically grouped.

## Constraints carried forward

- Font tables stay **per Adapter** (one `Record<FontKey, string>` per file). A shared `FontKey` union enforces lockstep coverage at compile time. Rejected a single combined registry because mixing per-Target values in one file destroys Locality.
