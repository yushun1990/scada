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
| M6.2 Layer Tree foundation | next | Heterogeneous private visual tree with Group / SVG / Image / Vector / Text |
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

The Component Workbench is now authoring the same public schema that the generic component kernel understands. The remaining gap is private visual implementation and publication, not another definition translation layer.

### Deliberately deferred

- no internal/private state editor yet
- no Action parameter or Event payload schema yet because the kernel Definition does not expose those schemas yet
- no Layer Tree yet
- no asset import yet
- no Visual Rules or animation yet
- no Controlled Script execution yet
- no custom package registration in the SCADA component palette/runtime yet

## Next checkpoint

**M6.2 Layer Tree foundation** should introduce the first private implementation model without changing the public contract:

```text
ComponentDefinition   public / stable
        +
Visual Layer Tree     private implementation
        ↓
Group / SVG / Image / Vector / Text
```

The first Layer Tree slice should focus on stable serialized structure and basic authoring, not advanced animation or script behavior.
