# SCADA Editor Lab Development Plan

## 1. Purpose

`PLAN.md` is the **current execution roadmap and architecture gate** for this repository.

It intentionally does not duplicate the full delivery history. Detailed acceptance evidence belongs under `docs/progress/`.

When this file and an older progress note disagree about what happens next, **this file is authoritative for current sequencing**.

---

## 2. Product direction

This repository is a browser-first, generic SCADA authoring and runtime experiment with two deliberately different authoring surfaces:

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

Guiding product rule:

> Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.

SCADA is not a general rule engine. Scene-level runtime semantics remain focused on presentation state and explicit user/component interactions.

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

SCADA Workbench consumes only the public contract. Scene authors do not bind directly to private Layer implementation details.

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
        ↓
Konva
```

Runtime evaluation produces deterministic state/effects; the host owns side effects.

### 3.3 Visual connection and runtime behavior remain separate

```text
SceneConnection
= visible pipe / wire / process line

Value / Behavior / Interaction Binding
= runtime semantics
```

Visual anchors are not runtime ports.

### 3.4 One effective Component Property truth

Renderer reads and Component Action handlers observe the same effective Component Property snapshot.

Authored/default, external-binding, and derived layers may be separate internally, but final effective state has one owner and one ordering rule.

### 3.5 Declarative Value Bindings remain deterministic

One Component Property has at most one declarative Value Binding writer in one compiled scene program.

Missing/unresolved derived values use explicit invalidation semantics; accidental last-known-good retention is not the default.

### 3.6 Primary-device rebind is transactional

A rebind either commits one coherent new runtime state or leaves the previous committed state intact. Mixed old/new derived or Behavior state is invalid.

### 3.7 Local-first persistence is the default authoring model

```text
Workbench / Runtime-facing repositories
        ↓
Storage abstraction
        ├─ IndexedDB       browser/local authoring authority
        └─ Memory          deterministic tests / fixtures
```

`localStorage` is legacy migration input only. A Save succeeds only after the asynchronous repository write succeeds.

### 3.8 Backend is optional infrastructure, not runtime authority

The backend must not own SCADA runtime evaluation, rendering, DSL execution, or device presentation state.

Remote services are useful for publication/distribution, but local editing and runtime remain possible without them.

### 3.9 Action / Event public contracts are explicit

Component Actions use ordered validated scalar parameters. Component Events use declared validated payload records.

Inbound and outbound host capabilities remain separate:

```text
RuntimeDataSource                  inbound telemetry/value state
ScadaDeviceActionDispatcher       outbound device/platform effects
```

### 3.10 Persisted SCADA semantics are canonical

DSL source is an authoring surface, not the long-term persistence authority.

Scene v7 persists versioned canonical `scadaSemantics` with stable semantic IDs and structured source/component references. Legacy v5/v6 forms remain compatibility-only.

### 3.11 Local readiness and remote publication are different states

Local `draft` / `ready` is authoring state. Publish is an explicit operation that creates an immutable remote revision.

A local Save never silently publishes or overwrites a remote artifact.

### 3.12 Remote discovery is not runtime installation

Remote discovery creates a validated install candidate. Explicit installation creates an offline cache record with immutable publication provenance. Only then may startup hydration feed the normal activation path.

### 3.13 Distribution artifact is not an editable repository record

M7 must preserve a clean distinction between:

```text
ComponentLibraryEntry
= local editable authoring document + local metadata

Distributable component package
= transport-neutral validated artifact

Published revision / installed remote record
= distribution artifact + immutable remote provenance
```

Do not make local IndexedDB identity, publication-server identity, or protocol-specific runtime configuration part of the reusable component public package contract.

### 3.14 Production adapter lifecycle is host-owned

Protocol connection/reconnect state is infrastructure, not Component or Scene semantics.

A reconnect may resume inbound telemetry delivery, but it must not silently replay outbound Device/Platform Action effects. Stronger delivery guarantees require explicit protocol-level idempotency/correlation semantics.

### 3.15 Concrete transport requires a real integration target

Do not invent MQTT topics, WebSocket envelopes, HTTP/SSE APIs, credentials, or command acknowledgement semantics merely to satisfy a roadmap label.

A concrete adapter is justified only when a real external integration target defines endpoint/topology, authentication, inbound mapping, outbound Action mapping, reconnect behavior, delivery/idempotency expectations, and deployment constraints.

### 3.16 Portable declarative components do not imply executable code

A distributable user component may declare only the runtime contract the accepted activation path can implement safely.

Today, generic local/remote user activation accepts composite packages with declarative Properties/Anchors/visual rules/animations and rejects packages that require executable Action/Event implementations. `implementationDraft` remains inert.

Do not weaken this boundary merely to make a reusable starter component appear interactive. Portable executable Actions/Events require a separate accepted implementation contract.

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
M7 Packaging / production adapters / reusable component set     active
```

