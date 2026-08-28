# SCADA Editor Lab Development Plan

## 1. Purpose of this document

`PLAN.md` is the current execution roadmap and architecture gate for the project.

It intentionally does **not** duplicate the full delivery history. Detailed acceptance records belong under `docs/progress/`.

When this file and an older progress note disagree about the next step, this file is the source of truth for current sequencing.

---

## 2. Product direction

This repository is a browser-first, generic SCADA authoring and runtime experiment.

The product intentionally contains two different workbenches:

```text
Workspace
├─ SCADA Works
│   └─ SCADA Workbench
│       └─ simple business-oriented scene authoring
│           ├─ place reusable components
│           ├─ move / resize / rotate / connect
│           ├─ configure public properties
│           ├─ bind runtime data
│           ├─ define narrow presentation / interaction behavior
│           └─ preview / run
│
└─ Component Library
    └─ Component Workbench
        └─ advanced reusable-component development
            ├─ public contract
            ├─ layered visual composition
            ├─ rules / expressions
            ├─ animation / private visual behavior
            └─ preview / diagnostics
```

The guiding product rule remains:

> Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.

SCADA is not a general rule engine. Its scene-level runtime should remain focused on presentation state and explicit user/component interactions.

---

## 3. Architectural invariants

### 3.1 Public contract vs private implementation

Reusable component public contract:

```text
Properties + Actions + Events + Anchors
```

Private implementation by default:

```text
Visual Layers
SVG / Image / Vector / Text internals
Visual Rules
Visual animation / behavior
Internal transient state
Scripts / implementation details
Native renderer details
```

SCADA Workbench consumes only the public contract.

A scene author must not bind directly to private Layer implementation details.

### 3.2 Renderer-independent runtime boundary

User-authored behavior must not receive raw React, DOM or `Konva.Node` objects as its public programming contract.

Target layering:

```text
Scene Value / Behavior / Interaction semantics
        ↓
Compiled runtime model
        ↓
Host-owned runtime state and effects
        ↓
Component / Visual Runtime
        ↓
Renderer
        ↓
Konva
```

Runtime evaluation should produce deterministic state changes/effects. The host owns side effects.

### 3.3 Visual connection and runtime behavior remain separate

```text
SceneConnection
= visible pipe / wire / process line

Value / Behavior / Interaction Binding
= runtime semantics
```

Visual anchors are not runtime ports.

### 3.4 One effective Component Property truth

Renderer reads and Component Action handlers must observe the same effective Component Property snapshot.

The project must not evolve into two independent property states such as:

```text
Renderer props        !=        Action handler props
```

Authored/default values, external bindings and derived DSL values may be separate layers internally, but their final effective snapshot must have one owner and one ordering rule.

### 3.5 Declarative Value Bindings must remain deterministic

A Component Property may have at most one declarative Value Binding writer in one compiled scene program.

The following must be rejected rather than resolved by event arrival order:

```text
component.temperature = device.a
component.temperature = device.b
```

Missing/unresolved derived values must have explicit invalidation semantics. Implicit stale-value retention is not acceptable as the default DSL behavior.

### 3.6 Primary-device rebind is transactional

Primary-device rebind must not leave mixed state such as:

```text
new primary device
+ old derived Component Properties
+ partially reset Behavior branch state
```

Either the rebind commits a coherent new runtime state or the previous committed state remains intact.

### 3.7 Local-first persistence is the default authoring model

Normal authoring must not require a backend server.

Target persistence layering:

```text
Workbench / Runtime-facing repositories
        ↓
Storage abstraction
        ├─ IndexedDB implementation       browser production/local authoring
        └─ Memory implementation          deterministic tests / fixtures
```

Current `localStorage` persistence is transitional.

The storage layer must support deterministic export/import of a debug snapshot so browser-only failures can be reproduced outside the user's browser.

### 3.8 Backend is optional infrastructure, not runtime authority

