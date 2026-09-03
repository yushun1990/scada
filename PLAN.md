# SCADA Editor Lab Development Plan

## 1. Purpose

`PLAN.md` is the **authoritative current execution roadmap and architecture gate** for this repository.

Keep this file focused on current architecture, accepted boundaries and what happens next. Detailed evidence belongs under `docs/progress/`; detailed design belongs under `docs/architecture/`.

When this file and an older progress note disagree about the current execution gate, this file wins.

---

## 2. Product direction

This repository is a browser-first generic SCADA authoring and runtime experiment with two deliberately different authoring surfaces:

```text
Workspace
├─ SCADA Works
│   └─ SCADA Workbench
│       └─ business-oriented scene authoring
│           ├─ place reusable components
│           ├─ move / resize / rotate / connect
│           ├─ configure public Attributes
│           ├─ bind runtime Properties
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

SCADA is not a general rule engine. Scene runtime semantics stay focused on presentation state and explicit user/component interactions.

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

Private implementation remains component/host-owned by default:

```text
Visual Layers
SVG / Image / Vector / Text internals
Visual Rules
Visual animation / behavior
Internal transient state
Scripts / implementation details
Native renderer details
```

### 3.2 Attribute / Property authority split

A generic component may combine static authored configuration and dynamic runtime state:

```text
Property.running
+ Attribute.runningColor
+ Attribute.stoppedColor
        ↓
component-private rule
        ↓
visual state
```

Normative rules:

- Attributes are authored/persisted configuration.
- Properties are runtime-capable semantic values.
- Value Binding targets Properties only.
- runtime telemetry must not overwrite authored Attributes.
- Attribute changes happen through authoring/configuration flows, not runtime propagation.
- component-private rules may read both Attributes and effective Properties once the M9B1 runtime boundary is complete.
- component type identity represents a genuinely different component, not a running/alarm/fault/color combination.

The accepted design authority is:

`docs/architecture/component-attributes-properties.md`

### 3.3 Renderer-independent runtime boundary

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

Runtime evaluation produces deterministic state/effects; host code owns side effects.

### 3.4 Visual connection and runtime behavior remain separate

```text
SceneConnection
= visible pipe / wire / process line

Value / Behavior / Interaction Binding
= runtime semantics
```

Visual Anchors are not runtime ports.

### 3.5 One effective Component Property truth

Renderer and Component Action handlers must observe the same effective Component Property snapshot.

Authored/default fallback, external binding and derived layers may be separate internally, but final effective Property state has deterministic ownership and ordering.

### 3.6 Declarative semantics fail closed

- one Component Property has at most one declarative Value Binding writer in one compiled component program
- missing/unresolved derived values use explicit invalidation
- cycles are authoring errors, not fixed-point programs
- primary-device rebind is transactional
- persisted Scene v8 semantics are structured/canonical; DSL text is not persistence authority
- accepted persisted semantics must not be silently ignored by a runtime host that claims to run the Scene
- missing mandatory host runtime capabilities fail closed rather than degrading silently

### 3.7 Local-first persistence remains authoring authority

```text
Workbench repositories
        ↓
Storage abstraction
        ├─ IndexedDB       browser/local authoring authority
        └─ Memory          deterministic fixtures
```

`localStorage` is migration input only. Save succeeds only after repository persistence succeeds.

A standalone runtime consuming a distribution artifact is **not** an authoring repository client and must not persist merely to become runnable.

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

Reconnect may resume inbound telemetry but must not silently replay outbound commands. Stronger delivery guarantees require explicit protocol-level correlation/idempotency semantics.

Do not invent MQTT/WebSocket/HTTP/vendor contracts without a real integration target.

### 3.11 Portable user execution remains explicit

Current ready user composite activation supports declarative visuals/rules/animations and intentionally rejects packages declaring Actions/Events because no accepted portable executable implementation contract exists.

`implementationDraft` remains inert.

Trusted built-ins may implement Actions/Events. Do not silently turn draft text into executable portable behavior.

### 3.12 Work portability is dependency-complete

A raw Scene v8 document references component types but does not contain user-component definitions.

A runnable work artifact carries exact portable user-component dependency closure while trusted built-in/native components remain explicit host capabilities.

Portable SVG/Image resources are resource-closed at the distribution boundary:

- accepted distributable image refs are self-contained supported `data:image/...`
- relative/root-relative/remote/blob/non-image refs fail closed
- local authoring may retain unresolved/local refs until explicit distribution

Browser import preserves the artifact contract without partial persistence. Standalone loading keeps bundled dependencies runtime-scoped instead of silently installing them into Studio.

### 3.13 Standalone runtime is package-scoped

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

Current canonical Scene v8 semantics use the accepted runtime chain:

```text
PersistedScadaSemantics
    ↓ restoreScadaSemanticPlan
