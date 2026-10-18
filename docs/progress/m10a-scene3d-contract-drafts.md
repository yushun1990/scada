# M10A Scene3D contract drafts and projection proof

## Gate and authority

- Date: 2026-10-18
- Work item: `M10A` schema/architecture proof (first slice) — isolated WorkContent, Scene3D v1 and Component Package v3 contract drafts plus the 2D/3D RuntimeSceneProjection parity proof
- Status: `implemented` (pre-merge; exact-main and deployed evidence belong to the later M10A closeout)
- Gate: `M10A` — architecture contract and technical spike (`active`; `docs/governance/m10-3d-delivery-governance.md`)
- Finding IDs: `R3D-004` (readiness-review M10A decision/spike item); acceptance rows: M10A "Schema and architecture proof" in `docs/acceptance/m10-3d-acceptance-matrix.md`
- Architecture sections: `docs/architecture/3d-scene-editor.md` — "Work and Scene documents" (Work envelope, Scene3D v1, editor camera vs runtime camera), "Component contract and presentations", "Registry and runtime boundaries" (RuntimeSceneProjection), "Resource authority" (repository/package model)
- Base revision: `main@5d57856348abe2d7574302f58535555261015f16`
- Compatibility surface: none. No existing Scene v8, Component Package v2, Work Package v1, runtime, storage or UI contract changes.

## Implemented

Isolated draft authority under `src/scene3d-draft/` (no production UI/persistence/editor-Preview importer; only the deterministic check imports it):

- `src/scene3d-draft/scene3d-schema.ts` — Scene3D v1 draft document shape (`units: 'm'`, `upAxis: 'Y'`, explicit `environment` and `runtimeCamera`, group/component nodes, connections) plus a fail-closed draft validator covering: exact-version rejection of future versions; finite-number invariants for position/scale/camera; input-boundary quaternion normalization with zero-quaternion rejection; positive non-zero scale; duplicate node/connection ID rejection; parent-reference existence; hierarchy-cycle detection (including self-parent); connection endpoint node-reference checks; component-node Attributes/Property-fallback scalar bags; malformed `scadaSemantics` rejection through the production `parsePersistedScadaSemantics`.
- `src/scene3d-draft/work-content.ts` — discriminated `WorkContentDraft` union (`scene-2d` wraps the production Scene v8 `SceneDocument`; `scene-3d` wraps Scene3D v1) with a kind classifier that rejects unknown kinds, non-v8 `scene-2d` payloads, and invalid `scene-3d` documents. The `scene-2d` branch deliberately does not duplicate registry-scoped validation; the production scene parser keeps that authority.
- `src/scene3d-draft/work-content.ts` — exported compile-time Scene v8 purity guards (`'z'` not on `NodeTransform`; `quaternion` not on component/group nodes; `runtimeCamera`/`environment`/`units` not on `SceneDocument`). Each guard is `true` only while the 3D field stays absent from the accepted 2D contract, so adding an optional 3D field breaks `tsc -b`, and the check asserts the exported values so the guards cannot go stale.
- `src/scene3d-draft/component-package-v3.ts` — Component Package v3 draft: dimension-independent public `ComponentDefinition` (validated through the production `assertComponentDefinition`), optional `presentations['2d'/'3d']`, SHA-256 `resources` manifest. The 3D presentation carries the stable imported-node ID map, GLB model digest (must be covered by a manifest entry with MIME `model/gltf-binary`), material slots, animation clips, anchors, and narrow declarative presentation rules (`node-visibility`, `material-base-color`, `material-emissive`, `animation-clip`) whose targets must resolve inside the presentation. At least one presentation is required.
- `src/scene3d-draft/runtime-scene-projection.ts` — draft `RuntimeSceneProjection` mapping: `projectScene2DDocument` (production Scene v8 component nodes via `isComponentNode`) and `projectScene3DDocument` (Scene3D v1 component nodes) both produce the same minimal `RuntimeComponentInstanceDraft` (`id`, `type`, `attributes`, `propertyFallbacks`, `scadaSemantics`). Groups and all geometry/camera/lighting/material data stay out of the projection.
- `scripts/check-m10a-scene3d-contracts.ts` — deterministic CI check (registered in `.github/workflows/ci.yml` after `check-scoped-scene-validation.ts`) exercising every M10A schema fixture family named by the acceptance matrix: finite-number, quaternion (normalization + zero rejection), positive-scale, hierarchy-cycle (two-node and self-parent), duplicate-ID (nodes and material slots), missing-reference (parent, connection endpoint, model digest, rule target), explicit future-version rejection for Scene3D and package v3, WorkContent discrimination, Scene v8 purity guards, Component Package v3 invariants, and 2D/3D projection parity: equivalent component instances in a Scene v8 document and a Scene3D v1 document project to one deep-equal runtime input containing contract fields only.

