# Component Workbench v1 Progress

This document records M6 Component Workbench delivery against [`PLAN.md`](../../PLAN.md) and the component architecture in [`docs/architecture/component-system.md`](../architecture/component-system.md).

Every merged M6 implementation slice must update this progress log in the same pull request.

## Entry gate

M6 starts only after the first SCADA Runtime foundation has proved both runtime data binding and generic Event -> Action behavior.

### M5 exit acceptance — 2026-08-09

The M5.7 manual browser smoke test is accepted.

Confirmed path:

```text
Designer
  Pump A.startRequested -> Pump B.start
        ↓
Preview
  invoke Pump A.start
        ↓
Pump A emits startRequested
        ↓
persisted Behavior
        ↓
Pump B.start
        ↓
Pump B emits startRequested
```

Confirmed boundaries:

- the behavior is configured from public Event / Action contracts rather than component-type branches
- Behavior configuration is persisted and remains available after returning to Designer
- Preview executes the behavior through the generic Runtime kernel
- Preview does not re-enable normal canvas transform editing
- runtime behavior remains separate from visual `SceneConnection` anchors

**Result: M5 Runtime foundation is accepted and M6 Component Workbench v1 is now the active implementation phase.**

## M6 target

The Component Workbench should become the place where technically capable component developers create and encapsulate complexity, while the SCADA Workbench continues to consume only a simple public contract.

```text
Component Workbench
├── public contract
│   ├── Properties
│   ├── Actions
│   ├── Events
│   └── Anchors
├── visual implementation
│   ├── SVG
│   ├── bitmap assets
│   ├── vector primitives
│   ├── text
│   └── groups
├── rules / expressions
├── animation
├── controlled script
└── preview / diagnostics
        ↓
encapsulated reusable component
        ↓
SCADA Workbench
  simple configuration + binding + behavior use
```

## Status

| Slice | Status | Result |
| --- | --- | --- |
| M6 entry gate | **accepted · 2026-08-09** | M5.7 Event -> Action manual smoke passed; Runtime foundation closed |
| M6.1 Package-backed public contract | merged · PR #50 · `8fd82dc826c30600a4e9740355700b611bf36634` · CI #305 ✅ | Component Library package draft owns the real serializable `ComponentDefinition`; Workbench authors Properties / Actions / Events / Anchors |
| M6.2 Layer Tree foundation | merged · PR #52 · `e9919343d42d1334f2ba2ccd927469db50943d56` · CI #310 ✅ · manual smoke pending | Serialized private Group / SVG / Image / Vector / Text tree with hierarchy and basic authoring |
| M6.3 Visual style + rule foundation | pending | Typed renderer-independent visual state and property-driven rules |
| M6.4 Animation foundation | pending | Reusable component-internal visual animation primitives |
| M6.5 Controlled Script Runtime | pending | Sandboxed component behavior + Visual API boundary |
| M6.6 User component registration path | pending | Publish a Workbench-authored package so SCADA Workbench consumes it like a built-in component |

## M6.1 Package-backed public contract

Tracking: PR #50, merged as `8fd82dc826c30600a4e9740355700b611bf36634` after CI #305 passed Build and Lint.

### Completed

- Added reusable `assertComponentDefinition` validation in the component-system layer.
- ComponentRegistry now uses the same serializable Definition validator that Component Workbench persistence uses.
- Component Library persistence moved from flat v1 authoring records to package-backed v2 storage.
- A package draft directly owns a `ComponentDefinition` instead of duplicating `name`, `type`, `defaultWidth`, and similar fields outside the kernel model.
- Existing custom `scada-editor-lab.components.v1` records are migrated on first read into v2 package drafts; the legacy key is left untouched as a rollback source.
- Built-in library entries are generated from the actual registered `ComponentDefinition` and remain read-only.
- Package save rejects malformed or duplicate component types before persistence.
- Definition validation covers component identity, default/minimum size, Property schema/default compatibility, select options, Action/Event definitions, and normalized visual Anchor geometry.
- Component Workbench now authors default and minimum component size.
- Added schema-driven public-contract authoring for Properties, Actions, Events, and Anchors.
- Property authoring reuses the existing kernel kinds: string, number, boolean, color, and select.
- Select options can use string or numeric values and the chosen default remains typed.
- Public Properties can opt into SCADA runtime data binding through the existing `bindable` contract flag.
- Visual Anchors expose normalized position, outward direction, snap radius, role, and optional connection kinds.
- Workspace component-library listing now consumes package `definition` metadata directly.
- The old `renderCode` field is migrated into an explicit `implementationDraft` text area.
- `implementationDraft` is still inert text: no eval, dynamic import, browser script execution, or Runtime registration path was added.
- Contract-key editing was stabilized so renaming commits on blur instead of remounting the editor on every keystroke.
- Changing a Property kind now preserves its title, description, and bindable flag while resetting only kind-specific default/options.

