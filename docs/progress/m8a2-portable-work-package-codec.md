# M8A2 — Portable SCADA work package codec

Status: **accepted · 2026-08-31**

## Goal

Define the first transport-neutral runnable-work artifact:

```text
Scene v7
+ explicit portable user-component dependencies
+ trusted host component capabilities
    ↓ pure preflight
versioned dependency-complete SCADA work package
```

M8A2 is a codec/model slice only. Browser export/import actions and a standalone runtime route belong to later slices.

## Artifact boundary

The v1 artifact is intentionally small:

```ts
type ScadaWorkPackage = {
  packageVersion: 1
  scene: SceneDocument
  dependencies: DistributableComponentPackage[]
}
```

`packageVersion` is independent from Scene schema version and component-package version so each nested contract can evolve separately.

## Host capabilities vs portable dependencies

Trusted built-in/native components are **host capabilities** and are not copied into the artifact.

Portable user components are explicit dependencies carried by the artifact. The codec receives the host capability registry as an injected read-only dependency and builds an isolated validation overlay for bundled packages. It does not use or mutate `studioComponentRegistry`.

A bundled dependency may not shadow a host capability.

## Exact dependency closure

A valid M8A2 package requires:

- every Scene component type to resolve either from trusted host capabilities or an embedded portable dependency
- every embedded portable dependency to be referenced by the Scene
- no duplicate dependency component types
- no dependency type collision with a host capability
- unsupported/unknown package versions to fail closed
- Scene validation/migration to run through the M8A1 scoped Scene codec

Dependencies are normalized by component type before serialization so equivalent inputs produce deterministic package JSON.

## Runnable portable dependency gate

M8A2 preserves the accepted execution boundary from M6/M7:

- bundled user visuals must be declarative composite visuals
- portable Actions/Events remain unsupported without an accepted executable implementation contract
- `implementationDraft` remains inert

The existing distributable component package validator remains the nested dependency authority.

## Deterministic verification

`check-scada-work-package.ts` covers:

- v1 package creation and deterministic round-trip
- dependency ordering normalization
- missing dependency rejection
- duplicate dependency rejection
- unused dependency rejection
- host-capability shadowing rejection
- portable Action dependency rejection
- scoped host-definition validation
- Scene v6 → v7 migration through the scoped codec
- no mutation of host registrations
- source boundary preventing convenience imports of the mutable Studio registry/storage

The fixture is wired into the normal CI runtime/model check set.

## Acceptance evidence

- PR #105: `feat: add dependency-complete SCADA work package codec`
- final PR head: `af9702d493867525b1f7b6cee88522717d2fbeb3`
- final PR CI #737 (`33377056756`) passed
  - Build passed
  - Runtime model checks passed, including `check-scada-work-package.ts`
  - Lint passed
  - publication-api regression passed
- merged revision: `main@49d29f98ae8d3a5700738c44c8bb497514e662ce`
- Deploy GitHub Pages #238 passed
- Pages Browser Smoke #189 passed

M8A2 itself did not require a new browser-visible smoke because it is a pure codec/model slice. The successful post-merge Pages deployment and existing smoke suite provide regression evidence for the accepted main revision.

## Explicit non-goals

M8A2 did not add:

- Workspace export/import buttons
- local work-package persistence
- standalone runtime routes/pages
- publication hosting
- concrete MQTT/WebSocket/HTTP/vendor transport
- executable portable scripts or `implementationDraft`

## Next boundary

M8A3 exposes explicit browser export/import around this same artifact without weakening dependency preflight. The standalone/read-only runtime shell follows only after browser transfer proves the artifact can cross a fresh-browser boundary with its portable dependency closure intact.
