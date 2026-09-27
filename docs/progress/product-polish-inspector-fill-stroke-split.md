# Component Inspector Fill/Stroke Group Split

## Status

Implemented for review · 2026-09-27.

Issue: #205. Dogfooding polish under the current `PLAN.md` product-polish
phase. No new numbered milestone, no M10A boundary change.

## Problem

The component editor's vector-layer style inspector rendered fill and stroke
configuration inside one combined collapsible group titled `填充与描边`. For
filled primitives (rect, circle, ellipse, path, polygon, arc) that group mixed
two independent concerns:

- fill mode / solid color / linear gradient / radial gradient controls;
- stroke color, stroke width and stroke type.

Authors could not collapse stroke configuration without also hiding fill
configuration (and vice versa), and the long fill block pushed the stroke
fields far down the panel.

## Changes

- `src/features/component-library/ComponentVisualStyleInspector.tsx` — the
  combined group is split into two independent collapsible groups:
  - `填充` renders only for filled primitives (`!isLineOrScale`) and owns the
    fill mode and color/gradient controls;
  - `描边` renders for every vector primitive and owns stroke color, stroke
    width and stroke type.
- Line and scale layers have no fill controls, so they now render only the
    `描边` group instead of a group whose title promised a fill section that
    did not exist.
- Field labels, the visual style model, validation and every update path are
  unchanged. This is a grouping/labels-only change.

## Verification

- `npx tsc -b` — clean.
- `npm run lint` — clean (0 errors; pre-existing repo-wide warnings unchanged).
- Local dev-server browser proof (design mode, `#/components/new`):
  - a rect layer renders independent `填充` (填充模式, 纯色填充) and `描边`
    (描边, 描边宽度, 描边类型) groups in that order, with no `填充与描边`
    remnant;
  - a line layer renders no `填充` group.
- `scripts/pages-component-inspector-style-groups-smoke.mjs` — durable
  deterministic Pages regression asserting both independent groups, their
  field ownership and their order for a rect layer.

## Non-goals

- No Attribute/Property, package, persistence or runtime behavior change.
- No scene-side (SCADA Workbench) inspector change.
- No new visual style fields or defaults.
