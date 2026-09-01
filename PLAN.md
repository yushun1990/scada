# SCADA Editor Lab Development Plan

## 1. Purpose

`PLAN.md` is the **authoritative current execution roadmap and architecture gate** for this repository.

It intentionally stays concise. Detailed milestone evidence belongs under `docs/progress/`; detailed architecture belongs under `docs/architecture/`.

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
│           ├─ configure public attributes
│           ├─ bind runtime properties
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

The accepted target component contract separates authored static **Attributes** from runtime/bindable **Properties**. That architecture is recorded in `docs/architecture/component-attributes-properties.md`, but its schema migration remains gated until M8 portability/runtime closeout is complete.

---

## 3. Accepted architecture invariants

### 3.1 Public component contract vs private implementation

Reusable component public contract:

```text
Attributes + Properties + Actions + Events + Anchors
```

Semantics:

```text
Attribute = authored static presentation/configuration
Property  = runtime semantic value/state and binding target
Action    = callable component capability
Event     = discrete occurrence
Anchor    = visual connection geometry
```

Runtime/value bindings target Properties, never Attributes. Runtime telemetry must not overwrite authored Attributes.

Private implementation remains host/component-owned by default:

```text
Visual Layers
SVG / Image / Vector / Text internals
Visual Rules
Visual animation / behavior
Internal transient state
Scripts / implementation details
Native renderer details
```

### 3.2 Renderer-independent runtime boundary

User-authored behavior must not receive raw React, DOM or `Konva.Node` objects as its programming contract.

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

### 3.4 Attribute / Property authority split

A component implementation may combine static Attributes and dynamic Properties to derive visual output:

```text
Property.running
+ Attribute.runningColor
+ Attribute.stoppedColor
        ↓
component-private rule
        ↓
visual state
```

Rules:

- Attributes are authored/persisted component configuration.
- Properties are runtime-capable semantic values and the only Value Binding targets.
- Attribute changes happen through authoring/configuration flows, not telemetry propagation.
- runtime Property updates must not rewrite authored Attribute state or editor history.
- internal transient/visual state stays private unless deliberately exposed.
- component type identity represents a genuinely different component, not a running/alarm/fault/color combination.

### 3.5 One effective Component Property truth

Renderer and Component Action handlers observe the same effective Component Property snapshot.

Authored/default fallback, external binding and derived layers may be separate internally, but final effective Property state has one owner and deterministic ordering.

### 3.6 Declarative semantics fail closed

- one Component Property has at most one declarative Value Binding writer in one compiled scene program
- Attributes cannot be declarative Value Binding targets
- missing/unresolved derived values use explicit invalidation
- cycles are authoring errors, not fixed-point programs
- primary-device rebind is transactional
- persisted Scene v7 semantics are structured/canonical; DSL text is not persistence authority
- accepted persisted semantics must not be silently ignored by a runtime host that claims to run the Scene

### 3.7 Local-first persistence remains the authoring authority

```text
Workbench / Runtime-facing repositories
        ↓
Storage abstraction
        ├─ IndexedDB       browser/local authoring authority
        └─ Memory          deterministic fixtures
```

`localStorage` is migration input only. Save succeeds only after the asynchronous repository write succeeds.

A standalone runtime that directly consumes a distribution artifact is **not** an authoring repository client and must not persist merely to become runnable.

### 3.8 Backend is optional infrastructure

The publication backend must not own SCADA runtime evaluation, rendering, DSL execution or device presentation state.

Production publication deployment remains deferred by the accepted M6.7B3 decision until an explicit deploy-now gate is opened.

### 3.9 Component distribution is not local authoring identity

```text
ComponentLibraryEntry
= local editable document + local metadata

Distributable component package
= transport-neutral validated artifact

Published / installed remote record
= distribution artifact + immutable remote provenance
```

Local IndexedDB identity, publication identity and protocol-specific configuration do not belong in reusable component packages.

### 3.10 Production adapter lifecycle is host-owned

```text
RuntimeDataSource                  inbound telemetry/value state
ScadaDeviceActionDispatcher       outbound device/platform effects
```

Protocol connection/reconnect state is infrastructure, not Component or Scene semantics.

Reconnect may resume inbound telemetry but must not silently replay outbound commands. Stronger guarantees require explicit protocol-level correlation/idempotency semantics.

Do not invent MQTT/WebSocket/HTTP/vendor contracts without a real integration target.

### 3.11 Portable user execution remains explicit

Current ready user composite activation supports declarative visuals/rules/animations and intentionally rejects packages that declare Actions/Events because no accepted portable executable implementation contract exists.

`implementationDraft` remains inert.

Trusted built-ins may implement Actions/Events. Do not silently turn draft text into executable portable behavior.

### 3.12 Work portability must be dependency-complete

A raw Scene v7 document references component types but does not contain user-component definitions.

A runnable work artifact must make its portable user-component dependencies explicit. Trusted built-in/native components remain host capabilities rather than copied dependencies.

Validation must not require mutating the live Studio component registry first.

Exact work-package closure means every non-host Scene component type is supplied once by the artifact and every supplied portable dependency is actually referenced by that Scene.

