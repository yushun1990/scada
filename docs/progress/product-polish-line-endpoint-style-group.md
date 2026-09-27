# Component Inspector Line Endpoint Style Group

## Status

Implemented for review · 2026-09-27.

Issue: #206. Dogfooding polish under the current `PLAN.md` product-polish
phase. Stacks on the fill/stroke group split
(`docs/progress/product-polish-inspector-fill-stroke-split.md`). No new
numbered milestone, no M10A boundary change.

## Problem

The component editor's line-layer inspector exposed three related but
scattered controls:

- the style group was titled `填充与描边` even though a line layer has no fill
  section (fixed for lines by the fill/stroke split, which leaves a
  stroke-only `描边` group);
- 端点形状 (line cap) rendered inside that stroke group;
- 起点样式/终点样式 (start/end markers) lived in a separate group titled
  `线段箭头与标记`.

Authors configuring a line's endpoints had to look in two groups whose titles
did not describe the split (cap vs markers).

## Changes

`src/features/component-library/ComponentVisualStyleInspector.tsx`:

- the line cap field is extracted into one `lineCapField` element;
- line layers render it inside the renamed `端点样式` group, above
  起点样式/终点样式, so all endpoint rendering config lives in one place;
- the former `线段箭头与标记` group title is gone;
- non-line layers keep today's behavior: the line cap field still renders in
  the `描边` group for scale layers and for dashed strokes, where it already
  lived.

Field labels, the visual style model, validation and every update path are
unchanged.

## Verification

- `npx tsc -b` — clean.
- `npm run lint` — clean (0 errors; pre-existing repo-wide warnings unchanged).
- Local dev-server browser proof (design mode, line layer): groups render as
  几何 → 描边 → 光效与投影 → 端点样式, with 端点样式 owning 端点形状,
  起点样式 and 终点样式 and no `填充` group.
- `scripts/pages-component-inspector-style-groups-smoke.mjs` — extended with
  deterministic line-layer assertions: no fill group, `描边` and `端点样式`
  titles present, former title absent, line cap inside the endpoint group and
  absent from the stroke group.

## Non-goals

- No Attribute/Property, package, persistence or runtime behavior change.
- No scene-side (SCADA Workbench) inspector change.
- No new marker/line-cap options.
