# UX1.4 — Typed SVG geometry authoring authority

Status: **authority frozen · 2026-09-06**

Base revision audited:

`main@afc65b83b538b42b04d49ec99656cfae68b74ba5`

Exact UX1.3 closeout evidence on that revision:

- main CI #991 passed;
- Deploy GitHub Pages #299 passed;
- Pages Browser Smoke #250 passed, including the dedicated managed-SVG authorRef + Canvas-highlight browser proof.

UX1.4 is a Component Workbench authoring slice. It does **not** reopen the managed-SVG parser/serializer/runtime authority, Visual Rule target authority, Animation target authority, M8 package/standalone closure, or M9 Attribute/Property authority.

## 1. Re-audit result

### 1.1 Persistence and renderer authority already exists

`ManagedSvgDocument` remains the sole persisted managed-SVG structure authority. Safe geometry is already represented as ordinary validated `ManagedSvgElement.attributes`, and the accepted renderer path remains:

```text
ManagedSvgDocument
  -> canonical serializer
  -> self-contained SVG assetRef
  -> existing Composite renderer / Image-Kanva path
```

Typed geometry authoring therefore does not need a geometry sidecar model, DOM node state, a second renderer, or a new runtime target address.

### 1.2 Existing tag identity remains unchanged

Geometry edits target the same persisted element by canonical `tagId`. `authorRef` remains optional human-facing authoring metadata over that same identity.

Changing geometry must not change:

- `tagId`;
- `authorRef`;
- Visual Rule `svgTagId` targets;
- Animation `layerId` targets.

### 1.3 Package/runtime closure remains unchanged

Geometry is nested inside the existing managed document and is serialized into the existing self-contained SVG `assetRef`. Component package v2 and SCADA work package v1 already carry the full visual definition. Standalone continues to register the same composite component definition.

No package schema/version change is authorized by UX1.4.

## 2. Accepted first typed-geometry slice

UX1.4 initially authorizes only the following tag/field pairs:

```text
rect      x y width height rx ry
circle    cx cy r
ellipse   cx cy rx ry
line      x1 y1 x2 y2
polyline  points
polygon   points
```

Presentation fields accepted earlier remain separate and unchanged:

```text
fill stroke stroke-width opacity
```

The Inspector may show a Geometry section only when the selected managed element has an authorized geometry contract.

## 3. Scalar geometry grammar

The first slice accepts **finite unitless SVG user-space numbers only**.

Accepted examples:

```text
0
12
-4.5
.25
1e2
```

Rejected examples include:

```text
12px
10%
calc(...)
var(...)
NaN
Infinity
```

Rationale: the product needs predictable numeric authoring, not a general SVG/CSS expression editor. Existing imported SVG may retain other safe parser-accepted values, but UX1.4's typed authoring UI does not create them.

Normalization rules:

- surrounding whitespace is trimmed;
- finite numbers are canonicalized with JavaScript numeric string form;
- normalized empty input removes the controlled attribute and returns to SVG default semantics;
- non-finite or non-unitless input fails closed without mutating the document.

### 3.1 Signed fields

These fields may be negative:

```text
rect: x y
circle: cx cy
ellipse: cx cy
line: x1 y1 x2 y2
```

### 3.2 Non-negative fields

These fields must be greater than or equal to zero:

```text
rect: width height rx ry
circle: r
ellipse: rx ry
```

Negative size/radius input fails closed.

## 4. `points` grammar

`polyline.points` and `polygon.points` are accepted as a bounded list of finite unitless coordinate pairs.

Authoring input may use SVG-compatible comma and/or whitespace separators, but normalization persists one canonical form:

```text
x,y x,y x,y
```

Rules:

- at least one coordinate pair is required when the attribute is present;
- the number of scalar coordinates must be even;
- every coordinate must be finite;
- no units, percentages, CSS expressions or non-numeric tokens are accepted;
- the first slice caps the list at 512 coordinate pairs to avoid turning Inspector input into an unbounded vector-data channel;
- empty normalized input removes `points`;
- wrong-tag use fails closed.

