# Component Canvas Selection Pass-Through

## Status

Implemented for review · 2026-09-27.

Base: `main@a724a48` (PR #204). Dogfooding polish under the current `PLAN.md`
product-polish phase. No new numbered milestone, no M10A boundary change.

## Problem

Reported on `#/components/component-smart-storage-tank`: after clicking the
outlet-pipe line on the canvas, clicking other components/layers no longer
changed the selection.

Reproduced deterministically against the seeded sample (design 320×280):

- click 出料管线 → selected;
- click 金属罐体外壳 / 左侧支腿 (painting below the pipe) → selection stayed
  on 出料管线;
- click 液位读数 (painting above the pipe) → selected normally.

## Root cause

`CompositeComponentVisualRenderer` granted the primary-selected layer a
full-bounds invisible hit rect (`ownsFullBoundsDragHitArea`, introduced
alongside the first-drag fix in `7000941`): a `LayerBoundsHitArea` covering
the layer's whole transform box, rendered on top of that layer's subtree.
Konva hit testing is strictly z-ordered, so once a layer with a loose
transform box was selected, that box intercepted every click meant for
lower layers — and because the clicked layer was already selected, nothing
visibly changed. The sample's pipe polyline is exactly that shape of
authored data: absolute `points` with a transform box of (0,0)-(290,250)
covering nearly the whole artboard.

This contradicted the renderer's own documented hit policy two lines below:
only empty groups own a bounds hit area "while filled layers stay
hit-precise to their shapes".

## Changes

- `src/component-system/CompositeComponentVisualRenderer.tsx` — removed the
  primary-selection full-bounds hit area and the now-dead `draggableLayerId`
  prop. Layer dragging keeps working through `dragEnabled` (all root layers
  stay Konva-draggable, the actual substance of the first-drag fix), started
  from a press on the layer's own ink. The empty-group bounds hit area is
  unchanged.
- `src/features/component-library/ComponentVisualCanvas.tsx` — stopped
  passing the removed prop.
- `scripts/pages-component-hit-smoke.mjs` — durable regression: on the
  seeded sample, selecting the loose-bounds pipe must not block canvas
  clicks on the leg/tank-body beneath it, and the pipe must remain
  draggable by its own ink (committed transform moves). The section leaves
  the unsaved fixture through the B2 guard like the toolbar smoke.

No schema, contract, persistence or runtime change; selection semantics
(`handlePointerTarget`, outermost scope) are untouched.

## Verification

- Tank repro (local dev build, before → after): clicks on 罐体/支腿/文本
  after selecting the pipe returned 出料管线 before; after the fix they
  select 液体液位层 (topmost ink at that point), 左侧支腿, 金属罐体外壳
  and 液位读数 respectively, while the pipe stays clickable and draggable.
- `SCADA_PAGES_URL=<local> SCADA_BROWSER=chromium|firefox
  node scripts/pages-component-hit-smoke.mjs` — passed in both browsers,
  including the new loose-bounds pass-through section and all pre-existing
  assertions (empty-group hit, drag of a selected empty group from blank
  area, modifier selection, release-only snap).
- Canvas regression smokes passed locally: group-selection, geometry,
  primitives, design.
- CI model checks passed: `check-line-layer-interaction.ts`,
  `check-component-create-mode.ts`, `check-component-layer-order.ts`,
  `check-component-layer-navigation.ts`.
- `npm run lint` and `npm run build` pass (pre-existing unrelated lint
  warnings unchanged).
- The extended hit smoke is registered unchanged by path in
  `component-editor-smoke.yml` (PR gate) and `pages-smoke.yml` (chromium +
  firefox deployed gate).

## Remaining risks

- Grabbing a selected layer by pressing on empty space inside its transform
  box (off its ink) no longer drags it; that convenience was exactly what
  blocked lower layers. Layers are dragged from their own ink; selected
  empty groups keep their bounds grab.
- Deployed Pages acceptance is a post-merge gate, as with prior polish
  items.

## Next eligible work item

Report the deployed Pages smoke results for the merged heads (toolbar
disabled-state and this fix); continue the outstanding D2/D3 UI rollout
items. Not started here.
