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

M8 now has a dependency-complete portable work artifact and an explicit fresh-browser transfer path. The current product boundary is **running that exact artifact in a standalone, read-only surface without first importing it into Studio authoring state**.

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
        ├─ IndexedDB       browser/local authoring authority
        └─ Memory          deterministic fixtures
```

`localStorage` is migration input only. Save succeeds only after the asynchronous repository write succeeds.

A standalone runtime that directly consumes a distribution artifact is **not** an authoring repository client and must not persist merely to become runnable.

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

A runnable work artifact must make its portable user-component dependencies explicit. Trusted built-in/native components remain host capabilities rather than copied dependencies.

Validation of a candidate artifact must not require mutating the live Studio component registry first.

Exact work-package closure means every non-host Scene component type is supplied once by the artifact and every supplied portable dependency is actually referenced by that Scene.

Browser import preserves that contract: inspection is side-effect free, conflicting same-type definitions fail closed, and a confirmed import cannot persist only part of the work dependency closure.

Standalone runtime loading preserves the same artifact authority: bundled dependencies are runtime-scoped capabilities, not an excuse to silently install packages into Studio state.

### 3.12 Standalone runtime state is package-scoped

A standalone runtime instance owns the runtime registry and runtime session for the loaded work package.

```text
trusted host registrations
+ bundled portable dependencies
        ↓
package-scoped ComponentRegistry
        ↓
package-scoped runtime session
```

The standalone path must not require `studioComponentRegistry`, local component installation, authoring persistence or editor mock telemetry before it can render the package.

Real runtime data/action adapters remain explicit host capabilities and are not inferred from the work artifact.

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
M8 Portable SCADA Work + Standalone Runtime                     active · M8B1 ACTIVE
```

M6 acceptance established the browser-first authoring/runtime baseline: Component Workbench, typed public contracts, Scene v7 canonical semantics, IndexedDB repositories, local user-component activation and optional immutable publication/install flows.

M7 acceptance established transport-neutral component packages, explicit browser component transfer, protocol-neutral production adapter lifecycle, deliberate concrete-transport deferral, and a real reusable portable starter component set.

M8A1 established registry-scoped Scene validation. M8A2 established the dependency-complete work-package artifact. M8A3 proved explicit browser transfer across a fresh-browser boundary with atomic persistence and dependency activation.

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

Accepted M7 boundaries:

- M7A1 transport-neutral distributable component package codec
- M7A2 explicit browser component export/import
- M7B1 protocol-neutral `ManagedRuntimeAdapter` lifecycle
- M7B2 concrete transport selection decision: **defer until a real target exists**
- M7C1 reusable portable starter packages:
  - `starter.process-valve`
  - `starter.running-motor`
  - `starter.signal-quality`

Final M7 acceptance revision:

`main@247b66feb48195c25f43c82b6e07d22975e447ff`

Evidence:

- main CI #725 (`33363995515`) passed
- Deploy GitHub Pages #235 (`33363995500`) passed
- Pages Browser Smoke #186 (`33364034832`) passed

Records:

- `docs/progress/m7-roadmap-decomposition.md`
- `docs/progress/m7c1-reusable-component-baseline.md`
- `docs/progress/m7-closeout.md`

---

## 7. M8 Portable SCADA Work + Standalone Runtime — active

### 7.1 M8 direction

The historical product path stopped inside the editor and exported only raw Scene JSON. M8 establishes this path instead:

```text
saved SCADA work
    + required portable user-component dependencies
        ↓ explicit packaging
versioned validated work artifact
        ↓
explicit browser transfer / standalone runtime load
        ↓
read-only runnable SCADA surface
```

Built-in/native components remain host capabilities. Portable user components are explicit dependencies when the work requires them.

Do not treat a debug snapshot or raw editor Scene export as a distribution format.

### M8A1 Registry-scoped Scene validation — accepted · 2026-08-31

Accepted boundary:

- `ComponentRegistryView`
- `parseSceneDocumentWithRegistry()`
- `serializeSceneDocumentWithRegistry()`
- Property, Anchor, legacy Action/Event and canonical Scene v7 semantic validation resolve through the supplied registry
- isolated validation does not mutate `studioComponentRegistry`

Evidence:

- PR #104
- merged revision `main@fa588c251c0d65b7521452b1763feed620749b7e`
- PR-head CI #734 (`33365358054`) passed

Record: `docs/progress/m8a1-registry-scoped-scene-validation.md`.

### M8A2 Portable SCADA work package codec — accepted · 2026-08-31

Accepted artifact:

```text
ScadaWorkPackage
├─ packageVersion
├─ scene                  canonical/migrated Scene v7
└─ dependencies[]         distributable portable user components

host capabilities         trusted built-in/native registrations, injected
```

Accepted rules include exact dependency closure, no host shadowing, deterministic dependency normalization, no global-registry mutation, current declarative-only portable execution, and Scene migration/validation through M8A1.

Evidence:

- PR #105
- final PR head `af9702d493867525b1f7b6cee88522717d2fbeb3`
- final PR CI #737 (`33377056756`) passed
- merged revision `main@49d29f98ae8d3a5700738c44c8bb497514e662ce`
- Deploy GitHub Pages #238 passed
- Pages Browser Smoke #189 passed

Record: `docs/progress/m8a2-portable-work-package-codec.md`.

### M8A3 Explicit browser SCADA work package transfer — accepted · 2026-08-31

Accepted browser flow:

```text
persisted SCADA work
    ↓ exact dependency resolution
.scada-work.json
    ↓ fresh browser / file selection
side-effect-free package + inventory preflight
    ↓ explicit confirmation
atomic Scene + missing-dependency persistence
    ↓
normal component activation + SCADA editor/runtime
```

