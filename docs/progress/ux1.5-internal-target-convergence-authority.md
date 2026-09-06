# UX1.5 — Internal target convergence authority

Status: **authority frozen · 2026-09-06**

Base revision audited:

`main@bb6cdd2a471105e2fb5c3a2748206a3d4848900c`

Exact UX1.4 closeout evidence on that revision:

- main CI #999 passed;
- Deploy GitHub Pages #300 passed;
- Pages Browser Smoke #251 passed, including the dedicated typed managed-SVG geometry scenario.

UX1.5 is a Component Workbench authoring-convergence slice. It does **not** authorize a new SVG runtime target system, DOM/renderer identity, package resolver, Animation target address, Scene field, or M8/M9 boundary change.

## 1. Re-audit result

### 1.1 Managed SVG identity

`ManagedSvgElement.tagId` remains the sole canonical persisted structural identity for a managed SVG element.

Optional `authorRef` remains human-facing authoring metadata attached to the same element. It is unique only within one `ManagedSvgDocument`, may be renamed or removed, and is not a runtime address.

Editor internal selection remains transient:

```text
(layerId, tagId)
```

No alias sidecar table or DOM/Konva node identity is authorized.

### 1.2 Visual Rule target authority already exists

Internal managed-SVG Visual Rules already persist:

```text
layerId
+ svgTagId?
+ typed VisualRuleTargetField
```

When `svgTagId` is present, runtime resolution locates the canonical managed element by `tagId`, produces a resolved managed-document snapshot, and continues through the existing managed-SVG serializer/renderer path.

Therefore UX1.5 does not need a new persisted `authorRef`, alias resolver, runtime target kind, or renderer path.

Normative rule:

> Author-facing aliases may select and describe an existing Visual Rule target, but the authoring layer must resolve that selection to the canonical `svgTagId` before persistence.

Renaming/removing `authorRef` must never retarget or invalidate an existing Visual Rule whose `svgTagId` still exists.

### 1.3 Animation authority is intentionally different

Visual Animation is currently layer-scoped. Every accepted animation kind persists `layerId`, compiles to `VisualRuntimeContributionTrack[]`, and composes into a `VisualRuntimeOverlay` keyed by layer ID.

That runtime overlay owns only layer-level transform / opacity / visibility composition.

Adding `svgTagId` to Animation would require at least one of:

- a second internal-SVG runtime overlay address;
- per-frame managed-document mutation/serialization;
- renderer-owned node targeting;
- a widened Visual Runtime target authority.

UX1.5 does **not** authorize any of those changes.

Therefore:

> Animation remains layer-only in UX1.5.

This is not a missing convergence implementation. It is the accepted authority boundary. Internal SVG parts that need independent motion should remain separate visual layers until a future architecture review proves a single compatible runtime composition model.

### 1.4 M8 package and standalone closure

Component package v2 already transports the complete validated `ComponentVisualDefinition`, including managed documents and Visual Rules. SCADA work package dependency closure embeds the same portable component package state. Standalone builds normal composite registrations from bundled definitions/visuals and uses the same runtime.

Because UX1.5 does not change persisted Visual Rule or Animation schemas, no package-version change, standalone resolver, installation behavior, or runtime-scoped alias table is required.

## 2. Authorized authoring convergence

UX1.5 may improve only the existing authoring surface as follows.

### 2.1 Friendly managed-SVG target labels

Visual Rule target choices may display:

```text
@statusLamp · <rect>
```

when `authorRef` exists, while keeping canonical `tagId` visible as secondary diagnostic detail where useful.

Without `authorRef`, the UI falls back to the existing stable `tagId` label.

Source SVG `id` may remain tertiary context only; it is never target authority.

### 2.2 Shared selection convergence

The existing transient managed-SVG selection `(layerId, tagId)` is the shared authoring selection for:

- SVG internal tree;
- Canvas internal-element highlight;
- Visual Rule internal-target authoring.

Authorized behavior:

- choosing an internal SVG target in a Visual Rule updates the shared transient selection so Canvas/Inspector highlight the same canonical element;
- adding a Visual Rule while a presentation-editable internal SVG element of the same layer is selected may default to that selected `tagId`;
- switching a rule back to whole-layer scope must not fabricate or persist another internal selection identity.

No selection state is written into Component Visual, package, Scene or runtime schemas.

### 2.3 Existing-rule presentation

For a persisted rule with `svgTagId`, authoring UI resolves the current managed element only for display:

- show the current `authorRef` when present;
- otherwise show the canonical `tagId`;
- if the alias changes, the displayed label changes while the persisted rule does not;
- if the canonical tag disappears because the SVG structure was replaced, existing fail-closed compatibility/validation behavior remains authoritative.

## 3. Explicit non-goals

UX1.5 does not add:

- persisted `authorRef` fields to Visual Rule;
- runtime alias lookup;
- alias-to-tag sidecar maps;
- SVG-tag Animation;
- per-frame SVG document serialization;
- DOM selectors or DOM node references;
- Konva node IDs as authored targets;
- geometry fields as new Visual Rule runtime targets;
- `g transform` or `path d` authoring;
- component/work-package schema changes;
- M9 Attribute/Property authority changes.

## 4. Required proof

Deterministic/model evidence must continue to prove:

- Visual Rules still persist/validate by `svgTagId` only;
- authorRef rename/remove preserves existing rule target identity;
- package and standalone validation need no alias resolver;
- Animation schema remains layer-only.

Browser evidence must prove at minimum:

- assigning `authorRef` makes the Visual Rule target UI show the friendly reference;
- selecting that target keeps the persisted rule on canonical `svgTagId`;
- Visual Rule target selection updates the same SVG internal Canvas highlight/Inspector selection;
- adding a rule while an editable internal element is selected defaults to that canonical element target;
- renaming `authorRef` updates authoring labels without rewriting `svgTagId`;
- save/reopen preserves the rule and current alias presentation;
- Preview/runtime behavior remains unchanged;
- existing managed-SVG, package/work-package and standalone regressions remain green.

## 5. Gate result

The audit finds **no need for a second persistence, DOM, renderer or runtime authority** for Visual Rule authoring convergence.

UX1.5 is therefore authorized to converge SVG Inspector / Canvas / Visual Rule authoring around the existing transient `(layerId, tagId)` selection while persisting only canonical `svgTagId`.

Animation internal-SVG targeting is explicitly **not authorized** by this gate because the current accepted animation/runtime-overlay model is layer-scoped. If a future requirement needs per-element animation, reopen that runtime-composition authority deliberately rather than smuggling it through authoring polish.