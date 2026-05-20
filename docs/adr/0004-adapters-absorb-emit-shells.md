# Target Adapters absorb emit-*.ts shells — depth realized

ADR 0001 introduced the Target Adapter Seam (`scripts/targets/{piu,rocky,c}.ts`) but kept the emission body in parallel `scripts/emit-{piu,rocky,c}.ts` files. The Adapter file was a 28-58 LOC facade calling into a 600-1700 LOC `emit*()` function. PKJS sat in the same shape: `scripts/targets/pkjs.ts` decided invocation; `scripts/emit-pkjs.ts` did the work. Tests bypassed the Target Interface and imported `emitPiu` / `emitRocky` / `emitC` / `emitPKJS` directly. As of 2026-05-19 we collapse each `emit-*.ts` body into its Adapter file: a Target Adapter is now self-contained — `validate`, `emit`, font/color/alignment maps, draw-call helpers, and (for PKJS) the shared sub-output helper all live behind one Seam per backend. Tests migrate to the Target Interface (`target.emit(ir, ctx).code`, `target.emit(ir, ctx).pkjsCode`).

## Why

- **Locality.** ADR 0001 promised per-Adapter Locality but parked the depth one file away. A change to Rocky-specific draw-call lowering still required editing `emit-rocky.ts`, not `targets/rocky.ts`. The Seam advertised depth it did not own. Folding restores the promise.
- **Test surface.** Tests calling `emitPiu(ir, name)` directly bypassed the Target Interface — the Interface stopped being the test surface. Migrating tests to `piuTarget.emit(ir, { appName })` makes the Interface the test surface (per LANGUAGE.md), and forces the public contract to stay sufficient for everything tests need.
- **Two mental models collapse to one.** New contributors read `scripts/targets/piu.ts` and saw a 28-line passthrough; they then had to discover `scripts/emit-piu.ts` separately to find the actual work. After fold, `scripts/targets/piu.ts` is the file.
- **FontKey lockstep finally enforced.** ADR 0001 declared `FontKey` would enforce lockstep coverage across Adapters at compile time. The union existed in `scripts/targets/fonts.ts` but emit files typed maps as `Record<string, string>`, defeating the gate. Fold retypes each font map as `Record<FontKey, string>`; adding a font without updating all three Adapters now fails `tsc`.

## Rejected alternatives

- **Adapter re-exports `emitPiu` for test back-compat.** Preserves the test imports but keeps depth leaking past the Interface. Rejected — the Interface must be the test surface.
- **Move Adapters to `src/compiler/targets/` during the fold.** Pre-empts the future move planned in ADR 0001. Rejected — the move is gated on replacing the subprocess wrapper in `src/compiler/index.ts`; folding 3000+ LOC of emitter code into `src/compiler/` while the Vite library entry still bundles from `src/` would drag the entire emitter tree into consumer-facing `dist/lib`. Stays in `scripts/targets/` until the subprocess wall is replaced (separate ADR).
- **Per-Adapter subdirectory (`scripts/targets/piu/{index,fonts,draw-calls}.ts`).** A premature internal Seam. Rejected — each Adapter's internal helpers are private; one Seam (the Target Interface) is enough for now. Split only if internal cohesion stops paying.
- **Defer PKJS fold to a follow-up.** Same parallel-shell shape, same Locality argument, same Test-surface argument. No reason to leave it half-done.

## Consequence

- `scripts/emit-{piu,rocky,c,pkjs}.ts` deleted.
- `scripts/targets/{piu,rocky,c}.ts` each grow to encompass their full emitter (piu ~920 LOC, rocky ~620 LOC, c ~1750 LOC).
- `scripts/targets/pkjs.ts` absorbs the body of `emit-pkjs.ts` and stays the shared sub-output helper invoked by Adapters whose IR demands it (per ADR 0002).
- Seven test files migrate from `import { emitPiu } from '../scripts/emit-piu.js'` to `import { piuTarget } from '../scripts/targets/piu.js'` and call `piuTarget.emit(ir, { appName })`.
- Font map per Adapter retyped `Record<FontKey, string>`.
- ADR 0001's "wraps the existing `emit-*.ts` implementation behind the Target Interface" framing is superseded by this ADR.
