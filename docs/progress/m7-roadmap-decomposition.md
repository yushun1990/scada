# M7 roadmap decomposition

Status: active roadmap · M7C next · 2026-08-31

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

M7A then established a transport-neutral portable distribution artifact and explicit browser file transfer without requiring the publication backend.

## Ordered M7 structure

### M7A Portable component package boundary — accepted

Goal:

> A ready declarative user component can leave one browser as a versioned validated artifact and enter another browser through the same package validation/activation path, without requiring the publication backend.

#### M7A1 Transport-neutral distributable package codec — accepted · 2026-08-30

Accepted result:

- canonical versioned distributable package shape and codec
- derives only from valid non-built-in `ready` components
- excludes local authoring identity/status/timestamp metadata
- reuses accepted publication package semantics
- deterministic parse / serialize / round-trip
- fail-closed validation
- `implementationDraft` remains inert
- no persistence/network/file UI inside the core codec

Acceptance record: `docs/progress/m7a1-distributable-package-codec.md`.

#### M7A2 Explicit browser export / import — accepted · 2026-08-30

Accepted result:

- explicit export of ready local declarative components
- explicit import through the M7A1 codec
- file selection performs validation/preflight only
- explicit confirmation before persistence/activation
- deterministic collision rejection across built-in, local-authored, and installed-remote component types
- persistence through ComponentRepository / IndexedDB
- activation through the normal generic activation path
- deployed Pages browser A -> browser B transfer smoke

Final deployed evidence: `Pages Browser Smoke` #183 on `main@029579a7396917b9cc9214cfb01278d075d60413` passed after the #99 hydration-timing repair.

Acceptance record: `docs/progress/m7a2-explicit-browser-package-transfer.md`.

### M7B Production runtime adapters — accepted foundation / concrete transport deferred

Production adapters plug into the already accepted host interfaces:

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
- establish generic lifecycle/error/reconnect semantics before concrete transport work
- select a concrete transport only against a real integration target
- backend publication deployment remains independent and deferred by M6.7B3

#### M7B1 Protocol-neutral runtime adapter lifecycle foundation — accepted · 2026-08-31

Accepted semantics:

- explicit stopped / connecting / connected / retrying / failed state
- injected retry policy and deterministic delay seam
- atomic inbound value batches through `RuntimeValueStore.setMany()`
- stale connection-attempt fencing after reconnect/stop
- outbound dispatch only while connected
- no silent command queue/replay across reconnect
- observable connect/connection-loss/dispatch/close/retry failures
- stop aborts pending work and closes the live connection
- deterministic lifecycle regression in normal CI

Acceptance evidence: PR #100 CI run #715 (`33361745532`) passed Build, runtime/model checks, Lint, and PostgreSQL publication API integration. The merged `main@6157ce00965006f30657b06dd218c6b2b7e2fca0` also passed CI #719 and Deploy GitHub Pages #233.

Acceptance record: `docs/progress/m7b1-runtime-adapter-lifecycle-foundation.md`.

#### M7B2 First concrete production transport selection — accepted decision · defer · 2026-08-31

Decision:

> Do not implement MQTT, WebSocket, HTTP/SSE, or a vendor adapter until a real production integration target defines endpoint/topology, authentication, inbound mapping, outbound Action mapping, reconnect behavior, delivery/idempotency expectations, and browser/runtime deployment constraints.

Why:

- there is no accepted external platform/protocol target in the repository today
- no existing MQTT/WebSocket protocol commitment exists to preserve
- inventing a transport now would primarily invent a private message/API contract rather than prove the SCADA runtime boundary
- M7B1 already provides the generic lifecycle seam needed when the first real target appears

Reopening the concrete-adapter implementation requires a real integration target and explicit answers for endpoint/topology, auth, mapping, reconnect, delivery, and deployment constraints.

Decision record: `docs/progress/m7b2-production-transport-selection.md`.

### M7C Reusable component set — NEXT

Build a small reusable declarative component set now that package and runtime-host boundaries are stable enough to exercise it.

The set must prove generic capabilities rather than add component-specific editor code. Components should be expressible through public Properties / Actions / Events / Anchors and the accepted composite visual runtime wherever possible.

Initial decomposition should prefer a few components that collectively exercise different public/runtime capabilities rather than a large visual catalog. M7C must define the minimum set and acceptance matrix before implementation.

## Sequencing rule

```text
M7A1 transport-neutral package codec             accepted
  -> M7A2 explicit file export/import            accepted
  -> M7B1 generic adapter lifecycle foundation   accepted
  -> M7B2 concrete transport selection           accepted decision · defer until target
  -> M7C reusable component set                  NEXT
```

Concrete adapter work may be reopened independently when a real integration target appears; it no longer blocks M7C.

Production publication-backend deployment remains separately deferred and must not be reopened implicitly by M7C.
