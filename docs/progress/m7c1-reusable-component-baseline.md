# M7C1 — Reusable portable component baseline

Status: implementation complete · review gate · 2026-08-31

## Goal

Ship the first small reusable component set as real M7A distributable artifacts, not as new component-specific React/runtime code.

The slice must prove that the accepted public/declarative model is useful end to end:

```text
portable .scada-component.json
        ↓ M7A codec
ready local ComponentLibraryEntry
        ↓ repository persistence
normal user-component activation
        ↓
SCADA palette/runtime
```

## Capability audit before implementation

M7C initially described reusable components as exercising `Properties / Actions / Events / Anchors` wherever possible. The current accepted runtime boundary requires one correction.

`runtime-activation-core.ts` deliberately activates a user package only when:

```text
visual.mode === composite
Actions is empty
Events is empty
```

A ready user package that declares Actions or Events is rejected with a `runtime-contract` diagnostic because no accepted portable executable implementation contract exists. `implementationDraft` remains inert by design.

Therefore M7C1 must **not** fake Action/Event support by executing draft code or adding per-component native handlers.

Current evidence is split intentionally:

- portable declarative packages prove Properties, Anchors, composite visuals, rules, animations, packaging, persistence and activation
- trusted built-ins such as the existing Pump continue to prove typed Actions/Events and host dispatch semantics
- portable executable Actions/Events remain a separate future architecture decision if a real reusable-component requirement demands them

A second declarative limitation is also explicit: visual rules currently write constant visual fields; text layer content and continuous numeric geometry are not direct Property projections. M7C1 chooses components that are honestly expressible by the accepted model instead of adding a hidden binding system.

## Starter package set

The artifacts live under `public/component-packages/`, so the exact distribution documents are also deployed by GitHub Pages.

### `starter.process-valve` — 流程阀门

Exercises:

- `select` Property: closed / open / fault
- two typed visual Anchors (`process`)
- composite vector layers
- state-driven fill and rotation Visual Rules
- fault-gated Blink animation

### `starter.running-motor` — 运行电机

Exercises:

- two bindable `boolean` Properties: running / fault
- power and mechanical Anchors
- composite vector layers
- running/fault Visual Rules
- property-gated Spin animation
- independent fault Blink animation

### `starter.signal-quality` — 信号质量

Exercises:

- bindable `number` Property
- numeric comparison Visual Rules
- progressive visibility of four signal bars
- no component-specific runtime code

## Why these are distribution artifacts instead of built-ins

Adding three native built-in registrations would prove the wrong boundary. Built-ins are trusted host code and the Component Library exposes them as read-only native entries.

M7C1 instead ships exactly the artifact a user can export/import:

```text
packageVersion
ComponentDefinition
ComponentVisualDefinition
implementationDraft (empty/inert)
```

This means the starter set can be downloaded, imported, edited locally, exported again, or published through the already accepted generic paths.

## Deterministic verification

`scripts/check-reusable-component-packages.ts` verifies all starter packages through production contracts:

- parse with the shared M7A distributable package codec
- deterministic canonical serialize/parse round-trip
- composite-only and empty Actions/Events portable-runtime boundary
- conversion to ready local authoring entries with caller-owned local identity
- local document serialization
- persistence/hydration through `MemoryComponentRepository`
- activation through `createUserComponentActivationController()` using the real `createCompositeComponentRegistration()` factory
- zero activation diagnostics and deterministic registry replacement/removal
- valve open/fault Visual Rule behavior and fault Blink
- motor running/fault rules, Spin and Blink behavior
- signal-quality numeric threshold visibility
- select / boolean / number Property coverage
- Anchor coverage

The deterministic Node fixture deliberately does not import the Studio built-in bundle because trusted native components include Vite-owned asset modules. The deployed browser smoke below is the authority for the complete Studio live-registry/palette path.

The fixture is part of normal CI runtime/model checks.

## Deployed browser verification

`scripts/pages-reusable-component-packages-smoke.mjs` is part of Pages Browser Smoke.

After deployment it:

1. fetches all three actual `public/component-packages/*.json` artifacts from GitHub Pages
2. verifies the deployed package identity/version
3. starts with a fresh browser/IndexedDB
4. imports each package through the explicit M7A2 file UI
5. accepts the required confirmation for each import
6. verifies all three persist locally
7. creates a SCADA work and verifies all three activate through the normal Studio palette

No special starter-package installation path is introduced.

## Non-goals / discovered gaps

M7C1 does not add:

- executable portable Action/Event implementations
- execution of `implementationDraft`
- component-specific editor panels or runtime branches
- native renderer modules in distributable package v1
- arbitrary Property-to-text projection
- continuous Property-to-geometry projection
- a remote marketplace/catalog service
- automatic starter package installation
- concrete MQTT/WebSocket/HTTP adapters

These gaps should be evaluated separately only when a product requirement makes one necessary.

## Review gate

M7C1 is accepted only when:

- Build succeeds
- normal runtime/model checks including `check-reusable-component-packages.ts` succeed
- Lint succeeds
- publication API regression remains green
- after merge, Deploy GitHub Pages succeeds
- deployed Pages Browser Smoke including the starter-package import check succeeds

Until those checks pass, this document remains `review gate` rather than `accepted`.