Accepted M6 baseline:

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
M6.6 Local persistence foundation                              accepted · 2026-08-28
M6.7A Local user-component activation                          accepted · 2026-08-29
M6.7B1 Publication contract + immutable revisions              accepted · 2026-08-29
M6.7B2A Remote repository + install candidate boundary         accepted · 2026-08-29
M6.7B2B Explicit install + offline cache                       accepted · 2026-08-29
M6.7B2C Explicit publish + browser-safe authentication         accepted · 2026-08-29
M6.7B3 Production deployment decision                          accepted · defer deployment · 2026-08-30
```

The old `M6.4 active / M6.5 pending` roadmap is obsolete and must not be resumed.

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
- cycles are authoring errors, not fixed-point programs.
- Preview owns the settled Component Property snapshot used by Renderer and Action handlers.
- runtime evaluation produces effects; host code executes effects.
- persisted semantics are structured/canonical, not compile-session statement positions.

QuickJS is not the current product center. Existing controlled-runtime experiments remain evidence only unless a later requirement proves general-purpose scripting necessary.

---

## 6. M6 closeout

M6 established the accepted browser-first authoring/runtime baseline:

- generic component definition/registration contracts
- Component Workbench visual composition, rules, and animation foundation
- narrow SCADA DSL with deterministic semantic lowering/static analysis/runtime propagation
- typed Action/Event contracts
- explicit outbound device/platform dispatcher boundary
- stable Scene v7 semantic persistence
- IndexedDB repository authority with Memory test implementations and debug snapshot support
- local ready user-component activation through the generic registry path
- immutable publication revisions
- public remote retrieval -> validated candidate boundary
- explicit install + durable offline cache
- explicit browser Publish with HttpOnly session authentication and optimistic-concurrency observation

Detailed evidence remains under `docs/progress/`.

### M6.7B3 production deployment decision — accepted · defer deployment · 2026-08-30

The accepted decision is:

> **Defer production publication-backend deployment.**

After #95 merged at `main@4aabf74d2cb14c3fa1fc466fec4e3c28c1e2ffee`, GitHub Pages deployed successfully and `Pages Browser Smoke` #179 (`33287223003`, job `99192405823`) passed the complete deployed-browser suite.

Therefore B3 is closed. The green smoke validates the browser baseline; it does **not** authorize production backend provisioning.

Full decision/reopening conditions: `docs/progress/m6.7b3-production-deployment-decision.md`.

Smoke repair/verification record: `docs/progress/m6.7b3-pages-smoke-repair.md`.

---

## 7. Backend deployment policy after B3

Current policy:

- publication backend source/assets remain in the repository
- `deploy-backend.yml` remains manual-only (`workflow_dispatch`)
- GitHub Pages does not enable remote publication by default because `VITE_PUBLICATION_API_URL` is not configured
- local editing, local activation, installed-remote offline activation, and SCADA runtime do not require the backend
- `SCADA_ADMIN_TOKEN` remains server/CI/operations-only and must never be exposed in a public browser bundle

Production deployment may be reopened only after the B3 conditions are satisfied, including accepted frontend/API topology, cookie policy, secrets/rotation, PostgreSQL backup/restore/migration expectations, TLS/CORS/trusted Origin, diagnostics, and full browser E2E.

A new explicit **deploy now** decision is required before enabling automatic production deployment.

M7 must not quietly reinterpret “production adapters” as permission to deploy the publication backend.

---

## 8. M7 Packaging / production adapters / reusable component set — active

The previous M7 title combined three different concerns. They are now ordered deliberately.

Detailed decomposition: `docs/progress/m7-roadmap-decomposition.md`.

### M7A Portable component package boundary — accepted

Goal:

> A ready declarative user component can leave one browser as a versioned validated artifact and enter another browser through the same package validation/activation path without requiring the publication backend.

#### M7A1 Transport-neutral distributable package codec — accepted · 2026-08-30

Accepted result:

- `distributable-component-package.ts` owns the transport-neutral artifact type/codec
- the distribution artifact has its own explicit v1 version constant
- only valid non-built-in `ready` local packages can be converted for distribution
- local `id`, `status`, `updatedAt`, and `builtIn` metadata are excluded
- existing Component Definition / Visual Rule / Animation validators remain the validation authority
- normalized JSON parse / serialize / round-trip behavior is deterministic
- decoded artifacts convert through a pure path into a ready local package with caller-supplied local id/timestamp
- `implementationDraft` remains inert content
- publication now consumes this same artifact codec while retaining the accepted M6.7 wire aliases/shape
- deterministic CI verifies valid round-trip and malformed/unsupported artifact rejection

Acceptance record: `docs/progress/m7a1-distributable-package-codec.md`.

Architectural direction:

```text
local ready ComponentLibraryEntry
        ↓ explicit conversion
