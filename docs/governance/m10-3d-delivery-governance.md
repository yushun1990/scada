# M10 3D delivery governance

- Status: execution authority when merged
- Date: 2026-09-25
- Architecture: `docs/architecture/3d-scene-editor.md`
- Acceptance: `docs/acceptance/m10-3d-acceptance-matrix.md`

## Purpose

This document turns the 3D readiness review into a controlled correction and
delivery program. It is written so that a human or AI agent can determine:

- what may be worked on now;
- what is deliberately deferred;
- which architecture decision governs the work;
- what evidence is required before advancing;
- how to hand off unfinished work without inventing scope.

M10 is a program of sequential gates, not permission to implement every 3D
feature at once.

## Authority and traceability

Every M10 change follows this chain:

```text
readiness finding
    ↓
architecture decision
    ↓
PLAN gate
    ↓
one work item / one focused PR
    ↓
acceptance evidence
    ↓
closeout decision and next-gate activation
```

Required traceability fields:

```text
Finding IDs: R3D-...
Gate: R0 / M10A / M10B / ...
Architecture authority: document + section
Compatibility surface: Scene / component / work package / runtime / UI
Evidence: command, fixture, browser run or measured report
```

An implementation without this traceability is not evidence that a gate is
complete.

## Status vocabulary

Use only these statuses in PLAN, progress records and handoffs:

| Status | Meaning |
| --- | --- |
| `not-started` | The gate is defined but work is not authorized yet. |
| `active` | This is an authorized current execution gate. |
| `blocked` | Work was attempted and cannot proceed until a named prerequisite changes. |
| `implemented` | Code exists, but all acceptance evidence is not yet complete. |
| `accepted` | Required evidence passed against the exact accepted revision. |
| `superseded` | A later accepted decision explicitly replaces this item. |
| `rejected` | The proposal was reviewed and intentionally not adopted. |

Do not use `done`, `works`, `mostly complete` or a green local build as a
substitute for `accepted`.

## Current gate ledger

The merged state of this governance change establishes:

| Gate | Status | May begin? | Promotion condition |
| --- | --- | --- | --- |
| R0 — readiness remediation | `active` | Yes | R3D-001/002/003 and documentation drift are closed with required evidence. |
| M10A — architecture contract and spike | `not-started` | Only after R0 acceptance | Spike, threat model, capability matrix and measurable baselines accepted. |
| M10B — work/schema/resource foundation | `not-started` | No | M10A accepted. |
| M10C — runtime/presentation decoupling | `not-started` | No | M10B accepted; a sequencing ADR may allow an isolated prerequisite earlier. |
| M10D — read-only 3D vertical slice | `not-started` | No | M10B and M10C accepted. |
| M10E — 3D authoring MVP | `not-started` | No | M10D accepted. |
| M10F — 3D anchors/connections | `not-started` | No | M10E accepted. |
| M10G — distribution/performance/hardening | `not-started` | No | M10F implemented and all earlier compatibility evidence remains green. |

Only the active gate may change production code. Documentation or disposable
spike work for the immediately next gate must be explicitly scoped and must not
leak product contracts into main before acceptance.

## R0 — readiness remediation

### Objective

Restore a truthful, secure component execution boundary and make repository
authority consistent before introducing another renderer or package format.

### Required work items

#### R0.1 — portable Action execution correction

Addresses: `R3D-001`.

- remove `implementation` from the current public portable Action definition;
- remove Workbench execution through `new Function`;
- ensure component cloning/package export cannot retain executable source in
  the current canonical schema;
- define explicit diagnostics/migration for already-persisted input containing
  the field;
- keep `implementationDraft` inert unless a future accepted ADR replaces it.

#### R0.2 — capability consistency

Addresses: `R3D-002` and `R3D-003`.

- align Component Workbench affordances with actual activation capability;
- change SVG theme generation to declarative private visual rules/properties;
- prove a component created through the normal UI can become ready, activate,
  enter a work package and run in standalone without losing its presentation;
- keep trusted built-in Action handlers distinct from portable user packages.

#### R0.3 — test and authority cleanup

Addresses: `R3D-008` and `R3D-009`.

- register relevant checks in CI;
- replace copied-algorithm checks with imports of production exports;
- mark stale design records as historical/superseded where necessary;
- ensure README, PLAN and active design documents describe the same state.

### Explicit non-goals

- designing a general-purpose script language;
- adding Three/R3F;
- adding Scene3D fields or persistence;
- redesigning the full Component Workbench;
- changing trusted built-in Action semantics.

### Closeout

R0 closes through a dedicated closeout PR or a final remediation PR that
contains all evidence required by the acceptance matrix. That PR updates the
gate ledger and PLAN to activate M10A. It must not also install the production
3D stack.

## M10A — architecture contract and technical spike

### Objective

Turn the accepted conceptual design into measured technology decisions without
creating production persistence or feature claims.

### Allowed work

- refine versioned TypeScript schema drafts and invariants;
- document the resource threat model and decoder allowlist;
- create a disposable or explicitly isolated spike for GLB load, picking,
  transform controls, property-driven presentation, disposal and context
  failure;
- compare route-level bundle output with the 2D baseline;
- name target browsers/devices and create fixed reference scenes;
- decide the artifact container and quantitative safety/performance limits.

### Non-goals

- user-facing 3D work creation;
- canonical Scene3D persistence;
- silently promoting spike code into the main editor;
- WebGPU-only support;
- editing mesh geometry.

### Closeout

M10A produces an explicit decision record containing versions, capability
matrix, threat limits, benchmark results and rejected alternatives. Only after
acceptance may M10B begin.

## M10B — work, schema and resource foundation

### Objective

Implement renderer-independent, versioned 3D domain and binary-resource
authority.