The backend must remain thin and must not own:

- SCADA runtime evaluation
- component rendering
- DSL execution
- device presentation state

A remote backend becomes useful when the product needs publication, sharing, synchronization or centralized package persistence.

Local editing should remain possible without it.

### 3.9 Action / Event public contracts are explicit

Component Actions and Events are public runtime APIs, not untyped callback names.

Action parameters are ordered scalar values validated against the public component definition. Event payloads are declared named scalar records with explicit required/optional fields.

Inbound runtime values and outbound Device/Platform Actions remain different host capabilities:

```text
RuntimeDataSource                  inbound telemetry/value state
ScadaDeviceActionDispatcher       outbound device/platform effects
```

Do not route outbound actions through a telemetry source abstraction merely because one already exists.

### 3.10 Persisted SCADA semantics are structured and canonical

DSL source text is an authoring surface, not the long-term runtime persistence authority.

Persisted Value Binding / Behavior / Interaction semantics must use canonical structured references and stable semantic IDs rather than compile-session statement positions.

Scene v7 is the first Scene revision carrying this canonical `scadaSemantics` contract. Legacy v5 bindings and v6 behaviors remain compatibility-only data and are not silently promoted into new semantics.

---

# 4. Milestone status

```text
M0 Application shell / Workspace                               complete enough
M1 Canvas / viewport / fixed artboard                          usable
M2 Editing commands / history / hierarchy                      usable
M3 Generic visual connections                                  usable
M4 Generic component kernel / registry                         accepted
M5 SCADA Runtime v0.1                                          accepted
M6 Component Workbench + scene semantics                       active
M7 Packaging / production adapters / reusable component set     later
```

Important accepted M6 baseline:

```text
M6.1 Package-backed public component contract                  accepted
M6.2 Layer Tree / Workbench shell                              accepted
M6.3 Visual authoring foundation                               accepted · 2026-08-26
M6.4 Animation / generic Visual Runtime foundation             accepted baseline
M6.5.4 Text-first SCADA DSL surface                            accepted
M6.5.5 Semantic lowering                                       accepted
M6.5.6 Static analysis                                         accepted
M6.5.7 Compiled runtime index                                  accepted
M6.5.8 Transactional propagation session                       accepted
M6.5.9A Runtime semantic hardening                             accepted · 2026-08-28
M6.5.9B Preview Runtime state ownership                        accepted · 2026-08-28
M6.5.9C Narrow Preview integration                             accepted · 2026-08-28
M6.5.10 Typed Action/Event contract + device dispatch          accepted · 2026-08-28
M6.5.11 Stable persistence semantics                           accepted · 2026-08-28
```

The project has already moved beyond the old `M6.4.7 active / M6.5 pending` roadmap. Do not resume work from that obsolete gate.

Detailed delivery history remains under `docs/progress/`.

---

# 5. Current runtime model

Scene-level semantics are intentionally narrow:

```text
Value Binding
multiple runtime values
        ↓ pure expression
Component Property

Behavior Binding
runtime data transition / condition
        ↓
Component Action
        ↓
component-private transient behavior

Interaction Binding
Component / user Event
        ↓
Device / Platform Action
```

Important rules:

- Value Binding is declarative and reconstructible.
- Behavior Binding reacts to data and may invoke Component Actions.
- Interaction Binding is the only SCADA DSL path that may invoke a Device/Platform Action.
- Data-driven device orchestration is outside this SCADA layer.
- `device.*` remains relative to the component instance's primary device.
- explicit external references remain stable and explicit.
- propagation evaluates affected Value Bindings first, settles derived Component Properties, then evaluates affected Behaviors once against the settled state.
- one RuntimeValueStore publication is propagated as one source transaction when multiple tracked source properties change together.
- propagation cycles are authoring errors and are isolated rather than accepted as fixed-point programs.
- runtime/propagation evaluation returns effects; host code executes side effects.
- Preview owns one settled Component Property snapshot used by both Renderer and Component Action handlers.
- Action arguments are ordered scalar arrays validated against public metadata before handler execution.
- Event payloads are named scalar records validated against public metadata before publication.
- Device/Platform Action effects cross an explicit outbound dispatcher boundary separate from inbound telemetry.
- Scene persistence stores canonical semantic structures, not authoring aliases or statement-position IDs.

