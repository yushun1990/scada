# UX1 Component Workbench Authoring UX Reset

## Status

Active · authorized by product dogfooding review on 2026-09-06.

Current base revision: `main@65ce6bd76a67e8f1b1f412ef80fb91da77bba824` (UX1.2B Arrange authority merged in PR #155, browser-smoke timing closeout in PR #156).

UX1.1 and UX1.2 are implementation-complete and browser-proven. The next execution boundary is UX1.3, which requires a fresh-conversation authority re-audit before any persistence or target-model implementation begins.

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

**Status:** next authority-review gate; implementation not yet authorized.

**Goal:** make managed SVG useful as component internals instead of an opaque image with a hidden tag tree.

Before implementation, re-audit and freeze the relationship between:

- `ManagedSvgDocument` / stable `tagId` identity;
- current Visual Rule internal SVG target authority;
- animation target authority;
- M8 component/work package resource closure and standalone runtime;
- any proposed author-facing alias/reference representation.

Surface candidate after authority freeze:

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

The exact persisted representation must be frozen before implementation if it requires a schema version change. Do not introduce a second DOM, renderer or runtime target authority.

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

**UX1.3 SVG element selection + stable author references — fresh-conversation authority re-audit required before implementation.**

UX1.2 is closed and browser-proven. Do not start UX1.3/UX1.4 persistence or target-authority implementation from inherited assumptions in this conversation. In a fresh conversation, pull latest `main`, reread `PLAN.md` and this document, then re-audit `ManagedSvgDocument`/`tagId`, Visual Rule internal SVG target authority, animation target authority and M8 package/standalone closure. If a proposed design requires a second DOM/renderer/runtime target authority or breaks M8/M9 boundaries, stop and report instead of implementing it.
