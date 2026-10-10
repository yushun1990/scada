# Proposal: text-first Scene DSL authoring, flat device aliases, and Event argument mapping

- **Status:** proposed for independent architectural review; not an accepted DSL/runtime contract.
- **Date:** 2026-10-10.
- **Scope:** authoring direction and candidate semantic extensions, not implementation approval.
- **Related:** [accepted DSL v1](scada-dsl-v1.md), [original M6.5 text-first intent](../progress/m6.5.4-scada-dsl-surface.md), [M9A1.4 restrictions](../progress/m9a1.4-dsl-symbol-contract.md), [binding/behavior direction](scada-binding-behavior.md), [component I/O and T3](adr-component-input-output-composition.md), [private Update proposal](adr-component-authored-update-runtime.md), [PLAN](../../PLAN.md).

## 1. Problem and product intent

Scene users now face complex Value/Interaction Binding configuration. A graphical binding inspector is not automatically simpler than a compact DSL for conditional values, events, and Action arguments. M6.5 explicitly proposed a small DSL editor with capability discovery, completion and click-to-insert, compiling into structured Value/Behavior/Interaction semantics. The current accepted DSL v1 still lowers to that semantic model, but limits authored references to `$self` and one `$device`. It offers no authored Event-payload reference or structured WoT Action input mapping.

Different Things may perform the same industrial function using incompatible TD schemas. **Do not assume cross-TD semantic matching.** Rebinding a copied, previously configured component against another instance with a compatible capability contract is a valid optimized path; a genuinely different TD can require its own mapping.

The intended authoring direction for review is **text-first, capability-assisted** rather than a growing collection of visual binding forms. Ordinary users should select capabilities and accept or edit suggestions without memorizing symbols. The editor may expose concise visual controls for trivial cases, but the same compiler and canonical semantic model must remain authoritative.

## 2. Flat device references, not a hierarchical Device Context object

Keep the simple case:

~~~~text
$self.running = $device.running
on $self.startRequested {
    $device.start()
}
~~~~

Propose optional flat aliases for explicitly selected devices:

~~~~text
$self.running = $pump1.running
$self.level = $pool1.level
on $self.startRequested {
    $pump1.start()
}
~~~~

- `$self` addresses the current component's declared public contract, not private layers/Update.
- `$device` retains the current **relative primary device** copy/rebind behavior.
- `$pump1` / `$pool1` represent editor-resolved, explicit device aliases. Names are authoring symbols, **not persisted device identity**; resolve them to stable structured capability references before execution.
- Do **not** introduce `$device.pump1` multi-level syntax merely to represent additional devices. Preserve the small `root.member` reference grammar where possible.
- Alias selection should be capability-browser/completion driven; an undefined, ambiguous or stale alias must fail closed. Reserve `$self`, `$device` and `$event`.
- Changing the primary device only rebinds primary-relative references. Explicitly selected targets do not silently change. Copying/moving an instance needs an explicit policy for external alias remapping, missing devices and resource closure.

**Review decisions still needed:** is an explicit alias table scoped to each component instance or a scene with explicit capture? How are aliases created/renamed, copied, imported, and reconciled with existing persisted `scope: 'external'` references? Avoid turning an editor nickname into a new runtime source of device truth.

## 3. Typed Event payload access and Action argument mapping

Candidate *illustrative* syntax, **not currently accepted or implemented**:

~~~~text
on $self.valueChanged {
    $device.setFrequency($event.value * 0.5)
}
~~~~

`$event` is a read-only lexical binding inside the corresponding `on` occurrence. Only declared, host-validated payload fields may be referenced. The compiler must check field availability, type, nullability, Action argument compatibility and whether the mapping is representable by existing canonical Interaction semantics. Do not treat the Event payload as executable instructions, automatically spread it into arguments, or treat dispatch as device completion.

Current contracts allow named scalar Event payload records and ordered scalar Action parameters; WoT Action inputs can be richer. Named arguments / object values may improve editing, but **do not freeze a new grammar or broaden runtime payload types by this proposal**. Independent review must establish the minimum expressible and type-safe extension, including Event scope, malformed data, missing fields and Preview/Standalone parity.