## Explicitly not implemented

- No Three/R3F dependency, rendering spike, browser capability run, or measured 2D/3D baselines (remaining M10A work).
- No GLB/resource threat-model decision record with quantitative limits (separate M10A work item).
- No canonical Scene3D persistence, Work Package v2, storage/IndexedDB change, or editor integration of any draft module (`M10B`).
- No Component Package v2 → v3 migration, presentation registry split, or activation behavior (`M10C`).
- No change to Scene v8, `SCADA_SEMANTICS_VERSION`, DSL v1, Component Package v2 or Work Package v1 contracts.
- No PLAN gate-status change: `M10A` remains `active`; `M10B`–`M10G` remain `not-started`.

## Compatibility and migration

- The 2D route is untouched: the built main chunk is byte-identical in name and size to the PR #225 closeout baseline (`dist/assets/index-CUXv6Wp0.js`, 915.44 kB), and no file outside `src/scene3d-draft/` imports the draft modules.
- All draft validators are new fail-closed input boundaries; no previously accepted input changes meaning.

## Verification

| Command | Exact outcome |
| --- | --- |
| `npx --yes tsx scripts/check-m10a-scene3d-contracts.ts` | PASS, exit 0 — "M10A scene3d contract drafts check passed: Scene3D v1 invariants, WorkContent discrimination, Scene v8 purity guards, Component Package v3 invariants, and 2D/3D projection parity verified." |
| `npm run build` | PASS, exit 0 — `tsc -b && vite build`; main chunk `index-CUXv6Wp0.js` `915.44 kB` identical to the pre-PR baseline (draft adds zero bytes to the 2D route); existing `>500 kB` chunk warning unchanged. |
| `npm run lint` | PASS, exit 0 — `oxlint .` 0 errors / 25 existing warnings on 305 files; UI primitive, token-authority and StudioShell checks pass. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — "Model check registration passed: 67 checks execute in CI or its lint command." |
| `npx --yes tsx scripts/check-scoped-scene-validation.ts` | PASS, exit 0 — registry-scoped 2D scene codec behavior unchanged. |
| `npx --yes tsx scripts/check-scada-semantics-persistence.ts` | PASS, exit 0 — persisted semantics parse/lower/round-trip behavior unchanged. |
| `npx --yes tsx scripts/check-scada-work-package.ts` | PASS, exit 0 — work-package envelope and closure behavior unchanged. |
| `grep -rn "scene3d-draft" src --include=*.ts --include=*.tsx -l` (excluding the draft directory) | PASS — no production importer; the draft area is isolated from UI/persistence/Preview. |

No browser or deployment evidence is claimed: this work item changes no browser-visible behavior.

## Risks and follow-up

- Draft shapes are architecture-contract refinements, not final M10B codecs: exact environment/camera variants, presentation-rule condition algebra, and the transport container remain open M10A decisions that must be recorded in the M10A decision record before M10B starts.
- The quaternion/presentation invariants here are structural; M10B must still deliver transform/hierarchy math tests (world composition, reparent, bounds, anchor projection) and GLB negative corpora at the real codec boundary.
- The 2D projection reuses live `SceneDocument` nodes; if Scene v8 gains a new semantic field later, both projections and this check must be updated together.

## Next eligible work item

`M10A` remaining items (not started by this PR):

1. GLB/resource threat-model decision record with decoder allowlist and quantitative limits.
2. Disposable rendering spike (lazy-loaded Three/R3F, GLB load, picking, transform controls, Property-driven presentation, disposal, context failure) with Chromium/Firefox capability results.
3. Measured 2D/3D baselines and budget proposal for M10D–M10G.

`M10B` remains `not-started` until the M10A closeout decision record is accepted.
