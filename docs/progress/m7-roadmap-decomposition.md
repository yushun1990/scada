# M7 roadmap decomposition

Status: active roadmap · M7A1 next · 2026-08-30

## Why M7 is split

The old M7 label combined three different concerns:

```text
packaging
production adapters
reusable component set
```

They do not have the same dependency direction and should not be implemented as one broad milestone.

M6 already established:

- a validated local `ComponentLibraryEntry` authoring document
- immutable remote publication revisions
- explicit remote install + offline cache
- a generic runtime registry/activation path
- `RuntimeDataSource` as the inbound runtime-value host boundary
- `ScadaDeviceActionDispatcher` as the outbound device/platform-effect boundary

The missing boundary is a transport-neutral, portable component distribution artifact that is not tied to IndexedDB authoring identity or to a particular publication server.

## Ordered M7 structure

### M7A Portable component package boundary

Goal:

> A ready declarative user component can leave one browser as a versioned validated artifact and enter another browser through the same package validation/activation path, without requiring the publication backend.

#### M7A1 Transport-neutral distributable package codec — NEXT

Implement one canonical versioned distributable component package shape and codec.

Requirements:

- derive only from a valid non-built-in `ready` component
- exclude local authoring metadata such as local repository id, `status`, `updatedAt`, and `builtIn`
- reuse the already accepted publication package semantics rather than inventing a competing offline format
- deterministic parse / serialize / round-trip behavior
- fail closed on malformed definition, visual rules, animation metadata, or unsupported implementation content
- keep `implementationDraft` inert; distribution must not turn it into executable JavaScript
- conversion back into a validated install/import candidate must reuse the existing component package validators
- no persistence, registry mutation, network access, or file UI inside the core codec

Portable package v1 is intentionally limited to the existing self-contained declarative user-component model. Native renderer modules and external asset trees are not silently bundled into v1.

#### M7A2 Explicit browser export / import

After M7A1 is accepted:

- export a ready local declarative component as a portable file
- import only through the M7A1 codec
- make import explicit; selecting a file must not silently activate or overwrite another component
- define collision behavior for built-in, local-authored, and installed-remote component types
- persist through the normal ComponentRepository boundary
- use the normal activation controller after successful persistence
- add deployed Pages smoke because this slice changes browser/UI behavior

### M7B Production runtime adapters

Only after the portable package boundary is stable, production runtime adapters may be added against the existing generic host interfaces:

```text
external telemetry / platform
        ↓
RuntimeDataSource
        ↓
RuntimeValueStore / compiled SCADA runtime

SCADA Interaction effect
        ↓
ScadaDeviceActionDispatcher
        ↓
external platform / device command
```

Rules:

- protocol details belong in adapters, not Component APIs
- do not add MQTT/WebSocket/HTTP-specific fields to reusable component contracts
- first establish adapter lifecycle/error/reconnect fixtures against the host interfaces, then select concrete production transports
- backend publication deployment remains independent and deferred by M6.7B3

### M7C Reusable component set

Build a small reusable declarative component set only after the package and runtime-host boundaries are stable enough to exercise it.

The set should prove generic capabilities rather than add component-specific editor code. Components should be expressible through public Properties / Actions / Events / Anchors and the accepted composite visual runtime wherever possible.

## Sequencing rule

```text
M7A1 transport-neutral package codec
  -> M7A2 explicit file export/import
  -> M7B generic production-adapter foundation
  -> M7C reusable component set
```

A later review may interleave M7B and M7C if concrete product evidence justifies it, but M7A1 is the immediate implementation slice.