ScadaDslSemanticPlan
    ↓ compileScadaDslRuntime
ScadaDslCompiledRuntime
    ↓ runtime activation
attachPreviewScadaSemantics
```

The standalone path does not require Studio registry mutation, local component installation, authoring persistence or editor mock telemetry.

Real data sources, primary-device resolution and outbound device-action dispatch remain explicit host capabilities. The generic host does not infer a protocol.

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
M8 Portable SCADA Work + Standalone Runtime                     accepted · 2026-09-02
M9A1 Attribute / Property schema + migration authority          accepted · 2026-09-02
M9A2 Workbench + Inspector authority separation                 accepted · 2026-09-02
M9B1 Runtime Attribute / Property authority split               acceptance in PR #120
M9B2 Package / Scene compatibility + end-to-end acceptance      NEXT after M9B1
```

Detailed evidence: `docs/progress/`.

---

## 5. Current runtime semantic model

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

Accepted rules:

- Value Binding is declarative and reconstructible.
- Value Binding targets runtime semantic Properties.
- Behavior Binding reacts to runtime state and may invoke Component Actions.
- Interaction Binding routes Component/user Events to Device/Platform Actions.
- data-driven device orchestration remains outside this narrow SCADA layer.
- `$device.*` is relative to the component instance's one primary device.
- `$self.*` exposes Scene-DSL runtime Properties / Actions / Events, never Attributes.
- propagation settles affected Value Bindings before affected Behaviors.
- one `RuntimeValueStore` publication is one source transaction.
- Preview owns the settled Property snapshot consumed by Renderer and Action handlers.
- runtime evaluation produces effects; host code executes them.

QuickJS is not the current product center. Existing controlled-runtime experiments remain evidence only unless a later requirement proves general-purpose scripting necessary.

---

## 6. M7 closeout — accepted · 2026-08-31

Accepted boundaries:

- M7A1 transport-neutral distributable component package codec
- M7A2 explicit browser component export/import
- M7B1 protocol-neutral `ManagedRuntimeAdapter` lifecycle
- M7B2 concrete transport selection decision: **defer until a real target exists**
- M7C1 reusable portable starter packages

Final M7 accepted revision:

`main@247b66feb48195c25f43c82b6e07d22975e447ff`

Record: `docs/progress/m7-closeout.md`.

---

## 7. M8 Portable SCADA Work + Standalone Runtime — accepted · 2026-09-02

M8 product path:

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

Accepted gates:

- M8A1 Registry-scoped Scene validation
- M8A2 Portable SCADA work package codec
- M8A3 Explicit browser work transfer
- M8B1 Standalone/read-only runtime shell
- M8A4 Portable visual resource closure
- M8B2 Standalone canonical semantic parity

The first M8 closeout review correctly blocked closure after M8B1 on two demonstrated gaps:

1. component dependency closure was not yet full SVG/Image resource closure
2. standalone rendering did not yet execute accepted persisted Scene v7 semantics

M8A4 and M8B2 repaired those gaps directly at the existing package/runtime authority boundaries.

Final M8 accepted revision:

`main@b967c0f515e3b4e52a4ecab5c56e275f1a63c6ea`

Final evidence:

- PR #110 final head `2d1328a637d9acafc3d9d5806c39b2b0e315981f`
- PR CI #770 passed
- main CI #771 (`33591388326`) passed
- Deploy GitHub Pages #245 (`33591388105`) passed
- Pages Browser Smoke #196 (`33591427942`) passed

The deployed standalone proof covered the then-current Scene v7 path:

