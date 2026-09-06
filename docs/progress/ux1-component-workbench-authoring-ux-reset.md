# UX1 Component Workbench Authoring UX Reset

## Status

Active · authorized by product dogfooding review on 2026-09-06.

Current base revision: `main@c7d8b366d223fa397077b785972372283050080a` (PR #149 merged).

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

**Status:** active.

**Goal:** make Canvas the primary manipulation surface.

#### UX1.2A Create mode + draw

Implementation slice:

- selecting 矩形 / 圆形 / 椭圆 / 线段 enters an explicit transient create mode;
- create-mode state is authoring UI state only and is never persisted into Component Visual / Scene / package/runtime schemas;
- Canvas pointer drag creates geometry in the existing component design coordinate space;
- click creates a sensible default-size object at the pointer;
- `Esc` exits create mode;
- create preview uses editor-only Konva overlay while committed geometry is still an existing `VectorVisualLayer` rendered by `CompositeComponentVisualRenderer`;
- newly created layer is selected immediately and enters the existing Inspector / history flow;
- create coordinates use the existing component grid when snapping is enabled;
- Path, text and empty Group remain default-size creation actions in this slice because UX1 does not authorize a general path-point or group drawing model.

Acceptance:

- drag-create rect/circle/ellipse/line;
- click-default create;
- cancel with Esc;
- created shape immediately supports select/transform/undo/redo;
- save/reopen preserves only normal visual-layer state, never create-mode state.

Smoke contract migration:

- the Pages Browser Smoke triggered after PR #149 failed because `scripts/pages-smoke.mjs` still searched for the removed `添加图层` Layer-Tree action;
- this is a stale test-contract failure, not a renderer/runtime failure;
- UX1 browser smoke now creates its fixture Groups through the Palette `组` action and uses the Layer Tree only for navigation/selection;
- PR #150 carries this smoke migration together with UX1.2A so the automated test enforces the new authoring authority.

#### UX1.2B Arrange authority

Next slice after UX1.2A passes CI/browser dogfood:

- Group/Ungroup from canvas/contextual arrange controls;
- Bring to Front / Bring Forward / Send Backward / Send to Back;
- hierarchy operations no longer require parent/z-order editing as the primary workflow;
- Canvas drop remains the primary SVG/PNG/JPEG/WebP drag/drop affordance.

### UX1.3 SVG element selection + stable author references

**Goal:** make managed SVG useful as component internals instead of an opaque image with a hidden tag tree.

Surface:

- SVG layer selection exposes an explicit internal-structure editing mode;
- SVG tree selection and Canvas highlight are linked;
- safe managed elements can receive a stable author-facing alias/reference without exposing live DOM nodes;
- references remain component-private and deterministic across save/reopen and package transfer;
- reference identity must not depend on fragile renderer node identity.

Example author-facing target shape:

```text
layer: pumpSvg
element: rotor
```

The exact persisted representation must be frozen before implementation if it requires a schema version change.

### UX1.4 Typed SVG geometry authoring

**Goal:** extend SVG customization beyond presentation-only fields without becoming a general XML/vector editor.

Candidate safe typed fields:

- `rect`: x/y/width/height/rx/ry;
- `circle`: cx/cy/r;
- `ellipse`: cx/cy/rx/ry;
- `line`: x1/y1/x2/y2;
- `polyline` / `polygon`: points, if already accepted by the managed parser authority;
- `g`: safe transform subset;
- `path`: raw `d` text only if validated and serialized through the managed SVG authority.

Keep the accepted presentation fields: fill/stroke/stroke-width/opacity.

No arbitrary XML attribute editor, scripts, event handlers, external resources or path-point handles.

### UX1.5 Internal target convergence

**Goal:** make authored SVG references first-class targets for existing private visual behavior where architecture permits.

Review before implementation:

- current Visual Rule SVG target authority from M6.3P1.3;
- current animation target contract;
- package/standalone closure;
- whether alias is authoring sugar over existing stable tag identity or requires canonical persistence.

Do not create a second SVG runtime target system.

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

**UX1.2A Create mode + draw.**

Do not start UX1.3/UX1.4 schema work before UX1.2A/UX1.2B prove the basic authoring flow in browser dogfooding.
