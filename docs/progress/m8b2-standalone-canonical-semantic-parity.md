# M8B2 — Standalone canonical semantic parity

Status: **accepted · 2026-09-02**

## Why this gate exists

The post-M8B1 closeout review found a correctness gap in the standalone runtime.

Scene v7 already persists canonical SCADA semantics as `PersistedScadaSemantics`, but the standalone path previously only:

```text
parse work package
    ↓
build package-scoped registry
    ↓
new PreviewRuntime([], registry)
    ↓
runtime.acquire(scene)
```

A valid work package could therefore contain non-null `node.scadaSemantics`, pass package/Scene validation, render successfully, and still silently ignore its canonical Value / Behavior / Interaction program.

M8B2 closes that gap without inventing a second runtime language or concrete device transport.

## Accepted semantic chain reused

The standalone host consumes exactly the existing canonical runtime path:

```text
PersistedScadaSemantics
    ↓ restoreScadaSemanticPlan
ScadaDslSemanticPlan
    ↓ compileScadaDslRuntime
ScadaDslCompiledRuntime
    ↓ runtime activation
attachPreviewScadaSemantics
    ↓
PreviewRuntime Component Property / Action / Event state
```

DSL source text is not reparsed and remains outside runtime persistence authority.

## Package-owned runtime session

`standalone-work-runtime-core.ts` constructs the semantic programs during standalone package construction and exposes one package-owned `acquire()` lifecycle.

First acquire:

```text
PreviewRuntime.acquire(scene)
    ↓
attach every compiled non-null Scene v7 semantic program
    ↓
standalone runtime is live
```

Final release:

```text
semantic attachments dispose in reverse order
    ↓
PreviewRuntime release
```

If an attachment fails after the runtime starts, already-created attachments are disposed and the runtime lease is released before the error escapes.

This keeps semantic lifecycle out of the renderer and prevents a standalone host from claiming to run a Scene while silently skipping accepted persisted semantics.

## Explicit host capabilities

The generic standalone core accepts only protocol-neutral host capabilities:

- `RuntimeDataSource[]` for inbound runtime values
- primary-device resolver for `device.*` references
- `ScadaDeviceActionDispatcher` for Interaction effects

The browser wrapper defaults to none of these capabilities and therefore chooses no MQTT/WebSocket/HTTP/vendor transport.

Fail-closed rules:

- any semantic program containing Interaction bindings requires a device-action dispatcher
- any semantic program that reads a primary-device property, targets a primary-device action, or uses a primary-device reference inside an action argument requires a resolved primary device for that component node
- missing mandatory capabilities reject standalone runtime construction rather than degrading into an inert program

External source references remain stable authored source IDs and do not require a primary-device resolver.

## Read-only vs operational interaction

Standalone remains authoring-read-only:

- no selection
- no drag/resize/rotate
- no Transformer
- no palette/inspector
- no undo/redo/save
- no Studio persistence

However, read-only authoring does not mean runtime event hit-testing must be disabled. The standalone Stage/Layer/group/component path is listening so trusted runtime-capable components may emit operational Component Events. Scene background and visual connections remain non-listening.

## Deterministic verification

`scripts/check-standalone-work-runtime.ts` covers non-null Scene v7 semantics:

1. a persisted literal Value Binding changes effective Component Property `state` from authored `closed` to runtime `open`
2. authored Scene props remain unchanged
3. an explicit RuntimeDataSource plus primary-device resolver drives a persisted `device.level`-style source reference
4. primary-device semantics without a resolver fail closed
5. Interaction semantics without a dispatcher fail closed
6. with an explicit dispatcher, a Component Event produces the expected host-owned device-action invocation
7. runtime/data-source/semantic attachment disposal remains package-owned
8. Studio/global activation/editor mock dependencies remain absent from the generic core

Scene v7 parsing still validates persisted semantic references against the concrete component contract before standalone execution. M8B2 adds execution parity; it does not bypass the accepted Scene validation authority.

## Deployed browser verification

`scripts/pages-standalone-runtime-smoke.mjs` keeps the M8A4 self-contained SVG/Image proof and adds canonical semantic execution:

```text
authored process-valve.state = closed
persisted Scene v7 Value Binding = "open"
        ↓ standalone restore / compile / attach
runtime effective state = open
        ↓ existing component-private Visual Rule
valve body renders green
```

The deployed smoke waits for both:

- distinctive magenta pixels from the embedded self-contained SVG resource
- green pixels from the valve's existing `state=open` Visual Rule

It also proves no Studio IndexedDB initialization and no authoring chrome.

## Final acceptance evidence

- PR #110 — `feat: run canonical semantics in standalone runtime`
- final PR head `2d1328a637d9acafc3d9d5806c39b2b0e315981f`
- PR CI #770 (`33589416945`) passed Build + runtime/model checks + Lint + publication-api
- merged revision `main@b967c0f515e3b4e52a4ecab5c56e275f1a63c6ea`
- main CI #771 (`33591388326`) passed
- Deploy GitHub Pages #245 (`33591388105`) passed
- Pages Browser Smoke #196 (`33591427942`) passed

The #196 deployed log explicitly confirms that a fresh browser directly loads the dependency-complete work artifact, renders its self-contained SVG/Image resource, restores canonical Scene v7 semantics so authored `state=closed` becomes effective runtime `state=open` (green), exposes no authoring chrome, and never initializes Studio IndexedDB.

Therefore M8B2 is accepted.

## Explicit non-goals

M8B2 does not add:

- concrete MQTT/WebSocket/HTTP/SSE/vendor transport
- protocol fields in Scene/work/component packages
- portable executable user component Actions/Events
- `implementationDraft` execution
- runtime authoring or persistence
- hidden dependency installation
- Component Attribute / Property schema migration

The next action after this gate is the final M8 closeout review, not another semantic-runtime slice by default.
