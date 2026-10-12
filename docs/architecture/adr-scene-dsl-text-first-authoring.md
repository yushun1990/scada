# Proposal: text-first Scene DSL authoring, device slots, and Event argument mapping

- **Status:** `active` — architecture proposal under review; not an accepted DSL, Scene or runtime contract.
- **Work item:** **DSL-AUTH-ARCH** (Scene DSL authoring architecture). Handoffs and follow-ups cite this ID.
- **Date:** 2026-10-10; revised 2026-10-12 for review findings DSLA-R1–R8 against `main` `370981c`.
- **Scope:** source baseline, authoring direction and candidate semantic extensions. Not implementation approval.
- **Authority:** [DSL v1](scada-dsl-v1.md) remains authoritative. If this proposal is accepted, it would amend `scada-dsl-v1.md` §1, §7, §9 and §10 and the [M9A1.4](../progress/m9a1.4-dsl-symbol-contract.md) root-rejection acceptance. That amendment needs its own accepted ADR. Until then, DSL v1 stays as it is.
- **Related:** [original M6.5 text-first intent](../progress/m6.5.4-scada-dsl-surface.md), [binding/behavior direction](scada-binding-behavior.md), [component I/O and T3](adr-component-input-output-composition.md), [private Update proposal (CAR-ARCH)](adr-component-authored-update-runtime.md), [PLAN §11](../../PLAN.md#11-immediate-execution-sequence).

## 1. Source baseline (DSLA-R1, DSLA-R5)

Checked against `main` `370981c`:

| Area | Current source fact |
| --- | --- |
| DSL v1 domain pipeline | Parser, semantics, capability catalog, completion, persistence codec and propagation session exist in `src/scene/scada-dsl*.ts` and [`scada-semantics-persistence.ts`](../../src/scene/scada-semantics-persistence.ts). |
| Production consumers of that pipeline | **None.** `createScadaDslCapabilityCatalog`, `getScadaDslCompletionItems` and `persistScadaSemanticPlan` are called only from `scripts/check-scada-dsl*.ts`, `check-scada-semantics-persistence.ts`, `check-preview-scada-integration.ts` and `check-typed-action-event-contract.ts`. No `.tsx` or feature module calls them. |
| Scene editor authoring | [`ScadaEditorPage.tsx`](../../src/features/scada-editor/ScadaEditorPage.tsx) (L602–L722) writes only the compatibility-only Scene v5 `bindings` (runtime-value key) and the Scene v6 `behaviors` (Event → Component Action on `targetNodeId`). No production code writes `scadaSemantics`. |
| Canonical semantics at runtime | `scadaSemantics` is read only by [`standalone-work-runtime-core.ts`](../../src/features/runtime/standalone-work-runtime-core.ts) (L110–L112) through `attachPreviewScadaSemantics`. No editor `.tsx` consumer attaches canonical semantics. |
| Primary device | Scene v8 persists **no** device binding. `ComponentSceneNode` ([`schema.ts`](../../src/scene/schema.ts) L62–L72) has no device field, and `boundDeviceId` appears only in DSL v1 §1 prose. The primary device comes from the optional host callback `resolvePrimaryDevice(node)` (standalone core L121). Only `scripts/check-standalone-work-runtime.ts` supplies that callback. `rebindPrimaryDevice` is a runtime-session capability, not an authored Scene contract. |
| Device capabilities | The only device input is `ScadaDslSourceDefinition` ([`scada-dsl.ts`](../../src/scene/scada-dsl.ts) L836–L844). It reuses the **component** scalar contracts (`ComponentPropertyDefinition`, `ComponentActionDefinition`, `ComponentEventDefinition`), and nothing in production produces it. `src/` contains no WoT Thing Description ingestion. |

**Restated problem.** Users do not face an overly complex structured binding inspector; that inspector does not exist. Users cannot reach DSL v1 at all. It is a tested domain pipeline with no Scene authoring, persistence, Preview or undo integration. The production baseline is the legacy runtime-value-key binding plus the Event → Component Action selector.

## 2. Product intent

M6.5 proposed a small DSL editor with capability discovery, completion and click-to-insert. It would compile into structured Value/Behavior/Interaction semantics. DSL v1 keeps that lowering target but limits authored references to `$self` and one `$device`. It has no authored Event-payload reference.

The proposed direction is **text-first and capability-assisted**, not a growing collection of visual binding forms. Users select capabilities and accept or edit suggestions; they do not need to memorize symbols. The editor may offer concise visual controls for trivial cases, but one compiler and one canonical semantic model stay authoritative.

Different devices may perform the same industrial function through incompatible capability schemas. **Do not assume cross-schema semantic matching.** Rebinding a copied component to another instance with a compatible capability contract is a valid fast path. A genuinely different capability schema can require its own mapping.

## 3. Proposed order of work

1. **Prerequisite (separate authorization, T3-adjacent):** wire the **existing** DSL v1 (`$self` / `$device`) into Scene authoring, persistence (`scadaSemantics`), editor Preview and undo. One committed edit must produce one undoable command. This step must also decide how the primary device is selected in the editor and in standalone deployment. If that selection is persisted, it is itself a versioned Scene change. It must also decide how source text relates to the persisted canonical semantics (§7). This step is not authorized by this proposal.
2. **Observation:** after step 1 ships, record real authoring friction with `$self` / `$device` only, using the scenarios in §8.
3. **Extensions:** consider multi-device references (§4) and typed Event payload access (§5) only if step 2 justifies them. Each one needs its own accepted ADR amendment to DSL v1.

## 4. Multi-device references (DSLA-R2, DSLA-R3)

Keep the simple case:

~~~~text
$self.running = $device.running
on $self.startRequested {
    $device.start()
}
~~~~

Candidate flat syntax for additional devices, **illustrative only**:

~~~~text
$self.running = $pump1.running
$self.level = $pool1.level
on $self.startRequested {
    $pump1.start()
}
~~~~

- `$self` addresses the current component's declared public contract, not private layers or Update.
- `$device` keeps its **relative primary device** meaning.
- Do **not** introduce multi-level `$device.pump1` syntax just to address more devices. Keep the `root.member` reference shape.
- Undefined, ambiguous or stale names must fail closed. `$self`, `$device` and `$event` are reserved.

**Finding (answers former Q1): flat aliases cannot reuse the existing `external` reference.**

1. The only non-primary reference is `{ scope: 'external', sourceId, property | action }` ([`scada-behavior-contract.ts`](../../src/scene/scada-behavior-contract.ts) L12–L16, L86–L90). It persists a raw deployment device ID, and the analysis dependency index keys it as `source:external:${sourceId}:…` ([`scada-dsl-analysis.ts`](../../src/scene/scada-dsl-analysis.ts) L462). Copy, import and standalone redeploy cannot rebind it without rewriting canonical semantics. M9A1.4 keeps it as compatibility-only for older artifacts, and DSL v1 cannot author it.
2. DSL text is not persisted (DSL v1 §8). If the alias name is not persisted either, reopening the editor cannot regenerate `$pump1`. It could show only a device ID or a title, and titles are neither unique nor stable.
3. Scene v8 has no persisted primary-device binding (§1). Additional device references cannot be specified before that contract exists.

**Alternative to evaluate: instance-scoped named device slots.** Generalize `primary-device` into `{ scope: 'device-slot', slot: 'pump1', property | action }`, where `$device` is the default slot. The slot key is a persisted per-instance binding key, not a device identity. The host resolves slot → device ID the same way it resolves the primary device today. Copy, rebind and standalone redeploy then behave the same for every slot, and the source symbol can be regenerated from the slot key without loss.

Required if adopted:

- a **Scene v9** schema change carrying per-instance slot bindings, plus **semantics v2** carrying the `device-slot` reference;
- migration fixtures (v8 → v9, `primary-device` → default slot), malformed-input fixtures, and rollback/failure behavior;
- explicit policies for slot creation and rename, copy and import remapping, missing devices, standalone deployment mapping, editor Preview data supply and resource closure;
- `external` stays compatibility-only. It must not become a second device-truth authority.

## 5. Typed Event payload access (DSLA-R4, DSLA-R8)

Candidate syntax, **illustrative only**:

~~~~text
on $self.valueChanged {
    $device.setFrequency($event.value * 0.5)
}
~~~~

`$event` would be a read-only lexical binding inside the corresponding `on` block, limited to declared, host-validated payload fields. The Event payload is never executable instructions. It is never spread automatically into arguments, and dispatch never means device completion.

**Finding (answers former Q2): the current canonical Interaction plan cannot represent `$event`.** Minimum required changes:

1. **Semantics v2.** `PersistedScadaExpression` has only `component-property` and `source-property` references, and the parser rejects anything else under strict `SCADA_SEMANTICS_VERSION = 1` ([`scada-semantics-persistence.ts`](../../src/scene/scada-semantics-persistence.ts) L11–L15, L358–L391). An `event-payload` reference kind needs a versioned codec with migration and malformed-input fixtures.
2. **Context-sensitive validation.** `parseExpression` is context-free. Value Bindings, Behavior conditions and arguments, and Interaction arguments all share it. v2 must reject `event-payload` references everywhere except Interaction arguments. Otherwise a malformed document could feed event data into a Value Binding.
3. **Session and runtime API.** The attach path drops the validated payload: [`preview-scada-semantics.ts`](../../src/runtime/preview-scada-semantics.ts) L220 calls `session.componentEvent(event.eventName)`, and the session signature is `componentEvent(event: string)` ([`scada-dsl-propagation-session.ts`](../../src/scene/scada-dsl-propagation-session.ts) L57). The session, `evaluateScadaDslComponentEvent` ([`scada-dsl-runtime.ts`](../../src/scene/scada-dsl-runtime.ts) L442) and `ScadaDslDependency` (exhaustive switches in [`scada-dsl-analysis.ts`](../../src/scene/scada-dsl-analysis.ts)) need a payload-aware evaluation context.
4. **Dependency isolation.** `$event` must never enter `readDependencies` or `triggerDependencies`.
5. **Rejected workaround.** Having the component write the payload into a Property and then passing `$self.x` violates §6. It turns event data into a persistent Property and races derived-commit ordering.

Type information already exists. `ScadaDslCapabilityItem.event` carries `ComponentEventDefinition.payload`, and after `normalizeComponentEventPayload` optional fields are absent rather than `null`. The compiler can type-check `$event.<field>` against Action parameters without new contract data.

**Scope restriction.** In the first extension, `$event` applies **only to device-Action arguments**. DSL v1 `on` lowers exactly one `$device.<Action>` call ([`scada-dsl-semantics.ts`](../../src/scene/scada-dsl-semantics.ts) L463–L477). The legacy v6 route targets a Component Action on *another node* (`targetNodeId`), and no DSL root can address another node. Before `$event` can feed Component Actions, T3 must decide target addressing and the related single-route suppression through `claimCompiledSemantics`.

**Authoring assistance**, in order of preference:

1. Capability-aware completion inserts the selected Action and shows its required parameters and their schemas.
2. Offer type-compatible, unambiguous payload-field candidates and explicit constants or transform expressions. Matching types alone never prove semantic equivalence (percent vs Hz, enum codes, booleans vs states). Units and meaning need review, and an unsafe command mapping must never be applied silently.
3. Keep the generated expression visible and editable as DSL, using the same lowering and validation path. No visual mapper executes independently.
4. Optional design-time AI may draft reviewable DSL from the component contract, the selected capability schemas, the accepted grammar and existing scene references, and explain unknowns. **No runtime LLM dependency, no unreviewed device dispatch, no fabricated semantics and no bypass of compiler or Host authority.**

## 6. Structured Action input (DSLA-R5)

Current contracts allow named scalar Event payload records and ordered scalar Action parameters. This proposal does **not** freeze named-argument or object-value grammar, and it does not broaden runtime payload types.

Evaluate richer inputs (named fields, units, nullable or optional fields) against **scalar `ScadaDslSourceDefinition` fixtures** that describe two incompatible capability shapes for the same function. A real device-capability catalog (for example WoT TD ingestion) is an **explicit out-of-scope prerequisite**. PLAN §11 excludes speculative protocol, backend and real-device work, and PLAN §13 excludes protocol-specific Scene fields. Neither the scalar contracts nor the Scene schema can widen through this proposal.

## 7. Ownership and compatibility invariants

- DSL remains an **authoring surface**, not the persisted execution authority. The structured Scene Value/Behavior/Interaction semantics, the host-owned effective Property snapshot, single-writer and cycle checks, and host-executed Effects remain authoritative.
- The Component type owns its public Properties, Actions, Events and payload schemas. The Scene owns consumer mapping and target selection. `$event` is not a Component Property and not an implicit response channel to private Update.
- Component Action input and Device/Platform Action invocation are distinct. Existing Event → Device/Platform Action support is preserved. One authored interaction must never dispatch through both the legacy and the new route.
- Component copy and rebind, transactional invalidation, stable IDs, compatibility with old Scenes, M9 Preview/Standalone equivalence and fail-closed security and capability boundaries are all preserved.
- SCADA is not a device-orchestration engine: no implicit retries, delays, process sequencing, arbitrary network or DOM access, or Event-driven multi-device workflows.
- How source text relates to the persisted canonical semantics is **unresolved**. The options are preserving source as editable metadata, regenerating it, or another synchronization scheme. There must never be two competing persisted runtime truths, and there is no promise of lossless round-trip from arbitrary structured bindings without proof.

## 8. Accepted contracts this would amend (DSLA-R2)

Accepting `$pump1`-style references or `$event` reverses accepted M9A1.4 negative checks. The amendment must name the fixtures it changes:

| Accepted rule | Source / fixture that would change |
| --- | --- |
| Only `$self` / `$device` roots; arbitrary `$foo` roots fail at the source boundary (M9A1.4 L15–L16, DSL v1 §1, §9 `reference :=`) | Parser root check in [`scada-dsl.ts`](../../src/scene/scada-dsl.ts) L670–L673; `arbitraryRoot` (`$outlet.pressure`) and related root-message assertions in [`check-scada-dsl.ts`](../../scripts/check-scada-dsl.ts) L189–L199 |
| One device source per component catalog (DSL v1 §1, §7) | `createScadaDslCapabilityCatalog` rejection in `scada-dsl.ts` L893–L897; multi-source `assert.throws` in `check-scada-dsl.ts` L231–L246 |
| Completion emits only `$self` / `$device` (M9A1.4 L21, L72; DSL v1 §7) | `rootCompletion` symbol assertion in `check-scada-dsl.ts` L271–L274 |
| `on` lowers exactly one `$device` Action whose arguments reference only `$self` / `$device` / literals (M9A1.4 L52) | `scada-dsl-semantics.ts` L463–L477 and its semantics fixtures |
| Strict semantics v1 references (`component-property`, `source-property`) | `scada-semantics-persistence.ts` L358–L391, L497; `check-scada-semantics-persistence.ts` |
| M6.5 migration notes (DSL v1 §10) | Must say which removed exploratory forms stay rejected |

DSL v1 §1 already requires multi-device logic to arrive "as an explicit later language/scene-contract extension". This proposal is that kind of extension and is not a v1-compatible addition.

## 9. Remaining review questions

1. What is the smallest justified extension for structured Action input, named fields, units and optional payloads, tested with the scalar fixtures from §6?
2. After the §3 step 1 integration, is text-first plus capability completion materially simpler for novice workflows than the **actual** baseline? The baseline is legacy runtime-value-key binding plus the Event → Component Action selector, and also DSL v1 with only `$self` / `$device`. Compare **one standard pump**, **two incompatible scalar capability shapes for the same function**, **a multi-device status component** and **a slider Event driving a nontrivial device-Action input**.
3. How should incomplete or error-tolerant source, provenance, completion and AI drafts, undo/redo, source-to-canonical reconciliation, diagnostics and standalone behavior work?
4. For device slots: should the slot set be declared per component type or per instance, and how do rename and copy interact with portable work packages?

## 10. Relationship to PR #222

PR #222 (CIO-T1 read-only public schema display plus editor and browser fixes) was merged into `main` as `370981c`. It is not a prerequisite for this proposal and does not authorize anything here. Its read-only Action parameter and Event payload display could later support DSL completion.

## 11. Gate

This is a documentation-only architecture review item. **No code, parser, schema, persistence format, UI, effect target or milestone changes.** If the proposal is justified, the next step is a separately authorized plan for the §3 step 1 integration. This document does not amend DSL v1, and it does not accept T3, CAR-1, M10B+, AI integration or portable authored execution.
