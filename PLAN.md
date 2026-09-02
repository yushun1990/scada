# SCADA Editor Lab Development Plan

## 1. Purpose

`PLAN.md` is the **authoritative current execution roadmap and architecture gate** for this repository.

Keep this file concise. Detailed milestone evidence belongs under `docs/progress/`; detailed architecture belongs under `docs/architecture/`.

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

### 3.7 Local-first persistence remains authoring authority

```text
Workbench / Runtime-facing repositories
        ↓
Storage abstraction
        ├─ IndexedDB       browser/local authoring authority
        └─ Memory          deterministic fixtures
```

`localStorage` is migration input only. Save succeeds only after asynchronous repository persistence succeeds.

A standalone runtime that consumes a distribution artifact is **not** an authoring repository client and must not persist merely to become runnable.

### 3.8 Backend remains optional infrastructure

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

### 3.10 Runtime adapter lifecycle is host-owned

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

### 3.12 Work portability is dependency-complete

A raw Scene v7 document references component types but does not contain user-component definitions.

A runnable work artifact must make its portable user-component dependencies explicit. Trusted built-in/native components remain host capabilities rather than copied dependencies.

Exact work-package closure means every non-host Scene component type is supplied once by the artifact and every supplied portable dependency is actually referenced by that Scene.

Portable SVG/Image dependencies are now also resource-closed: distributable asset refs must be self-contained accepted `data:image/...` values. Host-relative, remote and blob refs fail closed at the component-package boundary.

Browser import preserves the artifact contract without partial persistence. Standalone loading keeps bundled dependencies runtime-scoped rather than silently installing them into Studio.

### 3.13 Standalone runtime is package-scoped

A standalone runtime instance owns its registry and runtime session:

```text
trusted host registrations
+ bundled portable dependencies
        ↓
package-scoped ComponentRegistry
        ↓
package-scoped PreviewRuntime
        ↓
package-scoped canonical semantic attachments
```

The standalone path must not require `studioComponentRegistry`, local component installation, authoring persistence or editor mock telemetry.

Canonical Scene v7 semantics use the existing accepted chain:

```text
PersistedScadaSemantics
    ↓ restoreScadaSemanticPlan
ScadaDslSemanticPlan
    ↓ compileScadaDslRuntime
ScadaDslCompiledRuntime
    ↓ runtime activation
attachPreviewScadaSemantics
```

