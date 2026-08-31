# M7C1 — Reusable portable component baseline

Status: accepted · 2026-08-31

## Goal

Ship the first small reusable component set as real M7A distributable artifacts, not as new component-specific React/runtime code.

The accepted path is:

```text
portable .scada-component.json
        ↓ M7A codec
ready local ComponentLibraryEntry
        ↓ repository persistence
normal user-component activation
        ↓
SCADA palette/runtime
```

## Capability boundary

M7C initially described reusable components as exercising `Properties / Actions / Events / Anchors` wherever possible. The implementation audit corrected that target.

`runtime-activation-core.ts` intentionally activates a user package only when:

```text
visual.mode === composite
Actions is empty
Events is empty
```

A ready user package that declares Actions or Events is rejected with a `runtime-contract` diagnostic because no accepted portable executable implementation contract exists. `implementationDraft` remains inert by design.

Therefore M7C1 does not fake Action/Event support by executing draft code or adding per-component native handlers.

Evidence is split intentionally:

- portable declarative packages prove Properties, Anchors, composite visuals, rules, animations, packaging, persistence and activation
- trusted built-ins such as Pump continue to prove typed Actions/Events and host dispatch semantics
- portable executable Actions/Events remain a future architecture decision only if a real reusable-component requirement demands them

Visual rules also currently write constant visual fields; arbitrary Property-to-text projection and continuous Property-to-geometry projection are not hidden into this milestone.

## Accepted starter package set

The artifacts live under `public/component-packages/`, so the exact distribution documents are deployed by GitHub Pages.

### `starter.process-valve` — 流程阀门

- `select` Property: closed / open / fault
- two typed visual Anchors (`process`)
- composite vector layers
- state-driven fill and rotation Visual Rules
- fault-gated Blink animation

### `starter.running-motor` — 运行电机

- two bindable `boolean` Properties: running / fault
- power and mechanical Anchors
- composite vector layers
- running/fault Visual Rules
- property-gated Spin animation
- independent fault Blink animation

### `starter.signal-quality` — 信号质量

- bindable `number` Property
- numeric comparison Visual Rules
- progressive visibility of four signal bars
- no component-specific runtime code

## Why these are distribution artifacts instead of built-ins

Adding three native registrations would prove the wrong boundary. Built-ins are trusted host code and are read-only from Component Library authoring.

M7C1 instead ships the same artifact a user can export/import:

```text
packageVersion
ComponentDefinition
ComponentVisualDefinition
implementationDraft (empty/inert)
```

The starter set can therefore be downloaded, imported, edited locally, exported again, or published through the accepted generic paths.

## Deterministic verification

`scripts/check-reusable-component-packages.ts` verifies:

- parse with the shared M7A distributable package codec
- deterministic canonical serialize/parse round-trip
- composite-only and empty Actions/Events portable-runtime boundary
- conversion to ready local authoring entries with caller-owned local identity
- local document serialization
- persistence/hydration through `MemoryComponentRepository`
- activation through `createUserComponentActivationController()` with the real `createCompositeComponentRegistration()` factory
- zero activation diagnostics and deterministic registry replacement/removal
- valve open/fault Visual Rule behavior and fault Blink
- motor running/fault rules, Spin and Blink behavior
- signal-quality numeric threshold visibility
- select / boolean / number Property coverage
- Anchor coverage

The deterministic Node fixture deliberately avoids importing the trusted native built-in asset bundle. The deployed browser smoke is the authority for the complete Studio live-registry/palette path.

## Deployed browser verification

`scripts/pages-reusable-component-packages-smoke.mjs` is part of Pages Browser Smoke. It fetches the three deployed artifacts, imports them through the explicit M7A2 file UI into a fresh browser, verifies IndexedDB persistence, creates a SCADA work, and verifies normal Studio palette activation.

No starter-specific installation path exists.

## Acceptance evidence

PR #102 merged as `main@247b66feb48195c25f43c82b6e07d22975e447ff`.

Accepted evidence on that revision:

- PR CI #724 (`33363931532`): Build, runtime/model checks including the M7C1 fixture, Lint, and PostgreSQL publication API all passed
- main CI #725 (`33363995515`): `verify` and `publication-api` both passed after merge
- Deploy GitHub Pages #235 (`33363995500`): build and deploy passed
- Pages Browser Smoke #186 (`33364034832`): complete deployed-browser suite passed, including `pages-reusable-component-packages-smoke.mjs`

This closes the M7C1 review gate.

## Deliberately deferred gaps

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

None of these was demonstrated as a blocker by the accepted starter set, so they do not justify an automatic M7C2.
