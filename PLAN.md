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
M6.5.9C Narrow Preview integration                             implementation complete · review gate
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

QuickJS is **not** the current product center. Existing controlled-runtime experiments remain useful implementation evidence, but unrestricted or general-purpose scripting stays frozen unless a later requirement proves it necessary.

---

# 6. Current gate — M6.5.9 runtime semantic hardening and Preview integration

M6.5.9 is split into three ordered slices. A and B are accepted; C is the current review gate.

## M6.5.9A Runtime semantic hardening — accepted · 2026-08-28

Goal:

> Make the compiled scene program deterministic and rebind-safe before connecting it to real Preview state.

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

Goal:

> Define one host-owned effective Component Property model before applying DSL propagation effects to the renderer.

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

A later Scene schema revision may migrate/remove it after the new model is proven.

## M6.5.9C Narrow Preview integration — current review gate

Goal:

> Connect the accepted compiled runtime to Preview through the state ownership model established in M6.5.9B.

Implementation establishes:

- one narrow runtime attachment from a validated compiled program to one live Preview component instance
- external RuntimeValueStore publications routed only through relevant compiled reverse-index dependencies
- multi-property source publications propagated as one transaction rather than source-arrival-order fragments
- an explicit Component Property base snapshot that excludes the compiled derived layer
- atomic derived-state commit into the host-owned Preview Component Property store
- Component Action effects executing only after the settled property snapshot is committed
- Renderer and Component Action handlers observing the exact same settled snapshot object
- Component Events routed into compiled Interaction Bindings while legacy Scene v6 Event behavior is suppressed for the claimed node
- Device / Platform Action effects exposed through a narrow host dispatcher callback
- successful Primary Device rebind committing without old-device derived leakage
- aborted source propagation/rebind exposing no partial derived Property or Component Action host effects
- disposal releasing compiled-derived state and restoring the legacy compatibility path

Accepted target flow under review:

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

The regression fixture covers every M6.5.9C acceptance item, including forced source-batch and rebind aborts.

Do not persist the compiled program into Scene v6 merely to complete this gate. Stable persistence remains M6.5.11 work.

---

# 7. M6.5.10 Typed Action / Event contract and device action dispatch — NEXT after 9C acceptance

Current public Action/Event metadata is insufficient for general typed DSL integration.

Before broad persistence/UI authoring, settle:

- Action parameter/input schema
- Event payload schema
- DSL action-call argument model
- runtime handler input model
- static validation against the public contract
- explicit host interface for Device/Platform Action dispatch

Do not overload `RuntimeDataSource` merely because it already represents incoming values. Reading telemetry and dispatching actions are separate host capabilities.

M6.5.9C intentionally executes only zero-argument Component Action effects through the Preview bridge. Parameterized Component Actions are diagnosed rather than guessed because mapping DSL positional arguments into the current single `unknown` handler input belongs to this gate.

---

# 8. M6.5.11 Stable persistence semantics

Before storing the new scene semantics as the long-term scene format, settle:

- stable binding/behavior/interaction IDs independent of statement position
- canonical structured references after DSL authoring resolution
- scene-schema migration strategy
- compatibility with legacy Scene v6 behavior
- persistence representation for the accepted semantic model

The DSL text is an authoring surface, not automatically the persistence model.

Do not introduce a Scene schema revision only because implementation internals changed; require a real persisted-contract need.

---

# 9. M6.6 Local persistence foundation

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

Do not interrupt active M6.5 runtime work merely to migrate storage early.

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

No backend server needs to be provisioned for the current M6.5 work.

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

Current execution order from `main` plus the active review branch:

```text
1. M6.5.9A runtime semantic hardening                                  accepted · 2026-08-28
2. M6.5.9B Preview Runtime state ownership                             accepted · 2026-08-28
3. M6.5.9C narrow Preview integration                                  current review gate
4. M6.5.10 typed Action/Event contract + action dispatcher             NEXT after 9C acceptance
5. M6.5.11 stable scene persistence semantics                          next
6. M6.6 storage abstraction + IndexedDB + debug snapshot               after runtime semantics
7. M6.7 user component publication / optional backend                  later
8. M7 packaging / production adapters / reusable component set         later
```

The **next implementation step after the current M6.5.9C review gate is M6.5.10**.

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

The following should not distract the active M6.5 work:

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