### Architecture result

```text
Component Library package draft
        ↓ owns
ComponentDefinition
├── metadata + size
├── Properties
├── Actions
├── Events
└── Anchors
        ↓
shared component-system validation
        ↓
save / later publish
```

## M6.2 Layer Tree foundation

Tracking: PR #52, merged as `e9919343d42d1334f2ba2ccd927469db50943d56`. Final verification was CI #310 after fixing the validator narrowing issue found by CI #309.

### Completed

- Added versioned `ComponentVisualDefinition` as private package implementation data.
- Visual mode is explicit: built-in components use `native`; user-authored composite components use `composite`.
- Added heterogeneous visual-layer union for `Group`, `SVG`, `Image`, `Vector`, and `Text`.
- Every layer owns stable identity, name, parent id, local x/y/width/height/rotation/scale, visibility, and opacity.
- SVG and bitmap layers persist an `assetRef`; actual asset import/storage is deliberately deferred.
- Vector layers identify a primitive (`rect`, `circle`, `ellipse`, `line`, or `path`) and may persist path data.
- Text layers persist their component-private text content.
- Layer-tree validation rejects duplicate ids, invalid transforms, invalid opacity, missing parents, non-Group parents, and hierarchy cycles.
- Native visual packages cannot accidentally contain composite layers.
- Existing M6.1 v2 custom packages that do not yet have a `visual` field are normalized to an empty composite tree without another storage-key migration.
- Built-in package views expose `native` visual mode and do not attempt to reverse-engineer React/Konva renderer internals.
- Added `ComponentVisualTreeEditor` to Component Workbench.
- Component developers can add all five layer kinds and freely mix them in one component.
- Selecting a Group and adding a layer makes the new layer a child of that Group; otherwise the new layer inherits the current sibling parent/root context.
- The editor renders hierarchy indentation while preserving serialized sibling order as z-order.
- Layers can be moved up/down among siblings, re-parented to valid Groups, renamed, hidden, made translucent, transformed, or deleted.
- Renaming a Layer id also rewrites direct child `parentId` references so hierarchy identity remains stable.
- Parent selection excludes the current layer and all descendants, preventing authoring a hierarchy cycle through the UI.
- Deleting a Group removes its complete private visual subtree rather than leaving dangling children.
- Kind-specific Inspector fields are shown only where relevant: assetRef for SVG/Image, primitive/path data for Vector, text for Text.
- Layer Tree remains entirely private implementation data and is not added to `ComponentDefinition` or exposed to SCADA Workbench.
- No renderer, SceneDocument, Runtime binding, Action/Event behavior, or custom-component publication path consumes these layers yet.

### Architecture result

```text
Component package
├── ComponentDefinition        public contract
└── ComponentVisualDefinition  private implementation
    └── Layer Tree
        ├── Group
        │   ├── SVG
        │   └── Vector
        ├── Image
        └── Text
```

A single SVG or bitmap is now simply a one-layer composite component. Mixed SVG + bitmap + vector + text composition uses the same model.

### Verification status

- CI #309 correctly rejected an `unknown` transform-field narrowing issue in the first validator implementation.
- The validator was corrected to narrow transform fields explicitly.
- CI #310 then passed both Build and Lint before PR #52 merged.
- A browser smoke test is still required for add/nest/reorder/rename/delete/save/reopen behavior before M6.2 is marked accepted.

### Deliberately deferred

- no binary/SVG asset import or project asset manager yet
- no actual visual rendering/preview of user-authored layers yet
- no fill/stroke/shadow/gradient/filter style model yet
- no property-driven visual rules yet
- no animation definition/runtime yet
- no runtime layer creation/removal API
- no Controlled Script / Visual API yet
- no publication into the SCADA Registry yet

## Next checkpoint

After the M6.2 browser smoke passes, **M6.3 Visual style + rule foundation** should add typed renderer-independent appearance and the first declarative Property -> visual-layer mapping without requiring scripts.