Browser import preserves that contract: inspection is side-effect free, conflicting same-type definitions fail closed, and a confirmed import cannot persist only part of the work dependency closure.

Standalone loading preserves the same artifact authority: bundled dependencies are runtime-scoped capabilities, not an excuse to silently install packages into Studio state.

The phrase **dependency-complete work artifact** is not considered fully satisfied until portable visual-resource closure is accepted.

### 3.13 Standalone runtime state is package-scoped

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
M8 Portable SCADA Work + Standalone Runtime                     active · CLOSEOUT BLOCKED
```

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
- Value Binding targets Component Properties only; Attributes remain authored configuration.
- component visual behavior may read both effective Properties and Attributes.
- Behavior Binding reacts to runtime data and may invoke Component Actions.
- Interaction Binding is the SCADA DSL path for Device/Platform Actions.
- data-driven device orchestration remains outside this SCADA layer.
- `device.*` remains relative to the component instance's primary device.
- propagation settles affected Value Bindings before affected Behaviors.
- one `RuntimeValueStore` publication is one source transaction.
- Preview owns the settled Component Property snapshot used by Renderer and Action handlers.
- runtime evaluation produces effects; host code executes effects.

QuickJS is not the current product center. Existing controlled-runtime experiments remain evidence only unless a later requirement proves general-purpose scripting necessary.

---

## 6. M7 closeout — accepted · 2026-08-31

M7 is closed. Do not create an M7C2 merely to continue numbering.

Accepted boundaries:

- M7A1 transport-neutral distributable component package codec
- M7A2 explicit browser component export/import
- M7B1 protocol-neutral `ManagedRuntimeAdapter` lifecycle
- M7B2 concrete transport selection decision: **defer until a real target exists**
- M7C1 reusable portable starter packages

Final M7 acceptance revision:

`main@247b66feb48195c25f43c82b6e07d22975e447ff`

Record: `docs/progress/m7-closeout.md`.

---

## 7. M8 Portable SCADA Work + Standalone Runtime — active

### 7.1 Original M8 product path

```text
saved SCADA work
+ required portable dependencies
    ↓
dependency-complete work artifact
    ↓ explicit browser transfer
fresh browser
    ↓ direct standalone load
read-only runnable SCADA surface
```

Built-in/native components remain host capabilities. Portable user components are explicit dependencies when the work requires them.

Do not treat raw editor Scene JSON or a debug snapshot as a distribution format.

### M8A1 Registry-scoped Scene validation — accepted · 2026-08-31

Accepted:

- `ComponentRegistryView`
- registry-scoped Scene parse/serialize validation
- isolated validation without mutating `studioComponentRegistry`

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

Accepted rules include exact component-type dependency closure, host collision protection, deterministic normalization, no global-registry mutation and fail-closed package validation.

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

Record: `docs/progress/m8a3-browser-work-package-transfer.md`.

### M8B1 Standalone/read-only runtime shell — accepted · 2026-08-31

Accepted boundary:

```text
.scada-work.json
    ↓ direct parse/preflight
trusted host registrations + bundled portable dependencies
    ↓ package-scoped ComponentRegistry
package-scoped PreviewRuntime
    ↓