Accepted properties:

- export uses the exact persisted Scene, not unsaved editor memory
- built-ins remain host capabilities
- portable dependencies form an exact distributable closure
- same-type local/installed dependencies are reused only when normalized packages are identical
- conflicts fail before confirmation and without mutation
- imported work/dependencies receive fresh local identities
- Scene + missing dependencies commit in one IndexedDB transaction
- activation happens only after commit
- deployed smoke proves the complete flow in isolated browser contexts

Acceptance evidence:

- PR #106
- final PR head `44ac595be468aae261cbe60de9ede846018dac7b`
- final PR CI #745 (`33385557424`) passed
- merged revision `main@2725abf1eafa953abfbabe456a1d63e9d3526dcd`
- Deploy GitHub Pages #239 (`33390783353`) passed
- Pages Browser Smoke #190 (`33390834150`) passed, including the fresh-browser work-package transfer scenario

Record: `docs/progress/m8a3-browser-work-package-transfer.md`.

### M8B1 Standalone/read-only runtime shell — ACTIVE

Goal:

> Load the exact accepted `.scada-work.json` directly into a standalone runtime surface without first importing the work or its bundled dependencies into Studio authoring state.

Target flow:

```text
.scada-work.json
    ↓ direct parse/preflight
trusted host registrations + bundled portable dependencies
    ↓ package-scoped ComponentRegistry
package-scoped runtime session
    ↓
read-only Scene render surface
```

Acceptance requirements:

- expose an explicit standalone runtime route independent from the Workspace/editor storage gates
- consume the existing M8 work artifact; do not invent a second runtime/debug format
- validate the package against trusted host capabilities before runtime construction
- build a runtime-owned registry from trusted host registrations plus bundled portable dependencies
- revalidate the Scene against the actual runtime registrations that will render it
- do not register bundled dependencies into `studioComponentRegistry`
- do not persist the Scene or materialize bundled dependencies into IndexedDB merely to run them
- keep Studio authoring modules lazy so directly opening the runtime route does not initialize authoring persistence as an import side effect
- own a dedicated runtime instance for the loaded package
- do not start editor mock telemetry in standalone mode
- render Scene background, groups, visual connections, trusted native components and portable declarative composite components
- preserve existing declarative Visual Rules/animations through the portable component renderer
- expose no selection/drag/resize/rotate/undo/save/inspector/component-palette authoring surface
- unsupported/malformed/dependency-incomplete packages fail closed
- deterministic fixture proves package-scoped registry/runtime ownership and absence of Studio/global activation dependencies
- deployed fresh-browser Pages smoke proves direct package load/render and verifies the Studio IndexedDB database is not initialized by standalone load

Architectural constraint:

> M8B1 is a runtime host for the accepted artifact, not another installation path. Package dependencies are runtime-scoped capabilities. Real telemetry/action transport remains a separate explicit host concern.

Record:

- `docs/progress/m8b1-standalone-runtime-shell.md`

### After M8B1

Do not automatically invent M8B2.

After M8B1 acceptance, perform an M8 closeout review against the original goal:

```text
dependency-complete artifact
+ explicit browser transfer
+ fresh-browser standalone runtime
```

If those goals are satisfied, close M8. Add another M8 implementation slice only for a demonstrated missing portability/runtime requirement.

Concrete runtime transport remains deferred until M7B2 reopening conditions are met by a real integration target.

---

## 8. Immediate execution sequence

```text
M6 browser-first authoring/runtime foundation                   accepted · 2026-08-30
M7A portable component package + browser transfer               accepted
M7B protocol-neutral runtime adapter lifecycle                  accepted
M7B2 concrete transport                                         deferred until real target
M7C1 reusable portable starter packages                         accepted · 2026-08-31
M7 closeout                                                     accepted · 2026-08-31
M8A1 registry-scoped Scene validation                           accepted · 2026-08-31
M8A2 dependency-complete portable work package                  accepted · 2026-08-31
M8A3 explicit browser work package transfer                     accepted · 2026-08-31
M8B1 standalone/read-only runtime shell                         ACTIVE
```

**Current implementation gate: M8B1 Standalone/read-only runtime shell.**

Do not select or implement a concrete runtime transport, add hidden package installation, execute `implementationDraft`, or provision production publication infrastructure while the current gates remain closed/deferred.

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
- M8 work-package fixtures for exact dependency closure, host-capability collision handling, deterministic normalization and fail-closed Scene/package validation
- M8 browser-transfer fixtures for dependency resolution/reuse/collision planning
- M8 deployed browser-transfer smoke for fresh-browser atomic import/activation
- M8 standalone-runtime fixture for isolated registry/session construction with no mock or Studio activation dependency
- M8 deployed standalone-runtime smoke for fresh-browser direct package load/render with no authoring IndexedDB side effect

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 10. Current non-goals / reopening conditions

Do not distract M8B1 with:

- production publication-backend provisioning while M6.7B3 remains deferred
- speculative MQTT/WebSocket/HTTP/SSE/vendor adapter implementation
- protocol-specific Component, Scene or work-package fields
- outbound command replay/exactly-once claims without protocol idempotency support
- executable `implementationDraft`
- portable Actions/Events without an accepted executable contract
- automatic remote dependency fetching during runtime load
- hidden local installation of bundled runtime dependencies
- runtime editing/persistence
- editor mock telemetry in standalone mode
- component marketplace/catalog expansion
- large starter component catalogs
- unrestricted JavaScript
- arbitrary DOM / React / Konva authored access
- full vector illustration/path tooling
- collaborative editing

These are deferred or separate concerns, not rejected forever.
