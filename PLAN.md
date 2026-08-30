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

### M7A Portable component package boundary — active

Goal:

> A ready declarative user component can leave one browser as a versioned validated artifact and enter another browser through the same package validation/activation path without requiring the publication backend.

#### M7A1 Transport-neutral distributable package codec — NEXT

Build one canonical transport-neutral package codec.

Acceptance target:

1. reuse the accepted publication distributable-package semantics rather than create a second offline schema
2. derive only from a valid non-built-in `ready` local package
3. exclude local authoring metadata (`id`, `status`, `updatedAt`, `builtIn`)
4. deterministic parse / serialize / round-trip behavior
5. fail closed through existing Component Definition / Visual Rule / Animation validation
6. preserve `implementationDraft` as inert content; distribution does not make arbitrary JavaScript executable
7. convert a decoded artifact into a validated package/import candidate without persistence, activation, file-system, or network side effects
8. portable v1 supports the existing self-contained declarative user-component model only; native renderer modules and external asset trees are not silently bundled
9. deterministic CI fixture proves valid round-trip and malformed-artifact rejection

Architectural direction:

```text
local ready ComponentLibraryEntry
        ↓ explicit conversion
transport-neutral distributable package
        ├─ file export/import       M7A2
        └─ publication request      existing remote transport
```

The publication server must consume the shared artifact contract rather than own a competing package definition.

#### M7A2 Explicit browser export / import — after M7A1

Planned acceptance target:

- explicit file export of a ready declarative package
- explicit import through the M7A1 codec
- no silent activation/overwrite on file selection
- deterministic collision policy across built-in, local-authored, and installed-remote types
- persistence through ComponentRepository
- activation through the existing generic activation controller
- deployed Pages smoke for the browser workflow

### M7B Production runtime adapters — after M7A baseline

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
- first prove lifecycle/error/reconnect behavior against generic host interfaces
- choose concrete transports only after the generic adapter boundary is accepted
- publication-backend deployment remains separately deferred by B3

### M7C Reusable component set — after package/adapter foundations

Build a small reusable declarative component set that exercises the generic contracts without adding component-specific editor code.

Prefer components expressible with accepted Properties / Actions / Events / Anchors plus composite visual rules/animations.

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
11. M7A1 transport-neutral distributable package codec                  NEXT
12. M7A2 explicit browser package export/import                         later
13. M7B production runtime-adapter foundation                           later
14. M7C reusable component set                                          later
```

**Next implementation step: M7A1 Transport-neutral distributable package codec.**

Do not restart M6 effect experimentation, revive QuickJS as the main product path, or provision production publication infrastructure while B3 remains `defer deployment`.

---

## 10. Verification policy

A milestone is not accepted merely because TypeScript compiles.

Use the narrowest relevant verification set:

- deterministic model/runtime scripts for semantic behavior
- CI build + runtime checks + lint
- regression fixtures for repaired runtime edges
- deployed Pages smoke when browser/UI behavior changes
- storage migration fixtures when persistence formats change
- debug snapshots for browser-only persistence failures
- publication contract fixtures before remote deployment
- real PostgreSQL/API integration for publication concurrency/revision semantics
- remote repository/install fixtures for fail-closed parsing, provenance, collision policy, replacement/rollback, and offline activation
- browser-publication fixtures for `baseRevision`, conflict/refresh semantics, and no frontend Bearer credentials
- browser-auth API integration for session/revocation/publisher identity/trusted Origin
- M7 package-codec fixtures for deterministic portable round-trip and malformed/unsupported artifact rejection

Prefer explicit deterministic state/snapshots over timing-sensitive renderer inspection whenever possible.

---

## 11. Near-term non-goals

The following must not distract M7A1:

- production publication-backend provisioning while B3 remains `defer deployment`
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
- protocol-specific component APIs
- premature Scene schema churn

These are deferred or outside the current SCADA layer, not necessarily rejected forever.