read-only Scene surface
```

Final evidence:

- PR #107
- merged revision `main@9a1a0f9ac2da157bc6b496e0c05c905196a3f548`
- main CI #759 passed
- Deploy GitHub Pages #240 passed
- Pages Browser Smoke #191 passed

Record: `docs/progress/m8b1-standalone-runtime-shell.md`.

### M8 closeout review — BLOCKED · 2026-08-31

The closeout review found two demonstrated gaps. M8 therefore remains open rather than being marked complete merely because A1/A2/A3/B1 individually passed.

#### Blocker 1 — portable visual resource closure

SVG/Image layers still carried free-form `assetRef` strings while the distributable package had no resource payload/table. A host-relative asset could therefore validate/transfer without existing in a fresh browser.

Invariant required for closeout:

> A component accepted as portable must not depend on an undeclared host-relative visual resource.

#### Blocker 2 — standalone canonical Scene semantic parity

Scene v7 persists canonical `scadaSemantics`, but M8B1 standalone construction currently validates/renders the Scene without restoring/compiling/attaching non-null persisted semantic programs.

Invariant required for closeout:

> A standalone host that claims to run a valid Scene must execute its accepted persisted semantics or fail closed; it must not silently ignore them.

Record: `docs/progress/m8-closeout-review.md`.

### M8A4 Portable visual resource closure — ACTIVE

Goal:

> Make the existing portable package boundary honestly self-contained for SVG/Image visual resources without prematurely building a broad asset-management system.

Current design boundary:

- keep distributable component package version 1
- local editable visuals may retain authoring-local refs
- distribution parsing/export accepts only self-contained `data:image/...` SVG/Image refs
- relative, host-root, `http(s)`, `blob:` and non-image data refs fail closed
- no hidden network fetch or Studio asset installation is required
- deterministic package fixtures must prove accepted/rejected forms and round-trip preservation
- deployed Pages standalone smoke must prove an image-bearing portable dependency actually renders in a fresh browser

Record: `docs/progress/m8a4-portable-visual-resource-closure.md`.

M8A4 is not accepted until PR CI passes and the merged revision passes Deploy Pages + deployed browser smoke.

### M8B2 Standalone canonical semantic parity — QUEUED

After M8A4 acceptance:

- restore/compile every non-null persisted Scene v7 semantic program against the package-scoped registry
- attach semantic sessions only after standalone runtime activation
- own deterministic disposal
- keep `RuntimeDataSource` and `ScadaDeviceActionDispatcher` as explicit host capabilities
- do not choose MQTT/WebSocket/HTTP/vendor transport
- fail closed when a semantic program requires unavailable mandatory host capability
- add deterministic coverage with non-null `scadaSemantics`
- add deployed browser proof that canonical semantics affect runtime/rendered state

Operational interaction should be reviewed inside this gate: read-only means no authoring mutation, not necessarily that all runtime-facing interaction is permanently disabled.

### M8 closeout

Repeat the M8 closeout review only after M8A4 and M8B2 are accepted.

Concrete runtime transport remains separately deferred by M7B2.

---

## 8. Next architecture gate after M8

After M8 portability/runtime closeout, proceed with the Component Attribute / Property split defined in:

`docs/architecture/component-attributes-properties.md`

Required migration slices remain:

```text
Component Attribute / Property split
├─ schema / SDK
│   ├─ first-class attributes
│   ├─ runtime-capable properties
│   └─ explicit legacy classification / migration
├─ Component Workbench + SCADA Inspector
│   ├─ separate Attribute and Property authoring sections
│   ├─ generated Attribute configuration controls
│   └─ Property binding controls only
├─ runtime
│   ├─ Value Binding -> Property only
│   ├─ deterministic effective Property snapshot
│   └─ renderer/behavior receives Attributes + Properties without authority mixing
├─ package / Scene compatibility
│   ├─ version/migrate persisted component contracts as required
│   ├─ preserve browser transfer semantics
│   └─ preserve standalone runtime semantics
└─ acceptance
    ├─ one generic component covers running/alarm/fault visual variants
    ├─ Attribute binding is rejected
    ├─ legacy starter/user components migrate deterministically
    └─ export/import/standalone fixtures preserve the split
```

Do not assign this work an M9 number until M8 closeout confirms the milestone boundary.

---

## 9. Immediate execution sequence

```text
M6 browser-first authoring/runtime foundation                   accepted · 2026-08-30
M7 packaging / adapter foundation                              accepted · 2026-08-31
M8A1 registry-scoped Scene validation                          accepted
M8A2 dependency-complete work package                          accepted
M8A3 explicit browser work transfer                            accepted
M8B1 standalone/read-only runtime shell                        accepted
M8 closeout review                                             BLOCKED
M8A4 portable visual resource closure                          ACTIVE
M8B2 standalone canonical semantic parity                      QUEUED
M8 closeout                                                    after A4 + B2
Component Attribute / Property split                           after M8 closeout
```

**Current implementation gate: M8A4 Portable visual resource closure.**

Do not begin the Attribute/Property schema migration, select a concrete transport, add hidden dependency installation, execute `implementationDraft`, or provision production publication infrastructure while M8A4 remains active.

---

## 10. Verification policy

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
- M8 work-package fixtures for exact dependency closure, host-capability collision handling, deterministic normalization and fail-closed validation
- M8 browser-transfer fixtures for dependency resolution/reuse/collision planning
- M8 deployed browser-transfer smoke for fresh-browser atomic import/activation
- M8 standalone-runtime fixture for isolated registry/session construction with no mock or Studio activation dependency
- M8 deployed standalone-runtime smoke for fresh-browser direct package load/render with no authoring IndexedDB side effect
- M8A4 package fixtures proving self-contained SVG/Image resources survive round-trip while external/host-local refs fail closed
- M8A4 deployed standalone smoke proving a self-contained image-bearing dependency renders without external asset installation/network fetch
- M8B2 fixtures with non-null persisted semantics and package-scoped lifecycle/disposal
- Attribute/Property migration fixtures only after that architecture gate becomes active

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 11. Current non-goals / reopening conditions

Do not distract M8A4/M8B2 with:

- production publication-backend provisioning while M6.7B3 remains deferred
- speculative MQTT/WebSocket/HTTP/SSE/vendor adapter implementation
- protocol-specific Component, Scene or work-package fields
- outbound command replay/exactly-once claims without protocol idempotency support
- executable `implementationDraft`
- portable Actions/Events without an accepted executable contract
- automatic remote dependency fetching during runtime load
- hidden local installation of bundled runtime dependencies
- runtime authoring/persistence in standalone mode
- editor mock telemetry in standalone mode
- broad asset-manager/media-library UX solely for M8 closeout
- package v2 resource tables without a demonstrated requirement beyond M8A4
- component marketplace/catalog expansion
- large starter component catalogs
- unrestricted JavaScript
- arbitrary DOM / React / Konva authored access
- full vector illustration/path tooling
- collaborative editing

These are deferred or separate concerns, not rejected forever.