For an authoring experience, try in this order:

1. Capability-aware completion inserts the selected Action and exposes the required parameters and their schemas.
2. Offer type-compatible, unambiguous payload-field candidates and explicit constants/transform expressions. Similar types alone never prove semantic equivalence (percent vs Hz, enum codes, booleans vs states); require review of units/meaning, and no silent unsafe command mapping.
3. Keep the generated expression visible and editable as DSL. Use the same lowering/validation path, not an independently executing visual mapper.
4. Optional design-time AI, given the component contract, selected TD/capability schemas, accepted DSL grammar, known constraints and existing scene references, may propose a draft and explain unknowns. **No runtime LLM dependency, unreviewed device dispatch, fabricated semantics or bypass of compiler/Host authority.**

For richer payloads, object-valued Action inputs and unit conversions, the reviewer should test a realistic TD pair and identify precisely what cannot be expressed without extending the existing scalar contracts.

## 4. Ownership and compatibility invariants

- DSL remains an **authoring surface**, not the persisted execution authority. The accepted structured Scene Value/Behavior/Interaction semantics, host-owned effective Property snapshot, single-writer/cycle checks and host-executed Effects remain authoritative.
- The Component type owns public Properties/Actions/Events and payload schema; the Scene owns independently authored consumer mapping and target selection. `$event` is not a Component property or an implicit response channel to private Update.
- Distinguish Component Action input from Device/Platform Action invocation. Preserve existing Event → Device/Platform Action support while considering T3's Event → Component Action path. A single authored interaction must never dispatch via both legacy and new routes.
- Maintain component copy/rebind, transactional invalidation, stable IDs, old authored Scene/schema compatibility, M9 Preview/Standalone equivalence and fail-closed security/capability boundaries.
- SCADA is not a device-orchestration engine: no implicit retries, delays, process sequencing, arbitrary network/DOM access or Event-driven automatic multi-device workflows.
- Source editing versus canonical persisted semantics is an **unresolved authoring-lifecycle problem**: specify whether source is preserved as editable metadata, regenerated, or otherwise synchronized. Never introduce two competing persisted runtime truths or promise lossless round-tripping from arbitrary structured bindings without proof.

## 5. Suggested review / implementation boundary

This PR records a direction and explicit review questions only: **no code, parser, schema, persistence format, UI, effect target or milestone is changed.**

Ask an independent reviewer to reconstruct accepted M6.5–M9 and #221/#223 contracts from source, then falsify the following:

1. Can flat explicit aliases reuse existing external reference machinery without a second symbol/device authority or breaking primary rebind, copy, import, rename and lifecycle semantics?
2. Can typed Event-payload expressions lower into the current Interaction plan without making event data a persistent Property or introducing another dispatch path?
3. What is the smallest justified extension for structured Action input, named fields, units and nullable/optional payloads?
4. Is text-first plus capability completion materially simpler for actual novice workflows than form-first Binding? Compare **one standard pump**, **two incompatible TDs**, **a multi-device status component**, and **a slider Event to nontrivial Action input**.
5. How should incomplete/error-tolerant authored source, provenance, generated completion/AI drafts, undo/redo, source-to-canonical reconciliation, diagnostics and standalone behavior work?
6. Which aspects are already implemented, missing, or merely historical experiments? Specify focused production fixtures and migration/rollout gates before any code is authorized.

**Relationship to PR #222:** that draft implements T1 read-only public schema/terminology plus editor/browser fixes. It is independently reviewable and not a prerequisite for this design PR. Its schema visibility can later support DSL completion; do not pull #222 implementation or its stacked history into this proposal. Before merging #222, review its effective diff against current `main` and its actual T1+polish scope.

**Gate:** architecture review and, if justified, a separately authorized T3/DSL editor implementation plan. This document neither supersedes DSL v1 nor accepts T3, CAR-1, M10B+, AI integration or portable authored execution.
