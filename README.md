# SCADA Editor Lab

A browser-first generic SCADA authoring and runtime experiment.

## Current direction

The repository now has two deliberately different authoring surfaces:

```text
Workspace
├─ SCADA Works
│   └─ SCADA Workbench
│       └─ scene authoring / device binding / preview
│
└─ Component Library
    └─ Component Workbench
        └─ reusable component contract / visuals / private rules
```

The public component contract is converging on:

```text
Attributes + Properties + Actions + Events + Anchors
```

where:

- **Attributes** are authored static presentation/configuration.
- **Properties** are runtime semantic values and binding targets.
- **Actions** are callable component capabilities.
- **Events** are discrete component occurrences.
- **Anchors** are visual connection geometry.

Runtime telemetry must not overwrite authored Attributes. Value Binding targets Properties only.

## Current milestone

M8 Portable SCADA Work + Standalone Runtime was accepted on 2026-09-02.

Current execution gate:

```text
M9 Component Attribute / Property Authority Split
└─ M9A1 Schema / SDK + versioned legacy classification — ACTIVE
```

M9 starts by correcting the current conflated component value namespace before expanding the component catalog or building more authoring UI on top of it.

The current sequence is:

```text
M9A1.0 contract freeze / DSL v1 authority          accepted
M9A1.1 versioned component authority migration     active
M9A1 core ComponentDefinition + authored state     next
Scene v8 authority split                           follows core schema
M9A2 Workbench / Inspector separation              queued
M9B1 runtime Attribute / Property split            queued
M9B2 package / Scene compatibility acceptance      queued
```

The authoritative execution roadmap is [`PLAN.md`](./PLAN.md).

## SCADA DSL v1 direction

The accepted M9 DSL surface uses two reserved context roots:

```text
$self
$device
```

A component binds one device, and `$device` resolves relative to that Scene binding.

Examples:

```text
$self.pressure = $device.pressure
```

```text
if $device.fault {
    $self.state = "fault"
} else {
    $self.state = "normal"
}
```

```text
case $device.state {
    0: $self.state = "stopped"
    1: $self.state = "running"
    _: $self.state = "unknown"
}
```

Trailing semicolons are optional. `if` bodies are always braced. `case` uses no `when`, and `_:` is the fallback arm.

DSL is an authoring surface that lowers to structured Scene semantics; DSL text is not persistence authority.

See [`docs/architecture/scada-dsl-v1.md`](./docs/architecture/scada-dsl-v1.md).

## Accepted architecture boundaries

Key architecture rules currently include:

- Component public contract and private implementation are separate.
- Attributes and Properties have distinct authority and lifecycle.
- Renderer/runtime contracts do not expose raw DOM/React/Konva objects to user-authored behavior.
- Visual connections are separate from runtime value/behavior/interaction semantics.
- Renderer and Component Action handlers must observe one deterministic effective Property snapshot.
- Declarative runtime semantics fail closed on ambiguous or invalid authority.
- Local-first authoring persistence remains authoritative; standalone runtime loading is not an authoring persistence flow.
- Component distribution packages are transport-neutral and separate from editable local authoring identity.
- SCADA work packages carry exact portable dependency closure.
- Standalone runtime builds a package-scoped component registry and executes canonical persisted Scene semantics without silently installing dependencies into Studio.

## Distribution / standalone path

M8 established:

```text
saved SCADA work
+ exact portable user-component dependencies
        ↓
.scada-work.json
        ↓
fresh browser / standalone load
        ↓
package-scoped registry
        ↓
canonical Scene semantics
        ↓
read-only runnable SCADA surface
```

Portable SVG/Image resources are closed at distribution time and standalone loading does not require Studio IndexedDB initialization.

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

The CI workflow also runs deterministic runtime/model/package/storage/publication checks under `scripts/`.

## Documentation

Start with:

- [`PLAN.md`](./PLAN.md) — authoritative roadmap and current gate
- [`docs/architecture/component-attributes-properties.md`](./docs/architecture/component-attributes-properties.md) — Attribute / Property authority
- [`docs/architecture/scada-dsl-v1.md`](./docs/architecture/scada-dsl-v1.md) — DSL v1 surface contract
- [`docs/architecture/component-system.md`](./docs/architecture/component-system.md) — component system architecture
- [`docs/architecture/scada-binding-behavior.md`](./docs/architecture/scada-binding-behavior.md) — Scene runtime semantics
- [`docs/progress/m8-closeout.md`](./docs/progress/m8-closeout.md) — accepted M8 evidence
