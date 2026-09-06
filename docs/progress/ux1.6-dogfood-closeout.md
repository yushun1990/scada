# UX1.6 Component Workbench Dogfood Closeout

## Status

Closed · accepted · 2026-09-06.

Final accepted revision: `main@83bf3529d9f55cb28d11fed8e63b4f053451888d`.

UX1.6 is the final acceptance/dogfood closeout gate for the UX1 Component Workbench Authoring UX Reset. It does not create a new runtime, schema or numbered architecture milestone.

## UX1.5 closure inherited by UX1.6

UX1.5 Internal target convergence closed on `main@d229138f584970f3252d9c34e10086b35acb7e3c`.

Final exact-main evidence:

- PR #161 delivered the authoring-only convergence over existing canonical `tagId` / `svgTagId` authority;
- PR #162 repaired the browser acceptance setup so the Rule-driving Property is created through the real root Property authoring surface;
- PR #163 anchored the final browser assertion to the unique `rule1 作用对象` combobox;
- main CI #1006 passed Build, Runtime model checks, Lint and publication-api;
- Deploy GitHub Pages #303 passed;
- Pages Browser Smoke #254 passed against the exact deployed revision.

The deployed UX1.5 proof demonstrated that SVG selection, Visual Rule target authoring and Canvas/Inspector selection converge on the existing canonical `tagId` / `svgTagId` authority while `@authorRef` remains friendly authoring metadata only. No second renderer/runtime target authority was introduced. Animation remains layer-only. M8/M9 boundaries are unchanged.

## UX1.6 goal

Prove the reset authoring model as one discoverable user journey:

```text
Palette
   ↓ create
Canvas
   ↔ Navigator
   ↔ Inspector
```

followed by the accepted distribution/runtime closure:

```text
new component
  ↓
choose primitive from Palette
  ↓
draw / place on Canvas
  ↓
use Navigator to relocate/select the authored layer
  ↓
configure the selection in Inspector
  ↓
import SVG and PNG from the normal authoring surface
  ↓
customize a managed SVG internal element
  ↓
preview
  ↓
save/reopen
  ↓
export/import component package in a fresh browser
  ↓
place the imported component in SCADA Workbench
  ↓
export dependency-complete work package
  ↓
load the exact artifact in a fresh standalone runtime
```

The user-facing acceptance criterion is that this path is discoverable without understanding `VisualLayerKind`, `assetRef`, parent bookkeeping or renderer internals.

## Coverage audit

The existing deployed browser suite already proved most of the second half:

- `pages-managed-svg-authoring-smoke.mjs`: real SVG/PNG import, managed SVG editing, Preview, save/reopen, component package transfer, normal SCADA activation, work-package closure and fresh standalone rendering;
- `pages-managed-svg-author-ref-smoke.mjs`: authorRef and Visual Rule target convergence through real Property authoring;
- `pages-managed-svg-geometry-smoke.mjs`: typed internal SVG geometry authoring and Canvas highlight remeasurement;
- arrange/pointer smokes: Canvas manipulation, Navigator selection and Chromium/Firefox pointer regressions.

The uncovered UX1.6 gap was that no single end-to-end journey began with normal Palette primitive creation and carried that same authored component through the existing package/work/standalone closure.

PR #164 extended the existing `pages-managed-svg-authoring-smoke.mjs` rather than creating a second runtime or duplicate acceptance harness. It added the missing Palette → Canvas → Navigator → Inspector first-use path and carried the Palette-authored primitive through persistence and distribution closure.

## Dogfood defect exposed by the first exact-main run

The first exact-main UX1.6 attempt on `main@b0a0f8954ba1c87251955d0c55daa8e8459e347d` passed main CI #1008 and Deploy GitHub Pages #304, but Pages Browser Smoke #255 failed immediately after clicking the visible `矩形` Palette button: the expected Canvas create-mode status never appeared.

This was a real product interaction defect, not a locator-only failure.

Root cause:

- `useComponentCreateTool()` passed a new inline `subscribe` function to `useSyncExternalStore` on every render;
- unsubscribe cleanup cleared `activeTool` whenever the listener set became empty;
- selecting a Palette tool emitted a store change and caused Tree/Canvas subscribers to re-render;
- React could tear down the render-specific subscriptions before recreating them, temporarily reaching zero listeners and clearing the just-selected create tool.

PR #165 repaired the existing authoring session-state store by moving `subscribe` and `getSnapshot` to stable module scope while preserving cleanup when the editor genuinely has no subscribers.

Authority remained unchanged:

- create mode is transient authoring UI state only;
- no Component Visual / Scene / package schema change;
- no renderer/runtime change;
- no Visual Rule or Animation authority change;
- no M8/M9 boundary change.

## Final exact-main acceptance

PR #165 passed PR CI #1009 and was squash merged as:

`main@83bf3529d9f55cb28d11fed8e63b4f053451888d`

Final exact-main evidence:

- main CI #1010 passed Build, Runtime model checks, Lint and publication-api;
- Deploy GitHub Pages #305 passed on the same revision;
- Pages Browser Smoke #256 checked out the exact deployed revision and passed.

The #256 deployed log explicitly completed the UX1.6 dogfood journey:

```text
Palette
→ Canvas primitive creation
→ Navigator re-selection
→ Inspector configuration
→ managed SVG + PNG authoring
→ Preview
→ save/reopen
→ component package export/import in a fresh browser
→ normal SCADA Workbench placement
→ exact work-package dependency closure
→ fresh standalone runtime
```

The same run also kept the dedicated UX1.5 authorRef/Rule-target convergence proof, UX1.4 typed SVG geometry proof, SVG compatibility proof, component/work-package transfer proof, standalone runtime proof and reusable package regressions green.

## Closure decision

UX1.6 is closed and the entire UX1 Component Workbench Authoring UX Reset is accepted on `main@83bf3529d9f55cb28d11fed8e63b4f053451888d`.

The accepted product interaction authority is:

```text
Palette
   ↓ create
Canvas
   ↔ Navigator
   ↔ Inspector
```

The closeout does not authorize a new runtime/schema milestone. Continue normal product dogfooding and polish under `PLAN.md` while preserving accepted M6–M9, M6.3P1 and UX1 boundaries.
