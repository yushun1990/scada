# UX1.3 — SVG element selection + stable author reference authority

Status: **authority frozen · 2026-09-06**

Base revision audited:

`main@fae183b2e367fddffc98b58052f482b1864cf797`

This document is the required authority decision before UX1.3 author-reference UI is implemented.

UX1.3 is a Component Workbench authoring correction. It does **not** reopen the accepted M6 managed-SVG runtime, M8 component/work-package portability and standalone closure, M9 Attribute/Property authority, or authorize M10 scene/widget capability work.

## 1. Re-audit result

### 1.1 `ManagedSvgDocument` / `tagId`

`src/component-system/managedSvg.ts` remains the canonical managed-SVG authority.

Each retained element owns a persisted private `tagId`:

```text
svg-tag-000001
svg-tag-000002
...
```

The ID is assigned when a source is first normalized into a managed SVG document and survives clone, component save/reopen and package transfer because it is persisted in the managed document itself.

The current serializer emits `data-scada-tag` only as deterministic transport/debug evidence. Source-provided `data-scada-tag` is not trusted as authority.

The managed document therefore already owns the stable structural identity UX1.3 needs. No DOM node, CSS selector, XPath, React ref or Konva node needs to become identity authority.

### 1.2 Visual Rule internal SVG target

Accepted M6.3P1.3 Visual Rule authority is:

```text
(layerId, svgTagId?) + typed target
```

When `svgTagId` is present, `resolveComponentVisualRules()` resolves the target against `ManagedSvgDocument` by persisted `tagId` and creates a resolved in-memory document snapshot. The existing Composite renderer then serializes that snapshot through the same managed-SVG serializer and existing image/Konva path.

Visual Rule therefore already has one canonical SVG-internal runtime address. UX1.3 must not add `authorRef`, source SVG `id`, DOM selector or renderer-node identity as a second persisted rule address.

### 1.3 Animation target

Accepted animation authority remains Layer-scoped:

```text
VisualAnimation.layerId
        ↓
VisualRuntimeOverlay[layerId]
```

Animations do not currently target `svgTagId`, and M6.3P1 explicitly deferred SVG-tag animation because per-frame internal SVG mutation would either widen the accepted overlay address or create a second runtime/rendering path.

UX1.3 therefore does **not** add SVG-element animation targeting. Author references may be displayed by later authoring surfaces, but animation persistence/runtime remains Layer-scoped until a separately reviewed convergence slice proves reuse of the existing visual address and runtime model.

### 1.4 M8 component/work-package closure

The distributable component package still carries the complete `ComponentVisualDefinition` and validates the same managed SVG resource through the existing codec. Managed SVG `assetRef` must remain a self-contained `data:image/svg+xml,...` artifact derived from the managed document.

The SCADA work package embeds validated distributable component dependencies; it does not introduce another visual resource table or target resolver.

### 1.5 Standalone closure

Standalone runtime parses the same M8 work package and registers each portable dependency through:

```text
createCompositeComponentRegistration(definition, visual)
```

There is no standalone-only SVG renderer or target resolver. UX1.3 must preserve this property.

## 2. Authority decision

UX1.3 adopts a **stable author-facing reference as optional metadata on the existing managed element**.

The persisted model is extended additively to the equivalent of:

```ts
type ManagedSvgElement = {
  kind: 'element'
  tagName: string
  tagId: string
  authorRef?: string
  attributes: readonly ManagedSvgAttribute[]
  children: readonly ManagedSvgNode[]
}
```

The authority relationship is fixed as:

```text
tagId      = canonical persisted structural identity and runtime target identity
authorRef  = optional component-private authoring alias for that same element
source id  = ordinary SVG source/reference attribute only
DOM node   = transient parser/measurement implementation detail only
Konva node = renderer/editor implementation detail only
```

`authorRef` is therefore **not a second identity domain**. It is human-readable metadata attached to the element whose identity is still `tagId`.

## 3. Persisted author-reference contract