QuickJS is **not** the current product center. Existing controlled-runtime experiments remain useful implementation evidence, but unrestricted or general-purpose scripting stays frozen unless a later requirement proves it necessary.

---

# 6. M6.5.9 runtime semantic hardening and Preview integration — accepted · 2026-08-28

M6.5.9 was intentionally split into three ordered slices so Preview integration did not outrun deterministic runtime semantics or state ownership.

## M6.5.9A Runtime semantic hardening — accepted · 2026-08-28

Accepted work:

1. reject multiple Value Binding writers targeting the same Component Property
2. define missing/unresolved derived-value invalidation semantics
3. prevent old derived values from leaking across primary-device rebind
4. make primary-device rebind atomic, including Behavior branch state rollback on failure
5. provide one validated compile entry point that performs the required parse/lower/analyze/structural checks before runtime construction
6. add regression fixtures for duplicate writers, missing values, rebind invalidation and rollback

Accepted semantic direction:

> A failed/unresolved derived Value Binding relinquishes its derived override so the effective property can fall back according to the host's normal authored/default layering. Last-known-good retention, if ever required, belongs to an explicit data-source/runtime policy rather than being an accidental DSL behavior.

## M6.5.9B Preview Runtime state ownership — accepted · 2026-08-28

Accepted work:

- deterministic effective property layering/order
- one immutable settled Component Property snapshot owned by Preview
- Renderer and Component Action handlers reading the same settled snapshot
- external RuntimeValueStore responsibilities separate from Component Property state
- legacy Scene v6 bindings as a lower-priority compatibility layer
- explicit compiled-semantics ownership that suppresses legacy Event -> Component Action dispatch for claimed nodes
- an explicit `componentPropertyChanged` host sequencing contract
- a runtime core that can be tested without loading built-in renderer assets

Legacy Scene v6 behavior remains compatibility-only. Do not extend it as the new behavior model.

## M6.5.9C Narrow Preview integration — accepted · 2026-08-28

Accepted work:

- one narrow runtime attachment from a validated compiled program to one live Preview component instance
- external RuntimeValueStore publications routed only through relevant compiled reverse-index dependencies
- multi-property source publications propagated as one transaction rather than source-arrival-order fragments
- an explicit Component Property base snapshot that excludes the compiled derived layer
- atomic derived-state commit into the host-owned Preview Component Property store
- Component Action effects executing only after the settled property snapshot is committed
- Renderer and Component Action handlers observing the exact same settled snapshot object
- Component Events routed into compiled Interaction Bindings while legacy Scene v6 Event behavior is suppressed for the claimed node
- successful Primary Device rebind committing without old-device derived leakage
- aborted source propagation/rebind exposing no partial derived Property or Component Action host effects
- disposal releasing compiled-derived state and restoring the legacy compatibility path

Accepted flow:

```text
external source publication
        ↓
compiled reverse index
        ↓
transactional propagation session
        ↓
settled effective Component Properties
        ├─ Renderer
        └─ Component Action handler context

Component Event
        ↓
Interaction Binding
        ↓
Device/Platform Action effect
        ↓
host dispatcher
```

---

# 7. M6.5.10 Typed Action / Event contract and device action dispatch — accepted · 2026-08-28

Accepted implementation:

