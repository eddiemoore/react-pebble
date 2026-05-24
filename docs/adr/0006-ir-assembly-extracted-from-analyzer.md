# IR Assembly is a pure Seam, extracted from the Analyzer

The `analyze()` function in `scripts/analyze.ts` was a 1559-LOC monolith mixing three concerns: (1) Session lifecycle (platform globals, useState patch, mock clock, console silencing, restore), (2) the perturbation engine (7+ numbered passes that drive renders against mutated state/time and diff outputs), and (3) IR Assembly (mapping the harvested observations into a typed CompilerIR, plus a post-construction `assignNames` walk that mutated tree elements with reactivity flags). The third concern had no Seam — readers had to trace 140 LOC of inline struct-building and a recursive flag-walk at the tail of the same function to understand what shape the IR took, and there was no place to type-check "everything the Assembly step depends on." As of 2026-05-24 we extract IR Assembly into `scripts/analyzer/ir-assembly.ts` exporting `assembleIR(input: IRAssemblyInput): CompilerIR`, reify reactivity flags during construction (no second walk), and leave the Analyzer's lifecycle + perturbation engine in place for future deepening (candidate #4 — the subprocess wall — and a potential perturbation-engine split).

## Why

- **Locality.** The CompilerIR schema and the rules that populate it now live together. A reader who wants to know "where does `isStateDynamic` get set?" reads one file. The `hasX` convenience flag derivation and the granularity-detection helper move with it — they're synthesis from observations, not perturbation work.
- **Leverage.** The function signature is the contract: `IRAssemblyInput → CompilerIR`. Future callers (a hypothetical second observation source, a test that wants to drive the IR directly, a debug tool that wants to introspect a halfway state) can hit this Seam without spinning up the perturbation engine.
- **Locality of reactivity flags.** The previous `assignNames` walk mutated IRElements after the IR struct was constructed — split timing, easy to forget, awkward to audit. Reifying flags during traversal puts every per-element decision in one named helper (`reifyReactivityFlags`).
- **Tests.** IR Assembly is pure — no Preact, no Date mock, no console hijack, no `globalThis` writes. A future test can hand it a hand-built `IRAssemblyInput` and assert on the CompilerIR without spawning a subprocess.

## Rejected alternatives

- **Surface split only (extract IR struct, keep post-walk flag mutation).** Leaves the two-phase build pattern (struct → walk → mutate) intact. Rejected — the post-walk was the bigger Locality smell. Reifying flags during traversal is the same code path with cleaner semantics for the same cost.
- **Three-way split now (Session + perturbation engine + Assembly).** Pre-empts ADR candidate #4 (subprocess wall around the Analyzer — module-level state forces `execSync` in `src/compiler/index.ts`). Rejected for this PR — Session lifecycle requires an `AnalyzerSession` class with `withSession(fn)` semantics, plus reworking the subprocess wrapper. Separate refactor with its own ADR; this PR stays focused.
- **Per-Pass modules under `scripts/analyzer/perturbation/{pass-1,pass-2,...}.ts`.** Mirrors the SourceScan Pass model. Rejected — the perturbation passes are sequential and share heavy mutable state (forcedStateValues, mockDate, resetStateTracking, exampleMain), unlike SourceScan Passes which see one immutable AST independently. Splitting them creates fake Seams that leak state across files. Reopen if a future pass becomes plug-in-shaped.
- **Pure-transform IR Assembly (build a new tree, don't mutate the IRElements coming from `collectTree`).** Cleanest semantically — `IRElement` becomes immutable across the Seam. Rejected for this cut — `collectTree` returns mutable IRElements and rebuilding the tree purely is a larger surgery than the rest of the refactor. The current `reifyReactivityFlags` mutates in place, which is encapsulated inside the assembly module and invisible to callers. Pure-transform variant remains a follow-up if mutability ever bites.

## Consequence

- New `scripts/analyzer/ir-assembly.ts` (~280 LOC): exports `assembleIR` + `IRAssemblyInput`. Owns `detectGranularity` (moved from `analyze.ts`) and `reifyReactivityFlags` (formerly `assignNames`).
- `analyze.ts` shrinks by ~140 LOC; the IR-build tail collapses to a single `return assembleIR({...})` after the perturbation engine finishes.
- `detectExplicitGranularity` and the `readFileSync(entryPath)` call stay in `analyze.ts` — file I/O does not cross the pure-assembly Seam; the orchestrator passes the resolved `explicitGranularity` value in.
- No public surface changes — `analyze()` still returns `CompilerIR` with the same shape.
- No snapshot diffs — all 62 piu + 22 rocky + 52 c snapshot tests produce bit-identical output. Pure refactor.
- CONTEXT.md gains an **IR Assembly** glossary entry; the **Analyzer** entry is sharpened to note the boundary.
- Subprocess wall (candidate #4) and perturbation-engine split remain on the table as separate refactors. IR Assembly being pure makes the subprocess wall easier to remove later: the perturbation engine is the only remaining source of mutable harness state, so quarantining it into an `AnalyzerSession` becomes a focused move.