### Deliverables

- discriminated WorkContent envelope;
- Scene3D v1 codec and validator;
- pure vector/quaternion/matrix/hierarchy operations;
- content-addressed AssetRepository and atomic IndexedDB upgrade;
- GLB ingest/closure validator;
- Work Package v2 logical manifest/resources and v1 2D compatibility.

### Boundary

This stage does not build a full viewport. Domain, codec and repository tests
must run without React, Konva or Three.

## M10C — runtime and presentation decoupling

### Objective

Make dimension a presentation concern while preserving M9 runtime authority.

### Deliverables

- ComponentContractRegistry separate from PresentationRegistry;
- renderer-free package/Scene validation;
- RuntimeSceneProjection shared by 2D and 3D;
- injected package-scoped runtime/registry ownership;
- Component Package v3 with 2D presentation migration and 3D presentation
  schema;
- shared editor session/application commands extracted without changing 2D
  behavior.

### Boundary

No alternate Property store, DSL compiler, data-source adapter or standalone
runtime may be introduced.

## M10D — read-only 3D vertical slice

### Objective

Prove the full load-to-standalone path before authoring complexity.

### Deliverables

- lazy-loaded 3D route and adapter;
- GLB resource loading through the accepted asset authority;
- environment and runtime camera;
- hierarchy rendering and picking diagnostics;
- runtime Property-driven visibility/material/animation;
- package-scoped standalone rendering and clear capability/context failures;
- resource cache and deterministic disposal.

The 2D route must not load Three/R3F chunks.

## M10E — 3D authoring MVP

### Objective

Complete a reliable authoring round trip.

### Required task flow

```text
create 3D work
→ import validated GLB as a component presentation
→ place/select in viewport and outliner
→ translate/rotate/scale with local/world/snap
→ inspect/reparent
→ undo/redo
→ save/close/reopen
→ preview
```

One manipulation gesture commits one command. Navigation camera changes remain
local unless explicitly committed as the runtime camera.

## M10F — 3D anchors and visual connections

### Objective

Add stable spatial endpoint geometry while keeping visual connection topology
separate from runtime semantics.

### Deliverables

- representation-specific Anchor3D geometry;
- straight and explicit polyline connections;
- endpoint reconnect and compatibility diagnostics;
- move/rotate/reparent world-space updates;
- package/migration/undo/reopen evidence.

Automatic routing and process simulation remain out of scope.

## M10G — distribution, performance and hardening

### Objective

Turn the vertical product path into an accepted distributable capability.

### Deliverables

- exact component/model/texture resource closure;
- fresh-browser and offline standalone proof;
- decoder/model/schema fuzz and malformed-input coverage;
- reference-scene performance budgets in CI or a reproducible benchmark lane;
- cache/disposal/context-loss soak evidence;
- deployed Chromium and Firefox smoke where deployment behavior changes;
- final compatibility and closeout record.

M10 is accepted only after M10G closes. Earlier gates may be individually
accepted without advertising a generally complete 3D editor.

## PR graph

The preferred dependency graph is:

```text
R0.1 portable execution correction
  ├─ R0.2 capability consistency
  └─ R0.3 authority/test cleanup
             ↓
          R0 closeout
             ↓
       M10A spike/decision
             ↓
       M10B domain/resources
             ↓
       M10C runtime/presentation split
             ↓
       M10D read-only vertical slice
             ↓
       M10E authoring MVP
             ↓
       M10F anchors/connections
             ↓
       M10G hardening/closeout
```

If M10C requires a renderer-independent prerequisite before all M10B work is
complete, create a narrowly scoped sequencing ADR. Do not use parallel work as
a reason to bypass acceptance dependencies.

## AI execution loop

An AI agent working on this program must use the following loop.

### 1. Orient

- read `AGENTS.md`, PLAN, this document, the architecture document and the
  acceptance rows for the active gate;
- inspect current branch, base revision, open changes and related PRs;
- identify exactly one authorized work item.

### 2. Bound

Write down:

- finding/gate addressed;
- contracts and files expected to change;
- explicit non-goals;
- migration and compatibility surfaces;
- verification commands and evidence required.

If the task requires a decision not in the architecture authority, stop and
propose an ADR rather than choosing an irreversible contract silently.

### 3. Implement

- prefer pure domain/codecs before adapters and UI;
- keep commits reviewable and avoid unrelated cleanup;
- preserve user changes and existing accepted behavior;
- update tests with production code, not duplicate implementations;
- add diagnostics for rejected/migrated legacy inputs.

### 4. Verify

- run the narrow deterministic checks while iterating;
- run build/lint and all gate-required compatibility checks before handoff;
- collect browser, bundle, migration, security and performance evidence only
  when the matrix requires it;
- record failures truthfully; do not reinterpret a missing tool as a pass.

### 5. Hand off

Use this exact structure in the PR or progress note:

```markdown
## Gate and authority
- Gate:
- Finding IDs:
- Architecture sections:

## Implemented
- ...

## Explicitly not implemented
- ...

## Compatibility and migration
- ...

## Verification
- `command` — PASS/FAIL — exact result

## Risks and follow-up
- ...

## Next eligible work item
- ... (not started by this PR)
```

An agent must not mark the next gate active merely because its own PR passes.
That change belongs to the accepted closeout decision.

## Deviations and emergency corrections

If implementation evidence disproves an architecture assumption:

1. stop expanding the affected implementation;
2. document the observation and affected contracts;
3. propose an ADR amendment with alternatives and migration cost;
4. update PLAN only after the amendment is accepted;
5. resume at the revised gate.

Security fixes may land immediately when narrowly scoped, but they do not
silently authorize adjacent features or a later M10 gate.
