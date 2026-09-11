# SCADA Editor Lab

Browser-first SCADA authoring and runtime experiment built with React, TypeScript, Vite and Konva.

The project focuses on:

- SCADA scene authoring
- reusable component authoring
- deterministic browser runtime semantics
- local-first persistence
- portable component distribution
- portable dependency-complete SCADA works
- standalone read-only runtime
- explicit host boundaries for telemetry and device/platform effects

It intentionally does **not** make a protocol-specific IoT access layer, backend rule engine or production deployment service the center of the editor.

## Current status

```text
M0–M5  editor/runtime foundations                         accepted/usable
M6      Component Workbench + Scene v7 semantics          accepted · 2026-08-30
M7      component packaging / adapter foundation / set    accepted · 2026-08-31
M8      portable SCADA work + standalone runtime          accepted · 2026-09-02
M9      Component Attribute / Property authority split    accepted · 2026-09-03
M6.3P1  Component visual asset authoring patch             accepted · 2026-09-05
```

M9 established separate authored Attributes and runtime Properties across authoring, Scene v8 persistence, component/work packages and standalone runtime. M6.3P1 added local SVG/Image import and managed SVG target authoring within the existing component visual model.

The current phase is dogfooding and product polish. The authoritative execution roadmap is [`PLAN.md`](PLAN.md); acceptance evidence is recorded in the [M9 closeout](docs/progress/m9-closeout.md) and [M6.3P1 closeout](docs/progress/m6.3p1-closeout.md).

The [UI audit](docs/design/ui-audit-2026-09-10.md), [industrial Designer UI specification](docs/design/industrial-designer-spec.md) and [rollout plan](docs/design/industrial-designer-rollout.md) define the proposed UI corrections. The specification is a target; implementation batches and browser visual acceptance remain pending.

## Product structure

```text
SCADA Studio
├─ SCADA Works
│   └─ SCADA Workbench
│       ├─ fixed-size artboard
│       ├─ reusable component palette
│       ├─ move / resize / rotate / group
│       ├─ visual connections
│       ├─ authored Component Attributes
│       ├─ runtime Component Properties
│       ├─ runtime-value bindings
│       ├─ SCADA Value / Behavior / Interaction semantics
│       ├─ Design / Preview
│       └─ local save + work export/import
│
└─ Component Library
    └─ Component Workbench
        ├─ Attributes / Properties / Actions / Events / Anchors contract
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
- undo / redo for committed scene operations; form-edit transaction gaps are tracked in the UI audit
- alignment and equal distribution
- grid and object snapping
- visible visual Anchors around components
- straight and orthogonal visual connections
- endpoint reconnection and connection compatibility checks
- connection style editing
- local IndexedDB persistence
- Scene/work import/export paths
- Design and Preview modes
- separate authored Attribute and Property fallback editing
- runtime-value bindings
- canonical SCADA semantics persisted in Scene v8
- typed Component Actions/Events for trusted registrations
- host-owned outbound Device/Platform Action dispatch

Visual connections and runtime semantics remain separate:

```text
SceneConnection
= visible pipe / wire / process line