### 3.1 Scope and uniqueness

An `authorRef`:

- is optional;
- is scoped to one `ManagedSvgDocument`;
- must be unique within that document;
- is case-sensitive;
- is stable across save/reopen, component package transfer, enclosing work-package transfer and standalone load because it is nested in the existing visual document;
- may be renamed or removed without changing the element `tagId`.

The initial accepted grammar is:

```text
[A-Za-z_][A-Za-z0-9_-]{0,63}
```

The `svg-tag-` prefix is reserved and may not be used as an author reference, avoiding visual ambiguity with canonical private tag IDs.

Whitespace is not part of an author reference. Authoring helpers trim input before validation; an empty normalized value removes the optional reference.

### 3.2 No sidecar alias map

UX1.3 must not create a second document-level alias table such as:

```text
aliases[authorRef] -> tagId
```

as independent persisted authority.

The element itself owns the optional metadata. Reverse lookup is derived by traversing the canonical managed document. This prevents a sidecar map from disagreeing with structure after clone, edit or replacement.

### 3.3 No SVG/XML authority change

`authorRef` is SCADA authoring metadata, not SVG presentation/content.

Canonical SVG serialization must therefore **not** emit `authorRef` into source XML, `id`, `class`, `data-*`, CSS selectors or URL fragments.

For a managed SVG layer, the existing invariant remains byte-oriented and unchanged:

```text
assetRef == serializeManagedSvgDataUrl(document)
```

Changing only `authorRef` must not change the serialized SVG XML or `assetRef` bytes.

This preserves both the managed SVG rendering path and M8 self-contained resource closure.

## 4. Schema/version decision

No package-envelope or visual-schema version bump is required for UX1.3 author references.

Reason:

- `authorRef` is an optional additive field inside the existing private `ManagedSvgElement` JSON model;
- an existing managed document without `authorRef` remains valid with identical semantics;
- current clone semantics preserve additive element metadata;
- canonical SVG serialization deliberately ignores the metadata;
- Visual Rule and Animation wire shapes remain unchanged;
- distributable component package v2 and SCADA work package v1 already transport the full nested visual model.

`ManagedSvgDocument.version` therefore remains `1` and `ComponentVisualDefinition.version` remains `4` for this additive authoring metadata.

If implementation discovers that preserving this metadata requires changing package ownership, serializer authority or runtime target wire shape, this decision is invalid and UX1.3 must stop for a new authority review instead of silently bumping a schema.

## 5. Visual Rule authority after author references

Visual Rule persistence remains exactly:

```text
layerId
svgTagId?
target
```

An authoring surface may display a friendly reference such as:

```text
layer: pumpSvg
element: rotor
```

but selecting `rotor` resolves through the current `ManagedSvgDocument` to its canonical `tagId`, and the persisted Visual Rule continues to store that `svgTagId`.

Consequences:

- renaming `rotor -> rotorMain` does not retarget or invalidate an existing rule;
- removing the author reference does not orphan an existing rule;
- two elements can never claim the same author reference within one document;
- source SVG `id` never becomes Visual Rule target authority.

UX1.3 may add authoring lookup helpers, but it must not add runtime alias resolution to `resolveComponentVisualRules()`.

## 6. Animation authority after author references

Animation persistence and runtime remain Layer-scoped and continue to use `layerId` only.

UX1.3 does not add:

- `svgTagId` to `VisualAnimation`;
- `authorRef` to `VisualAnimation`;
- per-tag Visual Runtime overlay channels;
- per-frame managed-SVG serialization;
- DOM/CSS animation targeting.

A later UX1.5 convergence review may decide how friendly author references are shown for already-authorized private visual targets, but any actual SVG-tag animation capability still requires its own runtime-authority proof.

## 7. Selection and Canvas-highlight authority

SVG element selection in Component Workbench is **editor session state**, not package/runtime state.

The canonical editor selection key is:

```text
(layerId, tagId)
```

The tree, Inspector and Canvas highlight must all derive from that same key.

