# M8A1 — Registry-scoped Scene validation

Status: **accepted · 2026-08-31**

## Goal

Make Scene validation depend on an explicit read-only component registry view so future runnable-work package preflight can validate candidate component dependencies without mutating the product-wide live Studio registry.

## Accepted boundary

M8A1 added `ComponentRegistryView` and the pure Scene codec entry points:

- `parseSceneDocumentWithRegistry()`
- `serializeSceneDocumentWithRegistry()`

The supplied registry now owns definition lookup for:

- Component Property validation
- Scene v5 binding validation
- legacy Scene v6 Event → Component Action validation
- canonical Scene v7 SCADA semantic contract validation
- visual connection Anchor validation

The existing `parseSceneDocument()` / `serializeSceneDocument()` APIs remain compatibility wrappers over the live Studio registry, so normal editor call sites did not need to adopt a second component system.

## Isolation guarantee

`check-scoped-scene-validation.ts` proves that two isolated registries can validate the same Scene differently without cross-contamination. Unknown component types fail closed and validation does not register or unregister candidate types in `studioComponentRegistry`.

The pure codec also has a source-boundary fixture preventing Studio/native renderer imports from creeping back into package preflight.

## Acceptance evidence

- PR #104: `refactor: make Scene validation registry-scoped`
- merged to `main` as `fa588c251c0d65b7521452b1763feed620749b7e`
- PR head: `f1aab5872aee5225fa5374987e194c7a5ff05e6f`
- CI #734 (`33365358054`) passed

No deployed Pages smoke was required because M8A1 changes a pure validation/data boundary and does not change browser-visible behavior.

## Next boundary

M8A1 intentionally does **not** define a runnable-work artifact. The next slice is M8A2: a transport-neutral, versioned SCADA work package whose portable user-component dependencies form an explicit validated closure around the Scene while trusted built-in/native components remain host capabilities.
