# UX1.6 Component Workbench Dogfood Closeout

## Status

Active · 2026-09-06.

Execution base: `main@d229138f584970f3252d9c34e10086b35acb7e3c`.

UX1.1 through UX1.5 are implementation-complete and deployed-browser proven. UX1.6 is an acceptance/dogfood closeout gate, not a new runtime or schema milestone.

## UX1.5 closure

UX1.5 Internal target convergence is closed on `main@d229138f584970f3252d9c34e10086b35acb7e3c`.

Final exact-main evidence:

- PR #161 delivered the authoring-only convergence over existing canonical `tagId` / `svgTagId` authority;
- PR #162 repaired the browser acceptance setup so the Rule-driving Property is created through the real root Property authoring surface;
- PR #163 removed an ambiguous generic alias text locator and anchored the browser assertion to the unique `rule1 作用对象` combobox;
- main CI #1006 passed Build, Runtime model checks, Lint and publication-api;
- Deploy GitHub Pages #303 passed;
- Pages Browser Smoke #254 passed against the exact deployed revision.

The final deployed UX1.5 proof demonstrated:

- a real root Property authoring flow can drive Visual Rule creation;
- current managed-SVG internal selection defaults a new Visual Rule to the same canonical `tagId`;
- switching Rule targets drives the same transient Canvas/Inspector `(layerId, tagId)` selection;
- `@authorRef` is the friendly authoring label while persisted Rule authority remains `svgTagId`;
- alias rename updates labels without rewriting or retargeting `svgTagId`;
- save/reopen preserves both the alias metadata and canonical target identity;
- Preview keeps Rule target authoring read-only;
- existing managed-SVG, package, work-package and standalone regressions remain green.

No second SVG renderer/runtime target authority was introduced. Animation remains layer-only. M8/M9 boundaries are unchanged.

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

The existing deployed browser suite already proves most of the second half:

- `pages-managed-svg-authoring-smoke.mjs`: real SVG/PNG import, managed SVG editing, Preview, save/reopen, component package transfer, normal SCADA activation, work-package closure and fresh standalone rendering;
- `pages-managed-svg-author-ref-smoke.mjs`: authorRef and Visual Rule target convergence through real Property authoring;
- `pages-managed-svg-geometry-smoke.mjs`: typed internal SVG geometry authoring and Canvas highlight remeasurement;
- arrange/pointer smokes: Canvas manipulation, Navigator selection and Chromium/Firefox pointer regressions.

The uncovered UX1.6 gap was that no single end-to-end journey began with normal Palette primitive creation and carried that same authored component through the existing package/work/standalone closure.

## Authorized closeout change

Extend the existing `pages-managed-svg-authoring-smoke.mjs` rather than creating a second runtime or duplicate acceptance harness:

1. select `矩形` from the visible Palette;
2. place it on Canvas using the existing create mode;
3. return to component root and re-select the primitive through Navigator;
4. rename/configure it through the normal layer Inspector;
5. continue the existing SVG/PNG authoring and portability scenario unchanged;
6. assert the Palette-authored primitive survives save/reopen, component package export/import and work dependency closure.

This is test/acceptance work only unless the deployed journey exposes an actual product usability defect. Do not add runtime/schema authority merely to make the smoke pass.

## Closure gate

UX1.6 and the UX1 authoring reset close only when the exact merged revision passes:

- PR CI;
- main CI;
- GitHub Pages deployment;
- Pages Browser Smoke containing the continuous Palette → Canvas → Navigator → Inspector → SVG/PNG → package → SCADA → work package → standalone journey.

If the deployed journey exposes a real product interaction defect, repair it narrowly in the existing authoring authority and repeat the exact-main closure. If it exposes only an acceptance-locator defect, repair the test without changing product/runtime authority.