Real data sources, primary-device resolution and outbound device-action dispatch remain explicit host capabilities. Missing mandatory capabilities fail closed; the generic host does not infer a protocol.

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
M8 Portable SCADA Work + Standalone Runtime                     active · M8B2 ACTIVE
```

Detailed evidence: `docs/progress/`.

---

## 5. Current runtime model

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

### 7.1 Product path

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

Built-in/native components remain host capabilities. Portable user components are explicit dependencies when required.

Do not treat raw editor Scene JSON or a debug snapshot as a distribution format.

### M8A1 Registry-scoped Scene validation — accepted · 2026-08-31

Accepted registry-scoped Scene parse/serialize validation without mutating `studioComponentRegistry`.

Record: `docs/progress/m8a1-registry-scoped-scene-validation.md`.

### M8A2 Portable SCADA work package codec — accepted · 2026-08-31

Accepted versioned `ScadaWorkPackage` with canonical Scene v7 plus exact portable user-component dependency closure.

Record: `docs/progress/m8a2-portable-work-package-codec.md`.

### M8A3 Explicit browser work transfer — accepted · 2026-08-31

Accepted side-effect-free preflight plus atomic Scene/dependency persistence across a fresh-browser file-transfer boundary.

Record: `docs/progress/m8a3-browser-work-package-transfer.md`.

### M8B1 Standalone/read-only runtime shell — accepted · 2026-08-31

Accepted storage-independent direct work-package load, package-scoped registry/runtime and read-only Scene rendering.

Final evidence:

- PR #107
- merged `main@9a1a0f9ac2da157bc6b496e0c05c905196a3f548`
- main CI #759 passed
- Deploy GitHub Pages #240 passed
- Pages Browser Smoke #191 passed

Record: `docs/progress/m8b1-standalone-runtime-shell.md`.

### M8 closeout review — BLOCKED · 2026-08-31

The review found two demonstrated gaps rather than closing M8 prematurely:

1. portable visual-resource closure
2. standalone canonical Scene semantic parity

Record: `docs/progress/m8-closeout-review.md`.

### M8A4 Portable visual resource closure — accepted · 2026-09-02

Accepted boundary:

- distributable component package remains version 1
- local authoring may retain unresolved/local refs until export
- portable SVG/Image refs must be self-contained accepted `data:image/...`
- relative/root-relative/`http(s)`/`blob:`/non-image refs fail closed
- work-package/browser-transfer/standalone paths inherit the same component-package validation

Acceptance evidence:

- PR #109
- final PR head `2ada74c8ffd249599a97c8609d71a619d84ddb9a`
- merged `main@f318b6a0b832316b03eb1a15caa3633da0da26fd`
- main CI #766 passed
- Deploy GitHub Pages #244 passed
- Pages Browser Smoke #195 passed with the self-contained image-bearing fixture

Record: `docs/progress/m8a4-portable-visual-resource-closure.md`.

### M8B2 Standalone canonical semantic parity — ACTIVE

Goal:

> A standalone host that claims to run a valid Scene must execute its accepted persisted semantics or fail closed; it must not silently ignore them.

Implementation boundary:

- restore and compile every non-null persisted Scene v7 semantic program during standalone package construction
- acquire one package-owned runtime session; attach semantics only after `PreviewRuntime` activation
- dispose semantic attachments before final runtime release
- inject `RuntimeDataSource`, primary-device resolution and `ScadaDeviceActionDispatcher` explicitly
- require a primary-device host capability when a semantic program uses primary-device references
- require a dispatcher when a semantic program contains Interaction bindings
- do not choose MQTT/WebSocket/HTTP/vendor transport
- keep standalone authoring-read-only while allowing operational component hit-testing/events

Required evidence:

- deterministic non-null persisted-semantics fixture changes the effective Component Property snapshot without mutating authored Scene props
- explicit primary-device + RuntimeDataSource fixture drives a source-property binding
- missing primary-device/dispatcher capabilities fail closed
- explicit dispatcher receives Interaction effects
- deployed browser fixture proves persisted semantics affect the rendered process-valve state
- main/Pages deployed evidence after merge

Record: `docs/progress/m8b2-standalone-canonical-semantic-parity.md`.

### M8 closeout

Repeat the closeout review only after M8B2 is accepted. If no further demonstrated portability/runtime blocker exists, close M8 rather than inventing another slice.

Concrete runtime transport remains separately deferred by M7B2.

---

## 8. Next architecture gate after M8

After M8 closeout, proceed with the Component Attribute / Property split defined in:

`docs/architecture/component-attributes-properties.md`

Required migration areas:

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
│   ├─ version/migrate persisted contracts as required
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
M8A4 portable visual resource closure                          accepted · 2026-09-02
M8B2 standalone canonical semantic parity                      ACTIVE
M8 closeout                                                    next after M8B2 acceptance
Component Attribute / Property split                           after M8 closeout
```

**Current implementation gate: M8B2 Standalone canonical semantic parity.**

Do not begin the Attribute/Property schema migration, select a concrete transport, add hidden dependency installation, execute `implementationDraft`, or provision production publication infrastructure while M8B2 remains active.

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
- M7 component-package fixtures for codec/transfer/persistence/activation
- M7 runtime-adapter fixtures for lifecycle/reconnect/fencing/no-replay
- M8 scoped-scene fixtures for isolated registry validation
- M8 work-package fixtures for exact dependency closure and fail-closed validation
- M8 browser-transfer fixtures + deployed fresh-browser smoke
- M8 standalone-runtime fixture for isolated registry/session construction
- M8A4 package/browser fixture for self-contained SVG/Image resources
- M8B2 fixtures with non-null persisted semantics, explicit host capabilities and package-scoped lifecycle/disposal
- M8B2 deployed standalone smoke proving canonical semantics affect rendered state
- Attribute/Property migration fixtures only after that gate becomes active

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 11. Current non-goals / reopening conditions

Do not distract M8B2 with:

- production publication-backend provisioning while M6.7B3 remains deferred
- speculative MQTT/WebSocket/HTTP/SSE/vendor adapter implementation
- protocol-specific Component, Scene or work-package fields
- outbound command replay/exactly-once claims without protocol idempotency support
- executable `implementationDraft`
- portable Actions/Events without an accepted executable contract
- automatic remote dependency fetching
- hidden local installation of bundled dependencies
- runtime authoring/persistence in standalone mode
- editor mock telemetry in standalone mode
- broad asset-manager/media-library UX solely for M8 closeout
- package v2 resource tables without a demonstrated requirement
- component marketplace/catalog expansion
- large starter component catalogs
- unrestricted JavaScript
- arbitrary DOM / React / Konva authored access
- full vector illustration/path tooling
- collaborative editing

These are deferred or separate concerns, not rejected forever.
