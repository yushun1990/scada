# SCADA Editor Lab

Browser-first SCADA authoring and runtime experiment built with React, TypeScript, Vite and Konva.

The project focuses on:

- SCADA scene authoring
- reusable component authoring
- deterministic browser runtime semantics
- local-first persistence
- portable component distribution
- explicit host boundaries for telemetry and device/platform effects

It intentionally does **not** make a protocol-specific IoT access layer, backend rule engine or production deployment service the center of the editor.

## Current status

```text
M0–M5  editor/runtime foundations                         accepted/usable
M6      Component Workbench + Scene v7 semantics          accepted · 2026-08-30
M7      component packaging / adapter foundation / set    accepted · 2026-08-31
M8      portable SCADA work + standalone runtime          active
         └─ M8A1 registry-scoped Scene validation         NEXT
```

The authoritative execution roadmap is [`PLAN.md`](PLAN.md).

## Product structure

```text
SCADA Studio
├─ SCADA Works
│   └─ SCADA Editor
│       ├─ fixed-size artboard
│       ├─ reusable component palette
│       ├─ move / resize / rotate / group
│       ├─ visual connections
│       ├─ Component Properties
│       ├─ runtime-value bindings
│       ├─ SCADA Value / Behavior / Interaction semantics
│       ├─ Design / Preview
│       └─ local save + raw Scene JSON import/export
│
└─ Component Library
    └─ Component Editor
        ├─ Properties / Actions / Events / Anchors contract
        ├─ layered composite visuals
        ├─ Visual Rules
        ├─ animation
        ├─ local draft / ready lifecycle
        ├─ portable package import/export
        └─ optional remote publish/install flows
```

The two authoring surfaces deliberately have different complexity. Component development may be advanced; normal SCADA scene authoring should remain simple.

## Scene editor capabilities

The current editor includes:

- fixed artboard size presets and zoomable canvas
- single and multi-selection
- drag, resize and rotate
- grouping / ungrouping and hierarchy-aware geometry
- undo / redo
- alignment and equal distribution
- grid and object snapping
- visible visual Anchors around components
- straight and orthogonal visual connections
- endpoint reconnection and connection compatibility checks
- connection style editing
- local IndexedDB persistence
- Scene import/export
- Design and Preview modes
- Component Property editing
- runtime-value bindings
- canonical Scene v7 SCADA semantics
- typed Component Actions/Events for trusted registrations
- host-owned outbound Device/Platform Action dispatch

Visual connections and runtime semantics remain separate:

```text
SceneConnection
= visible pipe / wire / process line

SCADA Value / Behavior / Interaction semantics
= runtime behavior
```

## Scene v7

`SceneDocument` currently persists version 7.

The important runtime shape is conceptually:

```ts
type SceneDocument = {
  version: 7
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  connections: SceneConnection[]
}
```

Component nodes reference a component by `type`, persist public props and canonical `scadaSemantics`, and use visual Anchor IDs for connections.

Legacy Scene versions are migrated through the current parser. Persisted SCADA semantics use stable IDs and structured references rather than DSL statement positions.

## Component model

Reusable component public contract:

```text
Properties + Actions + Events + Anchors
```

Private implementation includes layered visuals, visual rules, animation and trusted/native implementation details.

Scene authors consume the public contract; they do not bind directly to private visual layers.

### Portable user components

M7 established a versioned transport-neutral component artifact:

```text
local ready ComponentLibraryEntry
        ↓ explicit conversion
.scada-component.json
        ├─ browser file export/import
        └─ optional immutable publication
```

Portable packages exclude local repository IDs/status/timestamps and pass through shared fail-closed validation.

Current portable user-component activation intentionally supports declarative composite packages only. `implementationDraft` is inert, and ready user packages that declare executable Actions/Events are not activated until a separate portable execution contract is accepted.

Trusted built-ins may still provide typed Actions/Events.

## Reusable starter packages

The first portable proof set is deployed under `public/component-packages/`:

- `starter.process-valve` — select state, process Anchors, Visual Rules, fault Blink
- `starter.running-motor` — boolean running/fault state, power/mechanical Anchors, Spin + Blink
- `starter.signal-quality` — numeric quality Property and threshold visibility Rules

They are real distributable files rather than hard-coded editor examples. Pages Browser Smoke verifies fresh-browser import, IndexedDB persistence and normal SCADA palette activation.

## Runtime boundaries

Inbound values and outbound device/platform effects use separate host interfaces:

```text
external telemetry
    ↓
RuntimeDataSource
    ↓
RuntimeValueStore / compiled scene runtime

SCADA Interaction effect
    ↓
ScadaDeviceActionDispatcher
    ↓
external platform / device command
```

M7 also established `ManagedRuntimeAdapter` with explicit lifecycle/reconnect/error behavior.

A concrete MQTT/WebSocket/HTTP/vendor adapter is deliberately **not** selected yet. It will be implemented only when a real integration target defines authentication, mapping, reconnect and delivery/idempotency semantics.

## Local-first persistence

Browser authoring authority is IndexedDB behind repository interfaces.

```text
Workbench
    ↓
Repository contracts
    ├─ IndexedDB   product/browser storage
    └─ Memory      deterministic fixtures
```

`localStorage` is compatibility/migration input only.

The Workspace also exposes a debug snapshot path for storage diagnostics. Debug snapshots are not a distribution format.

## Optional publication backend

The repository contains an optional immutable component publication API and deployment assets.

Production backend deployment is currently **deferred**. GitHub Pages/local editing/runtime do not depend on it.

Do not expose server/admin credentials in the browser bundle.

## Why M8 exists

Today a SCADA work can be edited, previewed, saved locally and exported as raw Scene JSON, but there is no standalone runtime route or dependency-complete runnable work artifact.

A Scene v7 file references component types. If it uses portable user components, a fresh browser must already have those components installed/activated before the scene can validate.

M8 therefore targets:

> **Portable SCADA Work + Standalone Runtime**

The first slice, M8A1, will remove Scene validation's dependency on the mutable product-global component registry by allowing validation against an explicit registry view. This is required before a future work package can safely preflight bundled component dependencies without mutating live Studio state.

See [`docs/progress/m7-closeout.md`](docs/progress/m7-closeout.md) for the post-M7 audit.

## Development

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Common commands:

```bash
npm run build
npm run lint
npm run preview
```

CI also runs deterministic runtime/model fixtures and PostgreSQL-backed publication API checks. Browser-sensitive behavior is verified after deployment through GitHub Pages smoke tests.

## Current non-goals

Unless an explicit later gate reopens them:

- speculative protocol-specific MQTT/WebSocket/HTTP integration
- production publication-backend provisioning
- unrestricted JavaScript execution
- execution of portable `implementationDraft`
- general workflow/process orchestration
- arbitrary DOM / React / Konva authored access
- full Figma-style vector/path tooling
- collaborative editing
- component marketplace/catalog expansion

The current priority is making the accepted authoring/runtime model portable at the **SCADA work** level.
