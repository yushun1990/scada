# SCADA Editor Lab Development Plan

## 1. Purpose

`PLAN.md` is the **authoritative current execution roadmap and architecture gate** for this repository.

It intentionally does not duplicate full delivery history. Detailed milestone evidence belongs under `docs/progress/`.

When this file and an older progress note disagree about what happens next, this file wins.

---

## 2. Product direction

This repository is a browser-first generic SCADA authoring and runtime experiment with two deliberately different authoring surfaces:

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
│           └─ preview
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

Guiding product rule:

> Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.

SCADA is not a general rule engine. Scene-level runtime semantics remain focused on presentation state and explicit user/component interactions.

The next product boundary is now **getting a finished work out of the editor as a dependency-complete, validated, runnable artifact**.

---

## 3. Accepted architecture invariants

### 3.1 Public component contract vs private implementation

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

### 3.2 Renderer-independent runtime boundary

User-authored behavior must not receive raw React, DOM, or `Konva.Node` objects as its programming contract.

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
```

Runtime evaluation produces deterministic state/effects; the host owns side effects.

### 3.3 Visual connection and runtime behavior remain separate

```text
SceneConnection
= visible pipe / wire / process line

Value / Behavior / Interaction Binding
= runtime semantics
```

Visual Anchors are not runtime ports.

### 3.4 One effective Component Property truth

Renderer and Component Action handlers observe the same effective Component Property snapshot.

Authored/default, external-binding and derived layers may be separate internally, but final effective state has one owner and deterministic ordering.

### 3.5 Declarative semantics fail closed

- one Component Property has at most one declarative Value Binding writer in one compiled scene program
- missing/unresolved derived values use explicit invalidation
- cycles are authoring errors, not fixed-point programs
- primary-device rebind is transactional
- persisted Scene v7 semantics are structured/canonical; DSL text is not persistence authority

### 3.6 Local-first persistence remains the authoring authority

```text
Workbench / Runtime-facing repositories
        ↓
Storage abstraction
        ├─ IndexedDB       browser/local authority
        └─ Memory          deterministic fixtures
```

`localStorage` is migration input only. Save succeeds only after the asynchronous repository write succeeds.

### 3.7 Backend is optional infrastructure

The publication backend must not own SCADA runtime evaluation, rendering, DSL execution or device presentation state.

Production publication deployment remains deferred by the accepted M6.7B3 decision until an explicit new deploy-now gate is opened.

### 3.8 Component distribution is not local authoring identity

```text
ComponentLibraryEntry
= local editable document + local metadata

Distributable component package
= transport-neutral validated artifact

Published / installed remote record
= distribution artifact + immutable remote provenance
```

Local IndexedDB identity, publication identity and protocol-specific configuration do not belong in reusable component packages.

### 3.9 Production adapter lifecycle is host-owned

```text
RuntimeDataSource                  inbound telemetry/value state
ScadaDeviceActionDispatcher       outbound device/platform effects
```

Protocol connection/reconnect state is infrastructure, not Component or Scene semantics.

Reconnect may resume inbound telemetry but must not silently replay outbound commands. Stronger guarantees require explicit protocol-level correlation/idempotency semantics.

Do not invent MQTT/WebSocket/HTTP/vendor contracts without a real integration target.

### 3.10 Portable user execution remains explicit

Current ready user composite activation supports declarative visuals/rules/animations and intentionally rejects packages that declare Actions/Events because no accepted portable executable implementation contract exists.

`implementationDraft` is inert.

Trusted built-ins may implement Actions/Events. Do not silently turn draft text into executable portable behavior.

### 3.11 Work portability must be dependency-complete

A raw Scene v7 document references component types but does not contain user-component definitions.

A future runnable work artifact must make its component dependencies explicit. Validation of a candidate artifact must not require mutating the live Studio component registry first.

---

## 4. Milestone status

```text
M0 Application shell / Workspace                               complete enough
M1 Canvas / viewport / fixed artboard                          usable
M2 Editing commands / history / hierarchy                      usable
M3 Generic visual connections                                  usable
M4 Generic component kernel / registry                         accepted
M5 SCADA Runtime v0.1                                          accepted
M6 Component Workbench + scene semantics                       accepted · 2026-08-30
M7 Packaging / adapter foundation / reusable components         accepted · 2026-08-31
M8 Portable SCADA Work + Standalone Runtime                     active · M8A1 NEXT
```

M6 acceptance established the browser-first authoring/runtime baseline: Component Workbench, typed public contracts, Scene v7 canonical semantics, IndexedDB repositories, local user-component activation and optional immutable publication/install flows.

M7 acceptance established: transport-neutral component packages, explicit browser component transfer, protocol-neutral production adapter lifecycle, deliberate concrete-transport deferral, and a real reusable portable starter component set.

Detailed history: `docs/progress/`.

---

## 5. Current runtime model

Scene-level semantics remain intentionally narrow:

```text
Value Binding
runtime values
    ↓ pure expression
