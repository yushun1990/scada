# M8B1 — Standalone/read-only runtime shell

Status: **accepted · 2026-08-31**

## Goal

Consume the accepted M8 dependency-complete work artifact directly in a standalone, read-only browser runtime:

```text
.scada-work.json
    ↓ direct load / package preflight
trusted host registrations + bundled portable dependencies
    ↓ package-scoped registry
package-scoped PreviewRuntime
    ↓
read-only Scene surface
```

The runtime shell is deliberately separate from Studio authoring state. It does not import the work into IndexedDB, install bundled components, or mutate `studioComponentRegistry` before it can render.

## Package-scoped runtime boundary

`standalone-work-runtime-core.ts` receives trusted host registrations explicitly and builds an isolated runtime registry from:

- trusted built-in/native host registrations
- the exact portable dependency closure carried by the work package

Portable dependencies are converted through the accepted declarative composite registration factory. `implementationDraft` remains inert and portable Actions/Events remain outside the accepted executable boundary.

After package preflight, the Scene is validated again against the actual runtime registrations that will render it.

The browser wrapper supplies the product built-ins. The generic runtime-construction core does not import Studio persistence, the mutable Studio registry, editor mock sources, or browser/native host registrations.

## Runtime ownership

Each loaded work owns a dedicated `PreviewRuntime` instance with its package-scoped registry.

M8B1 intentionally supplies **no editor mock data sources**. The standalone surface therefore starts from authored/default Component Property state rather than silently simulating telemetry. Real inbound/outbound transport remains gated by the accepted M7B2 deferral until a concrete integration target exists.

## Read-only rendering surface

`#/runtime` renders without the SCADA Workbench authoring shell:

- no selection state
- no drag/resize/rotate
- no Transformer
- no component palette
- no inspectors
- no undo/redo
- no save/import-to-Studio action

The standalone renderer covers:

- Scene background and fit-to-viewport presentation
- group transforms/visibility
- visual connections with registry-scoped Anchor lookup
- trusted native components
- bundled declarative composite components, including their existing visual rules/animations

The route accepts the same `.scada-work.json` artifact used by M8A3. No second runtime/debug format is introduced.

## Storage independence

Studio authoring routes are lazy-loaded from `App.tsx` so visiting `#/runtime` does not eagerly import the browser persistence module.

Direct runtime file load is in-memory only. It does not create the Studio IndexedDB database, persist a Scene, or materialize bundled dependencies as local component-library entries.

## Verification

`check-standalone-work-runtime.ts` covers the package-scoped construction boundary with injectable host registrations:

- exact portable dependency registration
- host registry isolation
- actual-registration Scene validation
- dedicated runtime start/stop
- empty runtime-value state with no editor mock sources
- malformed package rejection
- source boundaries excluding Studio persistence/global activation/mock data from the generic core

`pages-standalone-runtime-smoke.mjs` proves in a fresh Chromium context:

1. `#/runtime` opens without Studio/editor authoring chrome
2. opening the route does not initialize `scada-editor-lab` IndexedDB
3. the deployed `starter.process-valve` package can be embedded in a valid M8 work artifact and loaded directly from file
4. the runtime renders a Konva Scene surface and reports the loaded Scene/dependency metadata
5. direct package load still does not create Studio IndexedDB
6. no browser page errors occur

## Acceptance evidence

- PR #107: `feat: add package-scoped standalone SCADA runtime`
- final PR head `ab82cb3b8692393bd36f403d6c2b1cefe0cc6323`
- final PR CI #758 (`33392152411`) passed Build, complete runtime/model checks, Lint and publication-api regression
- merged revision `main@9a1a0f9ac2da157bc6b496e0c05c905196a3f548`
- main CI #759 (`33392597346`) passed
- Deploy GitHub Pages #240 (`33392597356`) passed
- Pages Browser Smoke #191 (`33392662848`) passed, including `pages-standalone-runtime-smoke.mjs`

M8B1 is therefore accepted. Its stated gate was the storage-independent, package-scoped, read-only runtime shell and that gate is closed.

## Closeout-review note

M8B1 acceptance does **not** by itself prove the whole M8 milestone can close.

The subsequent M8 closeout review found two broader portability/runtime requirements outside the explicit M8B1 acceptance fixture:

- external SVG/image `assetRef` resources are not part of the distributable package closure
- standalone runtime construction currently does not restore/compile/attach non-null Scene v7 `scadaSemantics`

Those are recorded in `docs/progress/m8-closeout-review.md` and keep M8 open until resolved or deliberately re-scoped.

## Explicit non-goals

M8B1 did not add:

- concrete MQTT/WebSocket/HTTP/SSE/vendor transport
- automatic work publication/hosting
- runtime editing or persistence
- hidden component installation
- editor mock telemetry
- portable executable Actions/Events or `implementationDraft`
- a second Scene/work artifact format
- arbitrary remote dependency fetching

Concrete transport remains separately deferred by M7B2 and is not a reason to reopen M8B1.