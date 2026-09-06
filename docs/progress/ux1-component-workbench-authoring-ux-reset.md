# UX1 Component Workbench Authoring UX Reset

## Status

Active · authorized by product dogfooding review on 2026-09-06.

Base revision: `main@65eb8540ec71c9ee111338e4918f69e20b4e058c`.

This is a product-polish track, not a new runtime architecture milestone. It exists because normal hands-on component authoring exposed a structural usability defect: the editor currently exposes private implementation concepts as the primary creation workflow, so users must understand Layer kinds and tree operations before they can draw a simple component.

## Problem statement

The accepted M6.2 shell established `Layers -> Canvas -> Inspector`, but the current interaction model incorrectly gives the Layer Tree two incompatible jobs:

1. navigation / structure inspection;
2. object and asset creation.

That makes the first-use path implementation-oriented rather than task-oriented. A user who wants a rectangle, text label or imported SVG should not have to create an abstract Vector/SVG Layer through a tree editor first.

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

**Goal:** replace the old "Layer Tree is the creation surface" rule with the Palette/Canvas/Navigator/Inspector model before deeper implementation.

Acceptance:

- this document is the execution authority for UX1;
- M6.2.2's historical statement that layer creation stays exclusively in the left Layer Tree is treated as superseded interaction guidance, not as a runtime/schema rollback;
- no persistence/runtime/renderer authority changes are introduced.

### UX1.1 Palette + Navigator split

**Goal:** make the first authoring action discoverable without changing the visual schema.

Surface:

- left dock gains an explicit `添加` Palette;
- primitives are shown directly as user concepts rather than through a generic Layer-kind selector;
- first supported palette entries: 矩形、圆形、椭圆、线段、Path、文本、组;
- SVG / 图片 import moves into the `添加` section;
- the `图层` section becomes a navigation view: component root + current hierarchy + selection state;
- empty state tells the user to choose a primitive or import an asset;
- created objects continue to persist as the existing Vector/Text/Group/SVG/Image layers;
- import/replace semantics and managed SVG authority remain unchanged.

Initial interaction may create a sensible default-size object on the component design surface. UX1.2 owns pointer-drag drawing gestures.

### UX1.2 Canvas-native creation + arrange

**Goal:** make Canvas the primary manipulation surface.

Surface:

- primitive tool selection enters a clear create mode;
- pointer drag draws rect/circle/ellipse/line bounds; click creates a default-size object;
- `Esc` exits create mode;
- group/ungroup and z-order operations are available from Canvas/contextual arrange controls rather than requiring hierarchy editing fields;
- import by dropping SVG/PNG/JPEG/WebP on the Canvas remains supported and becomes the primary drag/drop affordance;
- selection immediately drives the right Inspector.

Acceptance must include create -> select -> transform -> undo/redo -> save/reopen.

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

**UX1.1 Palette + Navigator split.**

Do not start UX1.3/UX1.4 schema work before UX1.1/UX1.2 prove the basic authoring flow in browser dogfooding.