UX1.4 does not add point handles, node dragging, Bézier editing, or a vector illustration sub-editor.

## 5. Explicitly deferred geometry

The following are **not** authorized in the first UX1.4 slice:

### `g transform`

A transform editor needs a separately bounded transform grammar and composition semantics. UX1.4 must not expose the raw attribute as an arbitrary string merely to add coverage.

### `path d`

Raw path data is potentially useful, but it has its own command grammar, numeric arity, flags and malformed-input behavior. It remains deferred until a dedicated validator proves fail-closed canonical authoring through the existing managed-SVG authority.

This is not a rejection of later `transform` or `d`; it is a boundary against reintroducing a free-form XML/string editor through the typed-geometry gate.

## 6. Mutation authority

Geometry mutation must reuse the existing immutable managed-document authoring pattern:

```text
(tagId, typed geometry field, user value)
  -> validate/normalize
  -> replace/remove one existing ManagedSvgElement attribute
  -> assertManagedSvgDocument(nextDocument)
  -> canonical SVG serializer
  -> updated assetRef
```

There must be no independent geometry object that can disagree with `ManagedSvgElement.attributes`.

A geometry-only change must produce a new canonical serialized SVG/assetRef when its SVG attribute value changes.

## 7. Canvas and selection behavior

UX1.3's editor selection authority remains:

```text
(layerId, tagId)
```

After a geometry edit, the existing selected tag remains selected. Canvas highlight is remeasured from the updated canonical serialized managed document using the existing editor-only transient measurement path and the existing Konva layer transform.

No Canvas geometry handle or direct internal-SVG drag behavior is authorized in this slice.

## 8. Visual Rule and Animation boundaries

Visual Rules continue to persist and execute by:

```text
layerId + svgTagId? + typed visual target
```

UX1.4 does not add geometry fields as new Visual Rule targets.

Animation continues to target only `layerId`. UX1.4 does not add per-tag geometry animation or per-frame managed-SVG serialization.

## 9. M8 / M9 boundaries

UX1.4 introduces:

- no resource table;
- no package envelope field;
- no remote asset lookup;
- no runtime alias resolution;
- no Scene field;
- no Attribute/Property namespace change.

Typed SVG geometry remains private component visual authoring state inside the existing managed document.

## 10. Required proof before UX1.4 may close

Deterministic model evidence must prove:

- each accepted tag exposes only its authorized field set;
- scalar values normalize deterministically;
- signed fields accept negative finite values;
- size/radius fields reject negative values;
- units/CSS expressions/non-finite values fail closed;
- empty input removes the controlled geometry attribute;
- points normalize deterministically and reject odd/non-numeric/oversized coordinate lists;
- wrong tag/field combinations fail closed;
- geometry edits preserve `tagId` and `authorRef`;
- geometry edits update canonical serialization/assetRef deterministically;
- previous document snapshots are not mutated.

Browser evidence must prove at minimum:

- selecting an imported managed SVG element exposes only the appropriate typed Geometry fields;
- editing geometry updates the rendered element and selected-element Canvas highlight through the existing renderer/measurement path;
- save/reopen preserves the geometry and stable author reference/tag identity;
- Preview remains read-only;
- existing managed-SVG authoring/package/standalone regressions remain green.

## 11. Gate result

The audit finds **no need for a second persistence, DOM, renderer or runtime authority**, and no M8/M9 boundary conflict.

UX1.4 is therefore authorized to implement the first typed-geometry slice using only existing `ManagedSvgElement.attributes` plus the canonical managed-SVG serializer.

If implementation discovers that a requested field requires a sidecar geometry model, mounted DOM SVG renderer, new runtime target system, package schema change, or unrestricted attribute-string editing, stop that sub-slice and report instead of widening this authority.