# UX1 Component Workbench Authoring UX Reset

## Status

Active · authorized by product dogfooding review on 2026-09-06.

Current proven base revision: `main@afc65b83b538b42b04d49ec99656cfae68b74ba5` (UX1.3 implementation merged in PR #158; dedicated authorRef + Canvas-highlight browser closeout merged in PR #159).

UX1.1, UX1.2 and UX1.3 are implementation-complete and browser-proven. UX1.4 is the active execution gate. Its typed-geometry authority is frozen in `docs/progress/ux1.4-typed-svg-geometry-authority.md`; implementation is proceeding without reopening renderer/runtime/package authority.

This is a product-polish track, not a new runtime architecture milestone. It exists because normal hands-on component authoring exposed a structural usability defect: the editor exposed private implementation concepts as the primary creation workflow, so users had to understand Layer kinds and tree operations before they could draw a simple component.

## Problem statement

The accepted M6.2 shell established `Layers -> Canvas -> Inspector`, but hands-on use proved that the Layer Tree had two incompatible jobs:

1. navigation / structure inspection;
2. object and asset creation.

That made the first-use path implementation-oriented rather than task-oriented. A user who wants a rectangle, text label or imported SVG should not have to create an abstract Vector/SVG Layer through a tree editor first.

The product-level authoring model is reset to:

```text
Palette
   ↓ create
Canvas
   ↔ Navigator
   ↔ Inspector
```

Normative interaction rule:

> Visual primitives and assets are created for the Canvas from an explicit Palette; the Layer Tree is a Navigator for selection and structure visibility; the Inspector configures the current selection. Canvas interaction is the primary manipulation authority.

## Architecture boundaries

UX1 must preserve the accepted M6-M9 and M6.3P1 authorities:

- no second renderer or runtime authority;
- no raw DOM / React / Konva authored API;
- no flattening of Attribute and Property namespaces;
- no Scene schema changes merely to improve component authoring;
- no hidden asset fetching or broad media-library scope;
- SVG managed document remains canonical private SVG structure authority for managed imports;
- M8 resource closure remains mandatory at distribution boundaries;
- portable user Actions / Events remain unchanged;
- full vector illustration/path-point tooling remains out of scope.

A narrow typed edit of safe SVG geometry attributes or raw `path d` may be considered later in UX1 only if it preserves the existing managed-SVG parser/sanitizer/serializer authority. That is not authorization for a free-form XML editor or node-point vector editor.

## Execution gates

### UX1.0 Authoring interaction authority freeze

**Status:** frozen.

**Goal:** replace the old "Layer Tree is the creation surface" rule with the Palette/Canvas/Navigator/Inspector model before deeper implementation.

Acceptance:

- this document is the execution authority for UX1;
- M6.2.2's historical statement that layer creation stays exclusively in the left Layer Tree is superseded interaction guidance, not a runtime/schema rollback;
- no persistence/runtime/renderer authority changes are introduced.

### UX1.1 Palette + Navigator split

**Status:** implementation merged in PR #149 at `main@c7d8b366d223fa397077b785972372283050080a`; product dogfood continues through UX1 closeout.

**Goal:** make the first authoring action discoverable without changing the visual schema.

Merged surface:

- left dock has an explicit `添加` Palette;
- primitives are shown directly as user concepts rather than through a generic Layer-kind selector;
- palette entries include 矩形、圆形、椭圆、线段、Path、文本、组;
- SVG / 图片 import lives in the `添加` section;
- the `图层` section is a navigation view: component root + current hierarchy + selection state;
- created objects continue to persist as the existing Vector/Text/Group/SVG/Image layers;
- import/replace semantics and managed SVG authority remain unchanged.

### UX1.2 Canvas-native creation + arrange

**Status:** implementation complete and browser-proven on `main@65ce6bd76a67e8f1b1f412ef80fb91da77bba824`.

**Goal:** make Canvas the primary manipulation surface.

#### UX1.2A Create mode + draw

**Status:** implementation merged in PR #150 and browser-proven by Pages Browser Smoke #245 on `main@a80926974471066a30461c62858d35e508579e6a`.

Implementation slice:

- selecting 矩形 / 圆形 / 椭圆 / 线段 enters an explicit transient create mode;
- create-mode state is authoring UI state only and is never persisted into Component Visual / Scene / package/runtime schemas;
- Canvas pointer drag creates geometry in the existing component design coordinate space;
- click creates a sensible default-size object at the pointer;
- `Esc` exits create mode;
- create preview uses editor-only Konva overlay while committed geometry is still an existing `VectorVisualLayer` rendered by `CompositeComponentVisualRenderer`;
- newly created layer is selected immediately and enters the existing Inspector / history flow;
- create coordinates use the existing component grid when snapping is enabled;
- Path, text and Group remain default-size creation actions in this slice because UX1 does not authorize a general path-point or group drawing model.

Acceptance proven by browser smoke:

- drag/click creation and normal Canvas manipulation;
- Group/Ungroup, align and distribute regression;
- save/reopen;
- animation authoring and preview;
- Chromium/Firefox pointer semantics;
- managed SVG authoring and SVG compatibility replacement;
- component/work package closure;
- standalone runtime and reusable package activation.

The stale Pages smoke contracts exposed by UX1.1 were migrated through PRs #151-#154. Pages Browser Smoke #245 is the first full green run after that migration and closes UX1.2A's automated browser gate.

#### UX1.2B Arrange authority

**Status:** implementation merged in PR #155; browser acceptance timing fixed in PR #156; browser-proven by Pages Browser Smoke #247 on `main@65ce6bd76a67e8f1b1f412ef80fb91da77bba824`.

Authority freeze:

- `ComponentVisualDefinition.layers` remains the only persisted layer-order authority; no `zIndex`, alternate tree or renderer-side order state is introduced;
- among layers with the same `parentId`, later sibling order renders in front of earlier sibling order;
- arrange commands only reorder sibling slots and never reparent layers;
- same-parent multi-selection moves as a block while preserving the selected layers' existing relative order;
- mixed-parent selection fails closed for z-order commands;
- Group/Ungroup continues to use the existing `component-layer-hierarchy` authority;
- Canvas toolbar is the primary common-workflow Arrange surface; Navigator remains structural navigation and Inspector remains precise configuration.

Implemented surface:

- Bring to Front / Bring Forward / Send Backward / Send to Back are exposed as `置于顶层 / 上移一层 / 下移一层 / 置于底层` on the Canvas toolbar;
- deterministic `component-layer-order` helper owns sibling reordering semantics without schema/runtime changes;
- deterministic checks cover single selection, multi-selection, nested siblings, boundary no-op and mixed-parent fail-closed behavior;
- Pages arrange smoke covers Canvas toolbar commands, multi-selection ordering, save/reload persistence and Preview read-only behavior;
- the existing Palette `组` entry remains because current accepted pointer/empty-layer regression intentionally uses an empty Group fixture. Whether empty Group remains a user-facing creation affordance is a later product-dogfood decision, not part of the z-order authority migration.

Acceptance proven:

- four z-order commands work from the Canvas toolbar with correct disabled states;
- same-parent multi-selection preserves relative ordering;
- grouping/ungrouping remains under the existing hierarchy/transform authority;
- save/reopen persists resulting sibling order using only normal Component Visual state;
- Preview cannot mutate order;
- main CI #977 is fully green;
- Pages Browser Smoke #247 is fully green, including the new Arrange smoke and all existing toolbar, animation, Chromium/Firefox pointer, Managed SVG, SVG compatibility, component/work package, standalone runtime and reusable-package regressions.

### UX1.3 SVG element selection + stable author references

**Status:** implementation complete and browser-proven on `main@afc65b83b538b42b04d49ec99656cfae68b74ba5`.

**Goal:** make managed SVG useful as component internals instead of an opaque image with a hidden tag tree.

Authority was frozen before implementation in `docs/progress/ux1.3-svg-author-reference-authority.md`:

- `ManagedSvgElement.tagId` remains the sole canonical persisted structural identity and runtime internal-SVG target identity;
- optional `authorRef` is component-private human authoring metadata attached to that same element, not a second identity;
- source SVG `id`, DOM nodes and Konva nodes are not persisted/runtime target authority;
- Visual Rules continue to persist `layerId + svgTagId?` and do not persist or resolve aliases at runtime;
- Animation remains layer-scoped by `layerId`;
- editor internal selection is transient `(layerId, tagId)` state;
- no alias sidecar table, schema-version bump, package target resolver or second SVG renderer was introduced;
- M8 component/work package and standalone closure and M9 Attribute/Property boundaries remain unchanged.

Implemented surface:

- a managed SVG layer exposes its internal safe structure from the normal Inspector rather than hiding it under resource replacement;
- tree selection and Canvas internal-element highlight share the same canonical `tagId` selection;
- safe elements can receive a stable author-facing `authorRef`;
- alias-only edits do not change serialized SVG bytes or `assetRef`;
- rename/remove alias preserves the canonical `tagId` and existing Visual Rule targets;
- full SVG replacement clears transient internal selection rather than trying to reconcile a new structural identity domain by alias/source id/geometry;
- Canvas highlight uses editor-only transient measurement of the canonical serialized managed document, then reuses the existing layer fit/transform path; no persistent/mounted SVG DOM renderer exists.

Acceptance proven:

- PR #158 merged the authority/model/UI implementation at `main@ed5445045d7a2cca5f9d23b8cfbcc20edf62db47`;
- PR #159 added a dedicated deployed-browser acceptance proof and merged at `main@afc65b83b538b42b04d49ec99656cfae68b74ba5`;
- main CI #991 passed;
- Deploy GitHub Pages #299 passed;
- Pages Browser Smoke #250 passed, including the dedicated authorRef + canonical tree-selection + Canvas-highlight proof;
- save/reopen preserves authorRef on the same tagId while serialized SVG remains alias-free;
- existing managed-SVG, package/work-package, standalone and reusable-package browser regressions remain green.

### UX1.4 Typed SVG geometry authoring

**Status:** active · authority frozen · implementation in PR #160; deployed browser proof remains the closure gate.

**Goal:** extend SVG customization beyond presentation-only fields without becoming a general XML/vector editor.

Normative authority: `docs/progress/ux1.4-typed-svg-geometry-authority.md`.

Authorized first slice:

- `rect`: x/y/width/height/rx/ry;
- `circle`: cx/cy/r;
- `ellipse`: cx/cy/rx/ry;
- `line`: x1/y1/x2/y2;
- `polyline` / `polygon`: bounded points.

Geometry persistence continues to use only the existing `ManagedSvgElement.attributes` of the canonical `tagId` element. There is no geometry sidecar model, DOM target, renderer path, runtime target or package schema.

Typed authoring rules:

- scalar geometry accepts finite unitless SVG user-space numbers only;
- width/height/r/rx/ry are non-negative;
- empty input removes the controlled attribute and returns to SVG default semantics;
- points accept bounded numeric coordinate pairs and persist as canonical `x,y x,y` text;
- wrong tag/field combinations and malformed/non-finite/unit-bearing input fail closed;
- existing fill/stroke/stroke-width/opacity presentation editing remains unchanged;
- geometry edits preserve `tagId` and `authorRef` while regenerating canonical SVG `assetRef` only from the managed document.

Explicitly deferred from this first slice:

- `g transform`, until a bounded transform grammar and composition semantics are frozen;
- `path d`, until a dedicated path command/arity/flag validator is available;
- any path-point handles, internal SVG drag handles or general vector illustration editor;
- any Visual Rule/Animation target expansion (UX1.5 review remains separate).

Current implementation evidence in PR #160:

- deterministic typed-geometry helper/tests are wired through the existing managed-SVG authoring model gate;
- model-phase CI #992 passed;
- tag-scoped Geometry Inspector controls are implemented for the authorized fields;
- dedicated Pages geometry smoke is wired to verify Canvas highlight remeasurement, save/reopen, stable authorRef/tag identity, canonical asset bytes and Preview read-only behavior;
- full head CI #996 passed before this governance update.

UX1.4 must not be marked closed until the merged revision passes main CI, Pages deployment and the deployed Pages Browser Smoke containing the dedicated typed-geometry scenario.

### UX1.5 Internal target convergence

**Status:** not started; requires a fresh authority re-audit after UX1.4 closes.

**Goal:** make authored SVG references first-class targets for existing private visual behavior where architecture permits.

Review before implementation:

- current Visual Rule SVG target authority from M6.3P1.3;
- current animation target contract;
- package/standalone closure;
- whether alias is authoring sugar over existing stable tag identity or requires canonical persistence.

Do not create a second SVG runtime target system. UX1.4 does not authorize SVG-tag Animation or runtime alias resolution.

### UX1.6 Dogfood closeout

Acceptance scenario:

```text
new component
  ↓
choose primitive from Palette
  ↓
draw / place on Canvas
  ↓
import SVG and PNG from normal authoring surface
  ↓
use Navigator only to locate/select hierarchy
  ↓
configure selection in Inspector
  ↓
customize managed SVG internal element
  ↓
preview
  ↓
save/reopen
  ↓
export/import component package
  ↓
place in SCADA Workbench
  ↓
export work package
  ↓
fresh standalone rendering
```

A new user should be able to discover how to start without understanding `VisualLayerKind`, `assetRef`, Layer parent semantics or renderer internals.

## Current execution gate

**UX1.4 Typed SVG geometry authoring — finish the already-frozen first slice and obtain exact merged-revision deployed browser proof.**

UX1.3 is closed on `main@afc65b83b538b42b04d49ec99656cfae68b74ba5`. Continue UX1.4 only within `docs/progress/ux1.4-typed-svg-geometry-authority.md`: existing `ManagedSvgElement.attributes` are the sole geometry persistence authority; `tagId` remains canonical identity; `authorRef` remains authoring metadata; Visual Rule and Animation target authorities remain unchanged; M8/M9 boundaries remain intact. Do not start UX1.5, `g transform`, `path d`, SVG-tag animation or runtime alias resolution until UX1.4 closes and the relevant later authority review is performed.