An `authorRef` may be displayed beside the selected element, but it is not the selection identity.

Canvas highlight may use transient browser parsing or geometry measurement only as an implementation detail over a canonical serialized managed document. It may not persist a DOM `Node`, selector, XPath, React ref or renderer node and may not create a mounted second SVG runtime beside the accepted Composite renderer.

If a useful Canvas highlight cannot be implemented without a parallel SVG renderer/DOM target authority, that highlight sub-slice must stop and report instead of violating this freeze.

## 8. Structural replacement and reconciliation

A full managed-SVG replacement remains a new structural identity domain.

UX1.3 does not guess correspondence by author reference, source `id`, preorder number or geometry across unrelated SVG documents.

Existing M6.3P1 rule replacement fencing remains authoritative. Author references from the previous managed document are not automatically copied to a replacement document.

A future explicit structural reconciliation feature would require a separate decision and deterministic proof.

## 9. M8 boundary

UX1.3 author references are nested component-private metadata and introduce no new resource dependency.

They must not add:

- a resource table;
- extra package files;
- remote lookup;
- host-relative lookup;
- a work-package alias resolver;
- a standalone-only visual resource path.

The same distributable component codec and work-package dependency closure remain authoritative.

## 10. M9 boundary

An SVG `authorRef` is neither a Component Attribute nor a Component Property.

It does not change:

- Attribute authored/static public configuration authority;
- Property runtime/point-driven public authority;
- Property-driven Visual Rule conditions;
- explicit `valueSource.namespace = attribute | property`;
- Scene/standalone effective Property authority.

The reference remains private implementation metadata inside the component visual.

## 11. Required implementation proof

Before UX1.3 can expose editable alias UI, automated evidence must prove at minimum:

- optional author references validate with the frozen grammar;
- duplicate references fail closed;
- the reserved `svg-tag-` prefix fails closed;
- assigning, renaming and removing an author reference preserves the same `tagId`;
- author-reference-only changes do not change canonical SVG serialization or managed `assetRef`;
- clone/save/reopen preserves the reference;
- distributable component package round-trip preserves it without a package-version change;
- enclosing SCADA work-package round-trip preserves it without a work-package-version change;
- standalone parse/registration accepts the same package through the existing registration path;
- Visual Rules still persist and execute by `svgTagId`, not author reference;
- Animation remains Layer-scoped;
- no DOM/Konva/React object enters persisted state.

## 12. Explicit non-goals

This freeze does not authorize:

- alias-driven runtime lookup;
- a second Visual Rule target shape;
- SVG-tag Animation expansion;
- DOM selectors, XPath or source SVG `id` as target authority;
- a mounted DOM SVG renderer beside Konva;
- a per-tag React/Konva renderer;
- arbitrary XML attribute authoring;
- structural SVG editing/reconciliation;
- M8 package/resource-table changes;
- M9 Attribute/Property changes;
- M10 scene/widget work.

## 13. Gate result

The audit finds **no need for a second DOM/renderer/runtime target authority** and **no need to move or weaken M8/M9 boundaries**.

The accepted UX1.3 authority is therefore:

```text
ManagedSvgElement.tagId
        = one canonical structural/runtime identity

ManagedSvgElement.authorRef?
        = stable human-facing authoring metadata over that identity

Visual Rule
        = layerId + svgTagId? (unchanged)

Animation
        = layerId (unchanged)

Renderer
        = ManagedSvgDocument -> serializer -> existing Image/Konva path (unchanged)

M8 package / work package / standalone
        = existing nested visual transport and registration path (unchanged)
```

With this authority frozen, implementation may proceed in order:

1. model validation + author-reference helper operations + deterministic/package proofs;
2. shared editor SVG-element selection state keyed by `(layerId, tagId)`;
3. Canvas/tree/Inspector selection linkage that does not create a second renderer authority;
4. only then author-facing reference editing UI.

The alias UI must not be used to discover or redefine this contract after implementation begins.
