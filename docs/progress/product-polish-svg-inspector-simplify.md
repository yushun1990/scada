# SVG Layer Inspector Simplification

## Status

Implemented for review · 2026-09-27.

Base: `main@04ebc4e`. Dogfooding polish under the current `PLAN.md`
product-polish phase. No new numbered milestone, no M10A boundary change.

## Problem

Selecting an SVG layer stacked three authoring surfaces in the layer style
inspector:

- a 「样式」 group whose only field was the asset 填充模式 (`fit`) select,
  duplicated from the asset-style path and meaningless for managed SVG
  content;
- the SVG source group (`ComponentSvgSourceEditor`, the source + marking
  workbench);
- a 「SVG 内部元素」 group wrapping the managed element editor
  (`ComponentManagedSvgEditor`): per-element geometry inputs, presentation
  inputs (Fill/Stroke/Stroke width/Opacity) and the 引用名称 alias field.

Three overlapping entries for one layer is exactly the kind of surface
bloat the polish phase is removing.

## Changes

- `src/features/component-library/ComponentVisualStyleInspector.tsx` — SVG
  layers now render only the SVG source group. The 「样式」 group survives
  for image layers (填充模式 stays the image fit control); the
  「SVG 内部元素」 group is removed entirely.
- `src/features/component-library/ComponentManagedSvgEditor.tsx` and
  `component-managed-svg-editor.css` — deleted (no remaining importer).
- `ComponentSvgSourceEditor` — authorRef persistence repair. The marking
  workbench wrote aliases into its transient AST, but `formatManagedSvgDocument`
  serializes attributes only, so every workbench 保存/应用 silently dropped
  authorRef metadata on the text round-trip. The defect was masked while the
  managed element editor owned alias authoring; with that editor retired the
  workbench is the only surface, so the editor now keeps a `tagId → authorRef`
  map (seeded from `layer.document`, reset on external layer change),
  rejects duplicate aliases fail-closed, removes entries on 清除标记, and
  merges the map back into the parsed document in `handleSave` before
  `onChange`. Serialized `assetRef` bytes stay alias-agnostic by construction
  except for the authored `id` attribute itself.

### Authority note (recorded deliberately)

The marking workbench authors aliases as real SVG `id` attributes — peers of
ids carried by imported files — so an authored alias legitimately round-trips
inside the serialized document/assetRef bytes. Runtime identity remains the
canonical `svgTagId` (`data-scada-tag`), and Visual Rules still persist only
`svgTagId`. The retired managed editor's pure-metadata aliases (byte-stable
renames) no longer exist; the corresponding "alias never appears in assetRef"
assertion was updated to assert the authored-id round-trip plus the
`data-scada-tag` identity instead.

### Retired browser evidence

- `scripts/pages-managed-svg-geometry-smoke.mjs` — deleted, and removed from
  `.github/workflows/component-editor-smoke.yml` and `pages-smoke.yml`. Its
  whole flow drove the removed element-geometry inputs; per-element geometry
  authoring currently has no UI surface. The typed-geometry domain model and
  `scripts/check-managed-svg-geometry-authoring.ts` remain in force.
- `scripts/pages-managed-svg-author-ref-smoke.mjs` — rewritten: alias
  authoring goes through the marking workbench (open workbench → click
  preview element → 确定标记 → 应用), element selection converges through the
  rule 作用对象 select (which drives the shared managed-SVG selection and
  canvas status), a second rule is added to prove new rules default to the
  current selection, and the removed groups are asserted absent.
- `scripts/pages-svg-import-compatibility-smoke.mjs` — presentation
  assertions moved from the removed Fill/Stroke inputs to persisted-document
  discrete attributes (save → `readPersistedComponent`), and the replacement
  structure checks moved from managed rows to persisted tag-name traversal.
- `scripts/pages-managed-svg-authoring-smoke.mjs` — dropped the uncalled
  `waitForManagedFill` helper that queried the removed editor DOM.

## Capability consequences

- SVG per-element geometry editing (X/Y/W/H per managed element) and the
  per-element presentation inputs have no authoring UI after this change.
  The domain functions (`managedSvgAuthoring`) and their model checks stay,
  so a later polish item can re-land a leaner surface without schema work.
- authorRef authoring, element→rule target binding and canvas highlight
  linkage all survive through the marking workbench + rule editor.

## Verification

Local production build (`npm run build`), lint (`npm run lint`), and the
managed-SVG domain battery (`check-managed-svg-{assets,authoring,geometry-authoring,visual-rules,portability,doctype-compatibility}.ts`,
`check-managed-svg-parser-authority.mjs`) — all passed.

Browser smokes against the local `vite preview` build
(`SCADA_PAGES_URL=http://localhost:4173/`), all passed:

- `pages-managed-svg-author-ref-smoke.mjs` (rewritten marking-workbench
  flow, save/rename/reload/preview read-only);
- `pages-svg-import-compatibility-smoke.mjs` (rewritten persisted-document
  assertions);
- `pages-managed-svg-authoring-smoke.mjs` (UX1.6 dogfood chain);
- `pages-component-inspector-style-groups-smoke.mjs`;
- `pages-component-inspector-scope-smoke.mjs`;
- `pages-component-svg-drag-smoke.mjs`;
- `pages-component-hit-smoke.mjs`.

Evidence captures: `artifacts/component-svg-inspector-simplified-1440.png`
(SVG layer inspector reduced to 几何 / 资源 / SVG) and
`artifacts/component-image-inspector-style-group-1440.png` (image layer keeps
几何 / 资源 / 样式 with 填充模式).

## Risks

- The deployed-pages workflows (`component-editor-smoke.yml`,
  `pages-smoke.yml`) must run after the next deployment with the rewritten
  smokes; the retired geometry smoke was removed from both.
- Per-element geometry/presentation authoring is UI-less until a follow-up
  polish item chooses to restore a leaner version.