Component Property

Behavior Binding
runtime transition / condition
    ↓
Component Action
    ↓
component-private transient behavior

Interaction Binding
Component / user Event
    ↓
Device / Platform Action
```

Current rules:

- Value Binding is declarative and reconstructible.
- Behavior Binding reacts to runtime data and may invoke Component Actions.
- Interaction Binding is the SCADA DSL path for Device/Platform Actions.
- data-driven device orchestration remains outside this SCADA layer.
- `device.*` remains relative to the component instance's primary device.
- propagation settles affected Value Bindings before affected Behaviors.
- one RuntimeValueStore publication is one source transaction.
- Preview owns the settled Component Property snapshot used by Renderer and Action handlers.
- runtime evaluation produces effects; host code executes effects.

QuickJS is not the current product center. Existing controlled-runtime experiments remain evidence only unless a later requirement proves general-purpose scripting necessary.

---

## 6. M7 closeout — accepted · 2026-08-31

M7 is closed. Do not create an M7C2 merely to continue numbering.

### M7A Portable component package boundary — accepted

- M7A1 transport-neutral distributable package codec — accepted
- M7A2 explicit browser export/import — accepted

### M7B Production runtime adapter foundation — accepted / concrete transport deferred

- M7B1 protocol-neutral `ManagedRuntimeAdapter` lifecycle — accepted
- M7B2 concrete transport selection — accepted decision: defer until a real target exists

### M7C Reusable component proof set — accepted

M7C1 ships three real public distributable artifacts:

- `starter.process-valve`
- `starter.running-motor`
- `starter.signal-quality`

They prove Properties, Anchors, composite visuals, Visual Rules, Spin/Blink animation, package round-trip, repository persistence/hydration and generic activation without component-specific runtime code.

Final acceptance revision:

`main@247b66feb48195c25f43c82b6e07d22975e447ff`

Evidence:

- main CI #725 (`33363995515`) passed
- Deploy GitHub Pages #235 (`33363995500`) passed
- Pages Browser Smoke #186 (`33364034832`) passed, including deployed starter-package import/persistence/palette activation

Records:

- `docs/progress/m7-roadmap-decomposition.md`
- `docs/progress/m7c1-reusable-component-baseline.md`
- `docs/progress/m7-closeout.md`

The starter set did not demonstrate a blocking need for portable executable Actions/Events, arbitrary Property-to-text projection, continuous numeric visual projection, or automatic starter installation. Those remain separate future requirements if real use cases demand them.

---

## 7. M8 Portable SCADA Work + Standalone Runtime — active

### 7.1 Why M8 exists

The current product path stops inside the editor:

```text
SCADA Works
  -> Edit
  -> Design / Preview
  -> Save locally or export raw Scene JSON
```

Current repository audit shows:

- `App.tsx` has workspace/editor routes but no standalone runtime route
- `WorkspacePage.tsx` offers `Edit` for works but no Run/Package/Publish action
- `ScadaEditorPage.tsx` has editor-local `Design` / `Preview` only
- Scene export is raw `SceneDocument` JSON
- Scene v7 nodes reference component `type`; portable user-component definitions are not embedded
- `parseSceneDocument()` resolves types against the mutable live Studio registry
- connection Anchor validation resolves through the same live registry

Therefore raw `.scene.json` is not a dependency-complete runnable work on a fresh browser.

### 7.2 Desired M8 direction

```text
saved SCADA work
    + required portable user-component dependencies
        ↓ explicit packaging
