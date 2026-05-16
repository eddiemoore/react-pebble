# Hook detection is Analyzer-owned, declared-import semantics, direct imports only

Until 2026-05-16, the orchestrator (`scripts/compile-to-piu.ts`) regex-scanned the entry source for `/use[A-Z]\w+/` *after* the Analyzer ran, then passed the resulting `hooksUsed: string[]` into `target.validate(ir, hooksUsed)` and `target.emit(ir, ctx)`. This duplicated truth (Analyzer's perturbation-observed hooks vs. orchestrator's textual scan), matched any local helper named `useFoo`, and forced every consumer (Rocky's blocked-hook gate, `needsPKJS`, `buildPKJS`, plugin capability inference) to receive `hooksUsed` as a side-channel parameter alongside the IR.

We moved hook detection into the Analyzer as an AST-symbol-aware pass that records a `HookUsage[]` (name + source location) on `CompilerIR`. The Target Interface shrinks: `validate(ir)` and `emit(ir, ctx)` no longer take `hooksUsed`; Adapters read `ir.hooksUsed` directly. PKJS helpers and plugin capability inference follow.

## Why

- **Locality.** Hook identity is now produced exactly once, in the Analyzer, alongside the other AST passes that already exist there (state perturbation, list detection, branch collection). Every downstream reads from the same source of truth.
- **Leverage.** Adding a new consumer of "which hooks did the dev use?" is now a single read from `ir.hooksUsed`. No new parameter, no new plumbing through `Target.validate` / `TargetContext`.
- **Correctness.** The previous regex matched any identifier shaped like a hook — including local `useMyHelper()` functions unrelated to react-pebble. Symbol-aware detection (resolve import bindings from `'react-pebble'` / `'react-pebble/hooks'`, then walk `CallExpression` nodes whose callee is one of those bindings) eliminates the false positives.
- **Richer diagnostics.** `HookUsage` carries `{ name, line, col }`, so Rocky's blocked-hook errors can now point at the exact call site instead of just naming the hook.

## Semantics

**Declared truth, not perturbation truth.** A `HookUsage` is recorded if the entry source *imports and calls* a react-pebble hook, regardless of whether that call site fires during the Analyzer's mock render. Rationale: shipping `if (false) useButton()` on the Rocky target is still wrong; validate must catch it. All five current consumers (Rocky validate, `needsPKJS`, `buildPKJS`, `emit-pkjs`, plugin `computeCapabilities`) want declared truth.

**Direct imports only.** Detection resolves imports from the literal module specifiers `'react-pebble'` and `'react-pebble/hooks'`. Transitive re-exports through user modules are *not* resolved.

## Rejected alternatives

- **Keep regex scan in the orchestrator.** Status quo before this ADR. Two truths, false positives on `useFoo`-shaped local helpers, and every consumer pays a parameter. Rejected for the reasons above.
- **Use perturbation-observed truth (only hooks that fired during mock render).** Conditional branches and dead code escape detection; Rocky validate would silently pass apps that ship blocked hooks behind `if` gates. Rejected — declared intent is the load-bearing signal.
- **Use TypeScript's `Program` + `TypeChecker` to resolve transitive re-exports.** Would catch `import { useTime } from './my-hooks'` chains. Rejected because (a) the Analyzer today uses standalone `ts.createSourceFile`, no `Program`, so this would drag the full type-checker and tsconfig context into compile time; (b) re-exporting framework hooks from user modules is rare in practice. Reopen if real users hit this.

## Consequence

`CompileResult.hooksUsed: string[]` (public, exported via `react-pebble/compiler`) stays as `string[]` for backwards compatibility. The wrapper projects the richer internal `HookUsage[]` down to canonical names. The Target Interface (`scripts/targets/types.ts`) is internal and changes freely: `validate(ir): Diagnostic[]`, `TargetContext` loses `hooksUsed`.
