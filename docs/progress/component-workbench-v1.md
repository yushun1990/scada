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
| M6.2.1 Workbench UX architecture | merged · PR #54 · `c43a23c2b6aeeb6a95b52f40d21bcdea199a7133` · CI #314 ✅ · superseded before final acceptance | Removed the long-form editor and established the first Layers → Canvas → Inspector IDE shell |
| M6.2.2 Workbench layout convergence | merged · PR #56 · `9976672680d9dd95fd8ed6281810e44dec7dee26` · CI #319 ✅ · inspector semantics superseded before final acceptance | Align Component Workbench with SCADA Workbench: top Design/Preview, left Layers, center Canvas, right contextual Inspector |
| M6.2.3 Unified contextual Properties inspector | merged · PR #58 · `598825aa1fec4608913266e9a02bf6b78723fac9` · CI #323 ✅ · manual smoke pending | Merge Base + Properties into one contextual Properties tab: component root shows metadata/public Properties/size/Anchors; private Layer shows Layer properties |
| M6.2.4 Shared collapsible property groups | merged · PR #59 · `6dae1117fd4a82c59cfd2aab703eaf9b60ee4987` · CI #325 ✅ · manual smoke pending | Component Workbench and SCADA Workbench property groups share one collapsible block interaction without persisting UI state into Scene/Package |
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

Tracking: PR #54, merged as `c43a23c2b6aeeb6a95b52f40d21bcdea199a7133` after CI #314 passed Build and Lint.

### Why this slice was inserted

The M6.2 functionality worked, but the Component Workbench was still organized as one long stack of large forms. Continuing to add Style, Rules, Animation and Script to that structure would make the authoring experience increasingly difficult to understand.

### Completed

- Removed the vertically stacked editor.
- Established the first explicit `Layers -> Component Canvas -> Inspector` visual-authoring shell.
- Separated component metadata and public Properties / Actions / Events / Anchors from private Layer authoring.
- Moved selected-layer identity, hierarchy, geometry, visibility, opacity and type-specific fields into a dedicated Inspector.
- Hid the ambiguous `implementationDraft` text area from the primary authoring flow while preserving the persisted compatibility field.
- No package schema, Runtime, Scene, Registry publication or SCADA Workbench semantics changed.

### Superseded before final acceptance

PR #54 passed CI, but before its manual UX smoke was accepted the workbench interaction model was reviewed again against the existing SCADA Editor.

The stronger conclusion is that Component Workbench should not have a separate top-level navigation model such as `设计 / 组件 / 属性 / 方法 / 事件 / 锚点`. The application should reuse one consistent spatial language across both editors.

Therefore M6.2.1 remains a useful structural step, but its exact navigation is superseded by M6.2.2 rather than being marked Accepted.

## M6.2.2 Component Workbench layout convergence

Tracking: PR #56, merged as `9976672680d9dd95fd8ed6281810e44dec7dee26`. CI #318 found a TypeScript nullable-Layer narrowing issue in callbacks; the Inspector was refactored to pass the guarded Layer as an explicit non-null value, and CI #319 then passed Build and Lint.

### Goal

Make Component Workbench and SCADA Workbench share the same interaction grammar:

```text
                     SCADA Workbench          Component Workbench
Top mode             Design / Preview         Design / Preview
Left dock            Components/Layers/etc.   Internal Layers
Center                Scene Canvas             Component Canvas
Right inspector       Properties/Actions/...  Contextual Inspector
```

The two workbenches still edit different things, but users should not need to learn two unrelated application layouts.

### Completed

- Component Workbench now imports and reuses the same shared `m2.css` / `workbench.css` layout primitives as SCADA Editor.
- Header follows the SCADA layout and exposes `设计 / 预览` as the only top-level mode switch.
- Save remains a document action in the header rather than another workspace tab.
- The previous top-level `设计 / 组件 / 属性 / 方法 / 事件 / 锚点` navigation is removed.
- Main layout is permanently three-column:

```text
Left: internal Layer Tree
Center: Component Canvas
Right: contextual Inspector
```

- The left Layer Tree includes an explicit component-root row in addition to private visual layers.
- Selecting the component root or a private Layer changes the contextual inspector target.
- Layer creation stays exclusively in the left dock; z-order movement, deletion and precise Layer editing live in the right inspector.
- Design mode allows package authoring; Preview mode locks authoring controls while preserving navigation and selection context.
- The center artboard remains a deliberate placeholder until M6.3 provides the real Composite Renderer.
- Native built-ins use the same shell but remain read-only and expose their component root rather than reverse-engineered internal layers.
- Existing `implementationDraft` persistence remains untouched and hidden from the primary UI.
- No Component Package schema, Scene model, Runtime behavior, Registry publication path or SCADA Workbench behavior changed.

### Further convergence before final acceptance

The M6.2.2 layout is retained, but its `基础信息 / 属性 / 方法 / 事件` inspector split is superseded by M6.2.3 before final UX acceptance. The stronger interaction rule is that **Properties means the properties of the currently selected design object**.

## M6.2.3 Unified contextual Properties inspector

Tracking: PR #58, merged as `598825aa1fec4608913266e9a02bf6b78723fac9` after CI #323 passed Build and Lint.

