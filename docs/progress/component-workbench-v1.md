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
| M6.2 Layer Tree foundation | **accepted · 2026-08-09** · PR #52 · `e9919343d42d1334f2ba2ccd927469db50943d56` · CI #310 ✅ | Serialized private Group / SVG / Image / Vector / Text tree; add/nest/reorder/rename/delete/save/reopen manual smoke passed |
| M6.2.1 Workbench UX architecture | implementation complete · PR pending · manual smoke pending | Replaces the long-form editor with explicit Visual / Component / Property / Action / Event / Anchor workspaces and a Layers → Canvas → Inspector design shell |
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
- The old `renderCode` field is migrated into an explicit `implementationDraft` field.
- `implementationDraft` remains inert text: no eval, dynamic import, browser script execution, or Runtime registration path was added.
- Contract-key editing was stabilized so renaming commits on blur instead of remounting the editor on every keystroke.
- Changing a Property kind preserves its title, description, and bindable flag while resetting only kind-specific default/options.

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

A single SVG or bitmap is a one-layer composite component. Mixed SVG + bitmap + vector + text composition uses the same model.

### Acceptance — 2026-08-09

Manual browser smoke passed after PR #52 merged.

Confirmed:

- add all supported layer kinds
- nest layers under Group
- reorder siblings / z-order
- rename layer ids without losing child hierarchy
- re-parent layers
- edit geometry / visibility / opacity
- delete a Group and its complete subtree
- save the package and reopen it with the Layer Tree intact

**Result: M6.2 Layer Tree foundation is accepted.**

## M6.2.1 Component Workbench UX architecture

### Why this slice was inserted

The M6.2 functionality worked, but the Component Workbench was still organized as one long stack of large forms. Continuing to add Style, Rules, Animation and Script to that structure would make the authoring experience increasingly difficult to understand.

This slice therefore changes interaction architecture before adding new component capability.

### Completed in code

- Replaced the vertically stacked editor with explicit top-level workspaces: `设计 / 组件 / 属性 / 方法 / 事件 / 锚点`.
- The current workspace is always visible and carries a clear `Private Implementation` or `Public Contract` boundary indicator.
- Component metadata/size authoring moved into the dedicated `组件` workspace.
- Properties, Actions, Events and Anchors each receive a dedicated public-contract workspace instead of being hidden behind a second nested tab system.
- `ComponentContractEditor` is now controlled by the parent workbench tab rather than owning its own navigation state.
- The visual workspace is reorganized into the intended IDE geometry:

```text
Layers            Component Canvas            Inspector
  ↓                      ↓                        ↓
what exists        where it is designed      selected item details
```

- Layer creation and hierarchy navigation stay in the left pane.
- The center pane now establishes a persistent component-artboard workspace with design dimensions and selected-layer context.
- The center pane deliberately remains a renderer placeholder in M6.2.1; actual composite visual rendering is reserved for M6.3 so UX restructuring does not become a renderer rewrite.
- Selected-layer identity, hierarchy, geometry, visibility, opacity and kind-specific fields move to the right Inspector.
- Layer reordering remains available from the Inspector while sibling order continues to represent z-order.
- The old `implementationDraft` field remains in persisted packages for compatibility but is no longer presented as a primary component-development surface.
- The Component workspace explicitly explains that M6.5 will replace the ambiguous implementation text with the real Controlled Script workspace.
- No component package schema, runtime semantics, Scene model, SCADA Workbench behavior or Registry publication behavior changes in this slice.

### Interaction invariant

The workbench now follows one stable mental model:

```text
Design workspace
  Layers -> Canvas -> Inspector

Public contract workspaces
  Component / Properties / Actions / Events / Anchors

Future private implementation workspaces
  Styles / Rules / Animation / Script
```

This makes M6.3+ additive instead of forcing another structural UI rewrite later.

### Verification status

- Build and Lint must pass before merge.
- Manual browser smoke should verify workspace switching, existing Layer Tree operations, save/reopen, and that no existing public-contract editing capability disappeared.

### Deliberately deferred

- no actual Composite Renderer on the center canvas yet
- no drag/resize/rotate editing on the component canvas yet
- no asset browser/import UI yet
- no Style / Rule / Animation panels yet
- no Controlled Script editor yet
- no final visual polish, shortcuts, context menus, resizable docks or panel persistence yet

## Next checkpoint

After the M6.2.1 browser smoke passes, continue **M6.3 Visual style + rule foundation** on top of this stable workbench shell. M6.3 should plug actual composite rendering and typed style/rule authoring into the existing Canvas and Inspector rather than inventing another editor structure.