versioned validated work artifact
        ↓
explicit import / standalone runtime load
        ↓
read-only runnable SCADA surface
```

Built-in/native components remain host capabilities. Portable user components may be carried as explicit work dependencies.

Do not treat a debug snapshot as a distribution format.

### M8A1 Registry-scoped Scene validation boundary — NEXT

Goal:

> Validate/migrate a Scene against an explicit component registry view without mutating the product-global `studioComponentRegistry`.

This is required before a work-package codec can safely preflight bundled component dependencies.

Acceptance requirements:

- preserve current Scene v1-v7 migration and default `parseSceneDocument()` behavior
- provide an explicit scoped Scene parse/serialize validation path against a supplied component registry/definition resolver
- Property validation uses the supplied component definition
- legacy Action/Event behavior validation uses the supplied registry
- canonical Scene v7 semantic contract validation uses the supplied definition
- visual connection Anchor validation uses the same supplied registry
- unknown component types fail closed within that scope
- validation does not register/unregister anything in `studioComponentRegistry`
- deterministic fixture proves two isolated registries can validate the same Scene differently without cross-contamination
- existing scene/runtime regressions remain green

Architectural constraint:

> M8A1 is dependency injection for validation, not a second component system.

Keep the existing Studio registry as the default product dependency through a wrapper so current editor call sites do not churn unnecessarily.

### After M8A1

Do not jump directly to deployment hosting.

Re-evaluate and then sequence the minimum necessary slices, expected to include:

1. transport-neutral versioned SCADA work package with dependency closure
2. explicit browser work export/import using that codec
3. standalone/read-only runtime shell consuming the same artifact
4. real runtime transport integration only when M7B2 reopening conditions are satisfied

The exact package shape must be designed after M8A1 makes isolated validation possible.

---

## 8. Immediate execution sequence

```text
M6 browser-first authoring/runtime foundation                   accepted · 2026-08-30
M7A portable component package + browser transfer               accepted
M7B protocol-neutral runtime adapter lifecycle                  accepted
M7B2 concrete transport                                         deferred until real target
M7C1 reusable portable starter packages                         accepted · 2026-08-31
M7 closeout                                                     accepted · 2026-08-31
M8A1 registry-scoped Scene validation                           NEXT
```

**Current implementation gate: M8A1 Registry-scoped Scene validation boundary.**

Do not restart M6 effect experimentation, revive QuickJS as the main product path, invent a concrete transport without a target, execute `implementationDraft`, or provision production publication infrastructure while M6.7B3 remains `defer deployment`.

---

## 9. Verification policy

A milestone is not accepted merely because TypeScript compiles.

Use the narrowest relevant verification set:

- deterministic model/runtime scripts for semantic behavior
- CI Build + runtime/model checks + Lint
- regression fixtures for repaired runtime edges
- deployed Pages smoke when browser/UI/public distribution behavior changes
- storage migration fixtures when persistence formats change
- publication contract and PostgreSQL/API integration when remote publication behavior changes
- M7 component-package fixtures for codec, transfer, persistence and activation
- M7 runtime-adapter fixtures for lifecycle/reconnect/fencing/no-replay
- M8 scoped-scene fixtures for isolated registry validation and legacy/current schema behavior
- future M8 work-package fixtures must verify dependency closure and fail-closed validation before persistence/activation

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 10. Current non-goals / reopening conditions

Do not distract M8A1 with:

- production publication-backend provisioning while M6.7B3 remains deferred
- speculative MQTT/WebSocket/HTTP/SSE/vendor adapter implementation
- protocol-specific Component or Scene fields
- outbound command replay/exactly-once claims without protocol idempotency support
- executable `implementationDraft`
- portable Actions/Events without an accepted executable contract
- component marketplace/catalog expansion
- large starter component catalogs
- unrestricted JavaScript
- arbitrary DOM / React / Konva authored access
- full vector illustration/path tooling
- collaborative editing
- standalone runtime hosting infrastructure before the local artifact/runtime boundary exists

These are deferred or separate concerns, not rejected forever.