```text
.scada-work.json
    ↓ exact portable dependency closure
self-contained SVG/Image resource renders
    ↓
canonical Scene v7 semantics restored / compiled / attached
    ↓
authored valve state=closed → effective runtime state=open
    ↓
existing component-private Visual Rule renders green
    ↓
no authoring chrome
no Studio IndexedDB initialization
```

Closeout record: `docs/progress/m8-closeout.md`.

Historical blocked review: `docs/progress/m8-closeout-review.md`.

Do not create M8B3 merely to continue numbering.
Concrete runtime transport remains separately deferred by M7B2.

---

## 8. M9 Component Attribute / Property Authority Split — active

Architecture authority:

`docs/architecture/component-attributes-properties.md`

M9 corrects the previously conflated public Property namespace so authored presentation/configuration and runtime semantic state have distinct authority.

Target/current public contract:

```text
Component
├─ Attributes      authored static configuration
├─ Properties      runtime semantic values / binding targets
├─ Actions
├─ Events
└─ Anchors
```

### M9A1 Schema / SDK + versioned migration authority — accepted · 2026-09-02

M9A1 established the structural authority required before UI/runtime migration:

- first-class `attributes` and `properties` in `ComponentDefinition`;
- deterministic legacy field classification with ambiguous cases failing closed;
- Scene v8 separates instance `attributes` from `propertyFallbacks`;
- component/package codecs normalize legacy input through explicit migration rather than dual live authority;
- component-private authored-state migration hook handles safe component-specific value evolution while final current-schema validation remains mandatory;
- built-ins/starter packages use the current Attribute-aware contract;
- Pump `state` is semantic (`stopped/running/manual/warning/alarm`) instead of encoding palette names;
- Pump presentation colors are authored Attributes;
- SCADA DSL v1 uses only `$self` / `$device`, cannot target Attributes, and lowers to structured persisted semantics.

Key records:

- `docs/progress/m9a1-0-contract-freeze.md`
- `docs/progress/m9a1.4-dsl-symbol-contract.md`
- PR #117 DSL v1 migration
- PR #118 built-in / starter migration

### M9A2 Component Workbench + SCADA Inspector separation — accepted · 2026-09-02

Goal:

> Make the schema authority visible and enforceable in normal authoring without changing runtime execution authority prematurely.

Accepted surface:

- Component Workbench exposes independent `Attributes` and `Properties` contract sections;
- Attribute contract editing has no `bindable` control;
- SCADA Inspector renders `组件配置 · Attributes` separately from `运行属性 · Properties`;
- Attribute edits write `SceneNode.attributes` only;
- Property fallback edits write `SceneNode.propertyFallbacks` only;
- binding controls are generated only from `definition.properties[key].bindable`;
- Pump provides representative proof: `runningColor` is authored configuration while `state` is a bindable runtime Property.

Record: `docs/progress/m9a2-authoring-authority-ui.md`.

M9A2 intentionally stopped before changing runtime execution authority. M9B1 carries that accepted authoring split through Preview, Renderer, Actions and private visual evaluation.

### M9B1 Runtime Attribute / Property authority split — acceptance in PR #120

Goal:

> Carry the already-separated authored/runtime authorities through Preview, Renderer, Component Actions and component-private visual evaluation.

Implemented acceptance surface:

- Value Binding continues to write Properties only;
- runtime telemetry/derived updates cannot mutate authored Attributes;
- Preview/runtime owns an immutable authored Attribute snapshot separately from the effective Property store;
- Renderer receives explicit `attributes` plus one deterministic effective `properties` snapshot;
- Component Action handlers observe the same effective Property truth as Renderer and receive authored Attributes through an explicit separate namespace;
- component-private Visual Rules evaluate with explicit Attribute and Property namespaces;
- rule target values can explicitly source authored Attributes or effective Properties without flattening;
- missing private visual sources fail validation;
- Pump authored color Attributes are an end-to-end runtime proof: semantic `state` selects an authored presentation Attribute instead of a hard-coded runtime palette;
- Attribute edits remain authoring operations and do not enter telemetry propagation/history paths;
- legacy persistence fixtures remain migration inputs rather than becoming a second live runtime authority.