### Goal

Remove the artificial distinction between `基础信息` and `属性` while preserving the public/private architecture boundary.

The stable right-side model becomes:

```text
Properties | Actions | Events
```

`Properties` is contextual:

```text
select Component root
        ↓
Properties
├── basic metadata
├── size
├── public Component Properties
├── Anchors
└── implementation boundary summary

select private Layer
        ↓
Properties
├── layer identity / hierarchy
├── geometry
├── visibility / opacity
└── kind-specific private data
```

### Completed

- Removed the standalone `基础信息` inspector tab.
- Right inspector now contains exactly `属性 / 方法 / 事件`, matching the SCADA Editor mental model more closely.
- `属性` is the default inspector and is automatically selected whenever component-root / Layer selection changes.
- Selecting the component root shows one continuous component Properties inspector containing basic metadata, status, description, default/minimum size, public Property contract, Anchors and the implementation-boundary summary.
- Public Property authoring is embedded directly into the component-root Properties inspector rather than living behind a second tab.
- Anchors remain with the component root inside Properties because they are public visual geometry metadata.
- Selecting a private Layer shows the existing Layer inspector in the same `属性` tab; public Component Properties are not mixed into private Layer editing.
- `方法 / 事件` remain component-level public contracts and do not change meaning based on selected private Layer.
- Preview continues to make authoring controls read-only.
- No ComponentDefinition schema, ComponentVisualDefinition schema, Scene model, Runtime, Registry publication or SCADA Workbench behavior changes.

### Interaction invariant

The right-side inspector now follows one rule:

> Properties always describe the currently selected design object; Actions and Events always describe the component's public interaction contract.

This keeps the UI intuitive without exposing private Layer fields as public Component Properties.

### Verification status

- PR #58 passed CI #323 Build and Lint and was squash merged as `598825aa1fec4608913266e9a02bf6b78723fac9`.
- Manual smoke is still pending; M6.2.4 extends the same Properties UX before final acceptance.

## M6.2.4 Shared collapsible property groups

Tracking: PR #59, merged as `6dae1117fd4a82c59cfd2aab703eaf9b60ee4987` after CI #325 passed Build and Lint.

### Goal

Make long contextual Properties inspectors easy to scan in both editors by giving every logical property group one shared collapsible-block interaction.

```text
SCADA Workbench Properties
├── ▾ 标识
├── ▾ 组件属性
├── ▾ 几何
└── ▾ 显示

Component Workbench Properties
├── ▾ 基本信息 / 图层
├── ▾ 尺寸 / 几何
├── ▾ 公开属性 / 显示
├── ▾ 连接锚点 / 资源
└── ▸ 实现边界
```

### Completed

- Added one shared `CollapsibleInspectorGroup` React component under `src/components`.
- The shared group owns only transient open/closed UI state; collapse state is not written into `SceneDocument`, Component Package persistence, Runtime state, or undo/redo history.
- Group headers are keyboard-accessible buttons with `aria-expanded` and one shared chevron/open-state visual treatment.
- Existing property controls remain unchanged inside the groups.
- Component Workbench component-root groups are collapsible: basic metadata, size, public Properties, Anchors and implementation boundary.
- Component Workbench private Layer groups are collapsible: layer identity/hierarchy, geometry, display and kind-specific resource/vector/text sections.
- SCADA component instance groups are collapsible: identity, component Properties/bindings, geometry and display.
- SCADA connection Properties use collapsible identity/path, style and endpoint groups.
- SCADA multi-selection Properties use a collapsible bulk-properties group.
- The no-selection scene summary is presented as a collapsible Scene group so the right dock follows the same visual grammar even with no selected object.
- Groups default open to preserve the previous information visibility; the low-frequency Component Workbench implementation-boundary group defaults closed.
- Shared styling lives in `workbench.css`, so Component Workbench and SCADA Workbench do not diverge into two similar-but-different collapse implementations.
- No Scene schema, ComponentDefinition, ComponentVisualDefinition, Runtime behavior, Registry publication, binding semantics, Action/Event semantics or persistence format changes in this slice.

### Verification status

- CI #325 passed Build and Lint.
- PR #59 was squash merged as `6dae1117fd4a82c59cfd2aab703eaf9b60ee4987`.
- manual smoke after merge should verify:
  - clicking any property-group title collapses/expands only that group
  - editing inside one group does not reset its collapse state during normal rerenders
  - component-root and private-Layer inspectors both use the shared treatment
  - SCADA component, connection, multi-select and no-selection Properties use the same treatment
  - collapsing groups creates no undo/redo entries and does not change saved Scene/Package data
  - Preview/read-only controls remain read-only while group headers remain usable for inspection

### Deliberately deferred

- collapse-state persistence across route reloads or browser sessions
- expand-all / collapse-all commands
- final pixel-level Inspector polish

## Next checkpoint

After M6.2.4 manual smoke is accepted, continue **M6.3 Visual style + rule foundation**. M6.3 should extend the selected Layer's contextual Properties inspector with typed Style / Visual Rule groups and plug the real Composite Renderer into the existing center Canvas; those new groups should use the same shared collapsible primitive rather than introducing another navigation model.
