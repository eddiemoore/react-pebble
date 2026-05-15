# react-pebble

A compile-time JSX → Pebble framework. Component code is rendered in Node at build time; the analyzer infers reactive bindings from VDOM diffs and AST patterns, and a Target emits backend-specific code (piu / Rocky.js / native C) that runs on the watch.

## Language

**Target**:
An output backend that consumes a CompilerIR and produces watch-side code for one runtime. Three exist today: `alloy` (piu / Moddable), `rocky` (Rocky.js), `c` (Pebble C SDK).
_Avoid_: backend, emitter, codegen, output, generator

**CompilerIR**:
The intermediate representation produced by the Analyzer and consumed by every Target. The contract that separates analysis from emission.
_Avoid_: AST, tree, model, intermediate

**Analyzer**:
The compile-time pipeline that renders the component, perturbs state, diffs VDOM, walks the AST, and produces a CompilerIR. Lives in `scripts/analyze.ts`.
_Avoid_: parser, compiler, frontend

**Adapter**:
A concrete Target implementation (`piuTarget`, `rockyTarget`, `cTarget`) satisfying the Target Interface.
_Avoid_: emitter (now reserved for the per-Target `emit` function), implementation, plugin

**PKJS**:
PebbleKit JS — phone-side companion code emitted as a sub-output of a Target when the app uses phone messaging, config, or timeline tokens. Not itself a Target.
_Avoid_: companion, phone JS, JS shim

**Platform**:
A Pebble hardware variant (`emery`, `gabbro`, `basalt`, `chalk`, `diorite`, `aplite`). Independent of Target — one Target may emit code for several Platforms.
_Avoid_: device, watch model

**Reactive binding**:
A detected dependency between component state/time and a rendered property. The Analyzer infers these by perturbing inputs and diffing outputs; each Target compiles them to its native update mechanism.
_Avoid_: subscription, signal, effect

## Relationships

- An **Analyzer** run produces one **CompilerIR**.
- A **CompilerIR** feeds one or more **Targets** (each independently).
- A **Target** emits watch-side code and optionally a **PKJS** sub-output.
- A **Target** emits code for one or more **Platforms**, configured by the plugin.
- **Reactive bindings** live inside the **CompilerIR**; each **Target** lowers them differently (piu Behaviors, Rocky.js redraw, C update_proc).

## Example dialogue

> **Dev:** "If I add a new hook, where does its compile-time behavior go?"
> **Maintainer:** "Detection goes in the **Analyzer** and lands in the **CompilerIR**. Then each **Target** decides how to lower it — piu wires it into a Behavior, C wires it into an event subscription. If the hook needs phone-side wiring, the **Target** decides whether to add it to its **PKJS** sub-output."

> **Dev:** "Can a hook be blocked on Rocky?"
> **Maintainer:** "Yes — `rockyTarget.validate(ir, hooksUsed)` returns Diagnostics for hooks Rocky.js can't support. Per-Target Locality: the rule lives with the Adapter, not the orchestrator."

## Flagged ambiguities

- "emitter" previously referred both to the per-Target output module and to the entire backend concept. Resolved: a Target is the noun; `emit` is its method.
- "platform" sometimes appears in plugin code as a synonym for **Target** (`targetPlatforms` config). Resolved: **Platform** = hardware; **Target** = output backend. Plugin option naming predates this and stays for compatibility.