Do not flatten Attributes back into `ComponentProps`. The runtime API itself now expresses the distinction.

Record: `docs/progress/m9b1-runtime-authority.md`.

### M9B2 Package / Scene compatibility + end-to-end acceptance — NEXT after M9B1

Prove the split survives all accepted M7/M8 distribution/runtime boundaries:

- component package export/import;
- SCADA work package export/import;
- registry-scoped Scene validation/migration;
- standalone direct package load;
- canonical persisted semantics;
- fresh-browser Pages smoke.

Final acceptance scenario should prove one generic industrial component can use semantic runtime state plus authored presentation Attributes without state-specific component types.

### M9 closeout

Close M9 only after A1/A2/B1/B2 are individually accepted and the end-to-end authority split is demonstrated across authoring, persistence, distribution and standalone runtime.

---

## 9. Immediate execution sequence

```text
M6 browser-first authoring/runtime foundation                   accepted · 2026-08-30
M7 packaging / adapter foundation                              accepted · 2026-08-31
M8 Portable SCADA Work + Standalone Runtime                    accepted · 2026-09-02
M9A1 schema / Scene v8 / DSL v1 / migration authority          accepted · 2026-09-02
M9A2 Workbench + Inspector separation                          accepted · 2026-09-02
M9B1 runtime Attribute / Property authority split              acceptance in PR #120
M9B2 package / Scene compatibility + acceptance                NEXT after M9B1
M9 closeout                                                    after A1 + A2 + B1 + B2
```

**Current implementation gate: finish M9B1 acceptance in PR #120; after merge, proceed directly to M9B2 Package / Scene compatibility + end-to-end acceptance.**

Before M9B2 implementation, re-read latest `main`, this roadmap, the accepted Attribute/Property architecture document and the M9B1 progress record. Preserve M6–M8 boundaries; M9B2 is a compatibility/end-to-end proof slice, not a new runtime authority redesign.

---

## 10. Verification policy

A milestone is not accepted merely because TypeScript compiles.

Use the narrowest relevant verification set:

- deterministic model/runtime scripts for semantic behavior;
- CI Build + runtime/model checks + Lint;
- deployed Pages smoke when browser/UI/public distribution behavior changes materially;
- storage migration fixtures when persistence formats change;
- publication contract and PostgreSQL/API integration when remote publication behavior changes;
- component-package fixtures for codec/transfer/persistence/activation;
- runtime-adapter fixtures for lifecycle/reconnect/fencing/no-replay;
- registry-scoped Scene fixtures for isolated validation/migration;
- work-package fixtures for exact dependency closure and fail-closed validation;
- browser-transfer fresh-browser fixtures;
- standalone-runtime package/session fixtures;
- portable visual-resource fixtures;
- canonical persisted-semantics fixtures.

M9 specifically requires:

- schema migration fixtures proving Attribute vs Property authority classification;
- explicit ambiguous-legacy behavior tests;
- Attribute-binding rejection/absence tests;
- runtime tests proving telemetry cannot mutate Attributes;
- Renderer/Action tests proving one effective Property snapshot and separate Attribute context;
- component/work package compatibility fixtures;
- fresh-browser standalone proof that authored Attributes survive while runtime Properties drive visual state.

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 11. Current non-goals / reopening conditions

Do not distract M9 with unrelated expansion:

- production publication-backend provisioning while M6.7B3 remains deferred;
- speculative MQTT/WebSocket/HTTP/SSE/vendor adapter implementation;
- protocol-specific Component, Scene or work-package fields;
- outbound command replay/exactly-once claims without protocol idempotency support;
- executable `implementationDraft`;
- portable user Actions/Events without an accepted executable contract;
- automatic remote dependency fetching;
- hidden local installation of bundled runtime dependencies;
- runtime authoring/persistence in standalone mode;
- editor mock telemetry in standalone mode;
- broad asset-manager/media-library UX without a demonstrated product requirement;
- component marketplace/catalog expansion;
- large starter component catalogs before the Attribute/Property authority split stabilizes;
- unrestricted JavaScript;
- arbitrary DOM / React / Konva authored access;
- full vector illustration/path tooling;
- collaborative editing.

These are deferred or separate concerns, not rejected forever.