SCADA Value / Behavior / Interaction semantics
= runtime behavior
```

## Scene persistence

`SceneDocument` currently persists version 8. Authored Attribute values and Property fallback values are separate persisted authorities. Supported legacy inputs are normalized at the versioned migration boundary; ambiguous Attribute / Property classification fails closed.

The current Scene v8 shape is conceptually:

```ts
type SceneDocument = {
  version: 8
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  connections: SceneConnection[]
}
```

Component nodes reference a component by `type`, persist `attributes` separately from `propertyFallbacks`, and persist canonical `scadaSemantics`. Effective runtime Property values do not overwrite either authored namespace. Legacy component `props` is migration input, not a second live authority; Group geometry retains its separate internal `props` shape.

Persisted SCADA semantics use stable IDs and structured references rather than DSL statement positions. DSL text is an authoring surface, not persistence authority.

## Component model

Current reusable component public contract:

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

Runtime telemetry must not overwrite authored Attributes. Value Binding targets Properties only. Component-private visuals/rules may combine resolved Attributes with the effective Property snapshot.

Private implementation includes layered visuals, visual rules, animation and trusted/native implementation details.

Scene authors consume the public contract; they do not bind directly to private visual layers.

See [`docs/architecture/component-attributes-properties.md`](docs/architecture/component-attributes-properties.md).

## SCADA DSL v1

M6.5 proved the text-first DSL approach. M9 established the v1 surface around two reserved roots:

```text
$self    current component
$device  the component's one bound device
```

Examples:

```text
$self.pressure = $device.pressure
```

```text
if $device.fault {
    $self.state = "fault"
} else if $device.running {
    $self.state = "running"
} else {
    $self.state = "stopped"
}
```

```text
case $device.state {
    0: $self.state = "stopped"
    1: $self.state = "running"
    _: $self.state = "unknown"
}
```

V1 rules include:

- one component binds one device; `$device` is relative to that Scene binding
- `$self` exposes runtime-facing Properties / Actions / Events, not writable Attributes
- trailing `;` is optional
- `if` is statement-only and always uses `{}`
- `case` uses no `when`
- one-statement case arms may be unbraced; multi-statement arms use `{}`
- `_:` is the final/default case arm
- arbitrary external root symbols from the exploratory M6.5 surface are not retained in v1

See [`docs/architecture/scada-dsl-v1.md`](docs/architecture/scada-dsl-v1.md).

## Portable user components

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

They are real distributable v2 packages with explicit Attribute / Property namespaces, using the same validation and authority boundaries as other user packages.

## Portable SCADA works and standalone runtime

M8 established a dependency-complete runnable work artifact:

```text
saved SCADA work
+ exact portable user-component dependency closure
        ↓
.scada-work.json
        ↓
fresh browser / standalone direct load
        ↓
package-scoped ComponentRegistry
        ↓
canonical persisted Scene semantics
        ↓
read-only runnable SCADA surface
```

Portable SVG/Image resources are closed at the distribution boundary. Standalone loading keeps bundled dependencies runtime-scoped instead of silently installing them into Studio.

The standalone path does not require Studio IndexedDB initialization or authoring chrome.

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

A standalone runtime consuming a distribution artifact is not an authoring repository client and must not persist merely to become runnable.

## Optional publication backend

The repository contains an optional immutable component publication API and deployment assets.

Production backend deployment is currently **deferred**. GitHub Pages/local editing/runtime do not depend on it.

Do not expose server/admin credentials in the browser bundle.

## M9 authority split

The accepted M6–M8 architecture proved component authoring, structured Scene semantics, packaging, dependency-complete work transfer and standalone runtime. M9 resolved the earlier public-contract problem in which component `Properties` mixed two different authorities:

```text
runningColor / faultColor / precision
= authored presentation/configuration

running / fault / pressure / level
= runtime semantic state/data
```

The accepted model keeps these authorities separate:

> **Attributes are authored configuration. Properties are runtime semantic values and binding targets.**

The migration is versioned and fail-closed. Legacy `bindable: true` fields can safely remain Properties; ambiguous legacy fields require explicit migration decisions rather than heuristic guessing.

Accepted M9 sequence:

```text
M9A1.0 contract freeze                              accepted
M9A1 schema / SDK + versioned legacy classification accepted
M9A2 Component Workbench + Inspector separation     accepted
M9B1 runtime Attribute / Property authority split   accepted
M9B2 package / Scene compatibility acceptance       accepted
```

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
- broad component marketplace/catalog expansion without a concrete product requirement

The current priority is improving editing reliability and the UI through dogfooding while preserving the accepted M6–M9 package/runtime/standalone boundaries. No new numbered implementation milestone is currently authorized by `PLAN.md`.