transport-neutral distributable package
        ├─ file export/import       M7A2
        └─ publication request      existing remote transport
```

Portable package v1 does not silently bundle native renderer modules or external asset trees.

#### M7A2 Explicit browser export / import — accepted · 2026-08-30

Accepted result:

- explicit file export of a ready declarative package
- explicit import through the M7A1 codec
- file selection performs parse/validation/collision preflight without mutation
- explicit confirmation is required before persistence/activation
- deterministic collision rejection across built-in, local-authored, and installed-remote types
- persistence through ComponentRepository / IndexedDB
- activation through the existing generic activation path
- deployed browser A -> browser B transfer smoke

After #99 merged, `Pages Browser Smoke` #183 (`33288164839`) passed on `main@029579a7396917b9cc9214cfb01278d075d60413`, closing the final deployed-browser acceptance condition.

Acceptance record: `docs/progress/m7a2-explicit-browser-package-transfer.md`.

### M7B Production runtime adapters — accepted foundation / concrete transport deferred

Production adapters plug into existing host boundaries:

```text
external telemetry
    ↓
RuntimeDataSource
    ↓
RuntimeValueStore / compiled runtime

Interaction effect
    ↓
ScadaDeviceActionDispatcher
    ↓
external platform/device command
```

Rules:

- protocol details live in adapters, never component public APIs
- lifecycle/error/reconnect semantics are generic and host-owned
- outbound effects are not silently queued/replayed across reconnect
- concrete protocols require a real integration target
- publication-backend deployment remains separately deferred by B3

#### M7B1 Protocol-neutral runtime adapter lifecycle foundation — accepted · 2026-08-31

Accepted result:

- protocol-neutral `ManagedRuntimeAdapter`
- stopped / connecting / connected / retrying / failed lifecycle
- injected retry policy and deterministic delay seam
- atomic inbound transport batches through `RuntimeValueStore.setMany()`
- stale connection-attempt fencing after disconnect/retry/stop
- outbound dispatch only while connected
- explicit rejection instead of command queue/replay while disconnected
- observable connect/connection-loss/dispatch/close/retry failures
- stop abort + live-connection close semantics
- deterministic CI lifecycle regression

PR #100 CI run #715 (`33361745532`) passed Build, all runtime/model checks including the lifecycle fixture, Lint, and PostgreSQL publication API integration. After merge, `main@6157ce00965006f30657b06dd218c6b2b7e2fca0` also passed CI #719 and Deploy GitHub Pages #233.

Acceptance record: `docs/progress/m7b1-runtime-adapter-lifecycle-foundation.md`.

#### M7B2 First concrete production transport selection — accepted decision · defer · 2026-08-31

Decision:

> Do not implement MQTT, WebSocket, HTTP/SSE, or a vendor adapter until a real integration target exists.

No accepted target currently defines the endpoint/topology, authentication, inbound value mapping, outbound Action mapping, reconnect restoration, command correlation/idempotency, or browser/runtime deployment constraints needed to make a concrete transport non-speculative.

M7B1 already provides the generic adapter lifecycle seam. Concrete adapter work can be reopened independently when a real integration target supplies those missing constraints.

Decision record: `docs/progress/m7b2-production-transport-selection.md`.

### M7C Reusable component set — active

A capability audit corrected the earlier overly broad target: current ready user composite activation intentionally rejects packages that declare Actions/Events because there is no accepted portable executable implementation contract. Trusted built-ins continue to prove typed Actions/Events; portable user packages must remain purely declarative for now.

#### M7C1 Reusable portable starter package baseline — REVIEW GATE

Ship three real M7A artifacts under `public/component-packages/` rather than three new native registrations:

- `starter.process-valve` — select Property, process Anchors, Visual Rules, fault Blink
- `starter.running-motor` — boolean Properties, power/mechanical Anchors, Visual Rules, Spin + Blink
- `starter.signal-quality` — number Property and numeric threshold Visual Rules

All three deliberately declare empty Actions/Events and an inert/empty `implementationDraft`.

Verification must prove:

- shared M7A codec parse + deterministic canonical round-trip
- conversion to ready local authoring entries
- repository document persistence/hydration
- activation through the normal generic user registry with zero diagnostics
- deterministic Property/rule/animation behavior
- Build/runtime/Lint/publication regression safety
- deployed Pages serves the actual artifacts
- fresh-browser explicit import persists all three and exposes them in the normal SCADA palette

Implementation/review record: `docs/progress/m7c1-reusable-component-baseline.md`.

#### After M7C1

Do not automatically open a scripting milestone. Review only gaps demonstrated by real starter-component use:

- direct Property-to-text/value projection
- continuous numeric Property-to-visual projection
- portable executable Actions/Events
- starter-package discoverability/install UX

If none is necessary to satisfy a real use case, M7 may close with the portable declarative starter baseline plus the existing trusted Action/Event components.

---

## 9. Immediate execution sequence

```text
1. M6.5.9A-C runtime hardening / Preview integration                    accepted
2. M6.5.10 typed Action/Event + dispatcher                              accepted
3. M6.5.11 stable Scene semantics persistence                           accepted
4. M6.6 IndexedDB persistence foundation                                accepted
5. M6.7A local user-component activation                                accepted
6. M6.7B1 immutable publication contract                                accepted
7. M6.7B2A remote repository/candidate boundary                         accepted
8. M6.7B2B explicit install + offline cache                             accepted
9. M6.7B2C explicit Publish + browser-safe auth                         accepted
10. M6.7B3 production deployment decision                               accepted · defer · 2026-08-30
11. M7A1 transport-neutral distributable package codec                  accepted · 2026-08-30
12. M7A2 explicit browser package export/import                         accepted · 2026-08-30
13. M7B1 protocol-neutral runtime adapter lifecycle                     accepted · 2026-08-31
14. M7B2 first concrete production transport selection                  accepted · defer · 2026-08-31
15. M7C1 reusable portable starter packages                             REVIEW GATE
```

**Current implementation gate: M7C1 Reusable portable starter package baseline.**

Do not restart M6 effect experimentation, revive QuickJS as the main product path, invent a concrete transport without a target, execute `implementationDraft`, or provision production publication infrastructure while B3 remains `defer deployment`.

---

## 10. Verification policy

A milestone is not accepted merely because TypeScript compiles.

Use the narrowest relevant verification set:

- deterministic model/runtime scripts for semantic behavior
- CI build + runtime checks + lint
- regression fixtures for repaired runtime edges
- deployed Pages smoke when browser/UI/distributed public artifacts change
- storage migration fixtures when persistence formats change
- debug snapshots for browser-only persistence failures
- publication contract fixtures before remote deployment
- real PostgreSQL/API integration for publication concurrency/revision semantics
- remote repository/install fixtures for fail-closed parsing, provenance, collision policy, replacement/rollback, and offline activation
- browser-publication fixtures for `baseRevision`, conflict/refresh semantics, and no frontend Bearer credentials
- browser-auth API integration for session/revocation/publisher identity/trusted Origin
- M7 package-codec fixtures for deterministic portable round-trip and malformed/unsupported artifact rejection
- M7 browser-package transfer smoke for export/import/persistence/activation/collision behavior
- M7 runtime-adapter fixtures for lifecycle, reconnect, stale-session fencing, atomic inbound batches, outbound rejection/failure, stop, and retry exhaustion
- M7 reusable-package fixtures for declarative contract validation, rule/animation behavior, package round-trip, repository persistence/hydration, and generic activation
- M7 starter-package deployed smoke for public artifact availability plus fresh-browser explicit import/palette activation

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 11. Near-term non-goals

The following must not distract M7C1:

- production publication-backend provisioning while B3 remains `defer deployment`
- speculative MQTT/WebSocket/HTTP/SSE/vendor adapter implementation without a real target
- protocol-specific Component or Scene APIs
- implicit outbound command queueing/replay across reconnect
- exactly-once delivery claims without protocol-level idempotency/correlation support
- a large component catalog before the minimum capability matrix is proven
- component-specific editor branches or inspectors
- executing `implementationDraft` to make portable components interactive
- pretending portable Actions/Events are implemented when activation rejects them
- arbitrary Property-to-text/value projection without a separate accepted contract
- continuous numeric Property-to-visual projection without a separate accepted contract
- component marketplace
- collaborative editing
- automatic publication on local Save
- automatic remote catalog activation
- mutable remote published revisions
- native-renderer/module packaging in portable package v1
- silently bundling external asset trees into portable package v1
- general-purpose process orchestration
- data-driven device command chains
- unrestricted JavaScript execution
- arbitrary DOM / React / Konva access from authored logic
- arbitrary keyframe/timeline editor
- new named animation families without a demonstrated generic-runtime gap
- full vector illustration tooling
- arbitrary path editing
- premature Scene schema churn

These are deferred or outside the current SCADA layer, not necessarily rejected forever.