- ordered Component Action parameter metadata
- explicit parameter names, scalar/select kind, nullability and trailing optionality
- named Component Event payload schemas with required/optional fields
- definition validation for malformed Action/Event contracts
- one ordered DSL Action argument model shared with runtime effects
- static Action arity/type validation for Component, primary-device and external Action calls
- validated/frozen Action argument arrays before Component Action handlers run
- validated/frozen Event payloads before Component Events are published
- parameterized Component Actions executing through the M6.5.9C Preview bridge
- an explicit `ScadaDeviceActionDispatcher` / `ScadaDeviceActionInvocation` outbound host interface
- strict separation between inbound `RuntimeDataSource` and outbound Device/Platform Action dispatch

Accepted runtime shape:

```text
DSL component.action(a, b)
        ↓
ordered compiled arguments
        ↓
PreviewRuntime.invokeAction
        ↓ validate / freeze
Component Action handler(context, [a, b])

Component implementation emits Event payload
        ↓ validate / freeze
Component Runtime Event
        ↓
Interaction Binding
        ↓
ScadaDeviceActionInvocation
        ↓
ScadaDeviceActionDispatcher
```

Important boundaries remain:

- an Event without a payload schema accepts no payload
- Event payloads reject unknown fields
- Action optional parameters must be trailing
- dynamic select values are validated against declared options at runtime
- Event payload fields are not yet exposed as DSL `event.*` expression references
- no production network/RPC adapter is required by the accepted gate

---

# 8. M6.5.11 Stable persistence semantics — accepted · 2026-08-28

Accepted persistence flow:

```text
DSL source
    ↓ parse / lower / analyze
validated semantic plan
    ↓ canonical persistence conversion
PersistedScadaSemantics v1
    ↓
Scene v7 component.scadaSemantics
```

Accepted work:

- stable Value Binding / Behavior / Interaction IDs independent of unrelated DSL statement position
- canonical primary-device-relative and explicit-source references after authoring symbol resolution
- a versioned structured `PersistedScadaSemantics` representation
- direct restore from persisted semantics into an executable semantic/compiled runtime plan without reparsing DSL text
- duplicate persisted ID, duplicate Value writer and Component Property cycle rejection
- current component-contract validation for persisted Component Property, Component Action and Component Event references
- Scene schema v7 with explicit `scadaSemantics: object | null` on serialized component nodes
- v1-v6 Scene migration to v7 with `scadaSemantics: null`
- preservation of legacy v5 runtime-value bindings and v6 Event -> Component Action behaviors as compatibility-only data
- save normalization through the current Scene parser/migrator rather than raw `JSON.stringify(scene)`
- deterministic persistence regression coverage in CI

Persistence rule:

> DSL source text and compile-session IDs are authoring/runtime-construction artifacts. The long-term Scene format stores canonical structured semantics with stable identity.

Scene v7 is justified by the new persisted SCADA semantic contract; it is not schema churn caused only by internal implementation changes.

Legacy v6 behavior remains compatibility-only and is not silently translated into new semantics.

Detailed acceptance record: `docs/progress/m6.5.11-stable-persistence-semantics.md`.

---

# 9. M6.6 Local persistence foundation — NEXT

This milestone replaces direct feature-level browser storage with an explicit storage boundary.

Target architecture:

```text
SCADA Works / Component Library
        ↓
Repository interfaces
        ├─ SceneRepository
        ├─ ComponentRepository
        └─ WorkspaceRepository as needed
        ↓
IndexedDB
```

Test architecture:

```text
same repository interfaces
        ↓
Memory repositories
        ↓
unit / integration fixtures
```

Required capabilities:

- IndexedDB-backed local persistence
- migration from currently supported `localStorage` data where practical
- versioned storage schema
- deterministic migration tests
- export debug snapshot
- import debug snapshot
- reset local database
- storage diagnostics

Debug snapshot should be a portable, versioned representation of the user-relevant local state so a browser-only bug can become a committed regression fixture.

Example shape, not frozen schema:

```json
{
  "schemaVersion": 1,
  "works": [],
  "components": [],
  "settings": {}
}
```

IndexedDB is preferred over `localStorage` for the long-term local layer because the project will eventually store larger structured documents and potentially binary assets.

M6.6 must keep local authoring backend-independent and should provide Memory repositories using the same public interfaces before browser storage details leak back into Workbench features.

---

# 10. M6.7 User component registration / publication

Only after runtime semantics and local storage boundaries are stable should remote component publication become active work.

Goal:

> Prove that a Workbench-authored component package can be consumed by SCADA Workbench through the same generic repository/registry path as built-ins without component-specific editor code.

Expected local/remote split:

```text
Component Workbench
        ↓ autosave / local draft
IndexedDB
        ↓ explicit publish
Remote Component Repository / API
        ↓
SCADA Workbench / other clients
```

The existing thin Fastify/PostgreSQL experiment may be reused or redesigned at this point.

Backend responsibilities may include:

- component package persistence
- publication state
- revision/version metadata
- remote retrieval/sharing
- later synchronization if explicitly needed

Backend responsibilities must **not** expand into SCADA runtime ownership.

No backend server needs to be provisioned for the current M6 work.

---

# 11. Backend deployment policy

Current state:

- backend source code exists under `server/`
- deployment assets exist under `deploy/`
- current front-end authoring paths use browser-local persistence
- the current runtime work does not require a live backend
- the previous backend host is no longer considered required infrastructure

Policy until M6.7:

> Treat production backend deployment as deferred infrastructure.

Before the next intentional backend deployment, re-evaluate:

- API contract
- package lifecycle (`draft` / `published`)
- revision/version semantics
- authentication model
- component type uniqueness
- whether SCADA Works require remote persistence at all

The repository should not pay an architectural or operational cost merely so local browser state is externally visible during development. Debug snapshots and deterministic fixtures are the preferred debugging bridge.

---

# 12. Immediate execution sequence

Current execution order from `main` plus the accepted runtime/persistence gates:

```text
1. M6.5.9A runtime semantic hardening                                  accepted · 2026-08-28
2. M6.5.9B Preview Runtime state ownership                             accepted · 2026-08-28
3. M6.5.9C narrow Preview integration                                  accepted · 2026-08-28
4. M6.5.10 typed Action/Event contract + action dispatcher             accepted · 2026-08-28
5. M6.5.11 stable scene persistence semantics                          accepted · 2026-08-28
6. M6.6 storage abstraction + IndexedDB + debug snapshot               NEXT
7. M6.7 user component publication / optional backend                  later
8. M7 packaging / production adapters / reusable component set         later
```

The **next implementation step is M6.6 Local persistence foundation**.

Do not restart M6.4 effect experimentation, do not revive QuickJS as the main product path, and do not provision a backend before a remote-publication requirement exists.

---

# 13. Verification policy

A milestone is not accepted merely because the TypeScript compiles.

Use the narrowest relevant verification set:

- deterministic model/runtime scripts for semantic behavior
- CI for build, runtime checks and lint
- regression fixtures for every repaired runtime edge case
- deployed Pages smoke when browser/UI behavior changes
- storage migration fixtures when persistence formats change
- debug snapshots when a browser-only failure must be reproduced

Runtime tests should prefer explicit inputs and deterministic snapshots over timing-sensitive renderer inspection whenever possible.

---

# 14. Near-term non-goals

The following should not distract the active M6 work:

- production backend provisioning
- component marketplace
- collaborative editing
- general-purpose process orchestration
- data-driven device command chains
- unrestricted JavaScript execution
- arbitrary DOM / React / Konva access from authored logic
- arbitrary keyframe/timeline editor
- new named animation families without a demonstrated generic-runtime gap
- full vector illustration tooling
- arbitrary path editing
- protocol-specific component APIs
- premature Scene schema churn

These items are deferred or outside the SCADA layer, not necessarily rejected forever.
