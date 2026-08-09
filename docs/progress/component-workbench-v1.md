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
| M6.1 Package-backed public contract | next | Unify component-library storage with serializable `ComponentDefinition` and author public contract in Component Workbench |
| M6.2 Layer Tree foundation | pending | Heterogeneous private visual tree with Group / SVG / Image / Vector / Text |
| M6.3 Visual style + rule foundation | pending | Typed renderer-independent visual state and property-driven rules |
| M6.4 Animation foundation | pending | Reusable component-internal visual animation primitives |
| M6.5 Controlled Script Runtime | pending | Sandboxed component behavior + Visual API boundary |
| M6.6 User component registration path | pending | Publish a Workbench-authored package so SCADA Workbench consumes it like a built-in component |

## Next slice — M6.1 Package-backed public contract

The current Component Library entry is still a legacy authoring/storage record with flat fields such as `name`, `type`, `defaultWidth`, and `renderCode`.

M6.1 should remove that architectural duplication by making the authoring record directly own the same serializable public definition consumed by the component kernel.

Target direction:

```text
Component package draft
├── package/version metadata
├── ComponentDefinition
│   ├── metadata
│   ├── size
│   ├── properties
│   ├── actions
│   ├── events
│   └── anchors
└── implementation draft
```

Acceptance requirements:

- existing custom component-library v1 records migrate without disappearing
- built-in components remain read-only views of their real registered `ComponentDefinition`
- custom component drafts directly store a serializable `ComponentDefinition`
- Component Workbench can add/edit/remove Properties, Actions, Events, and Anchors
- property kinds use the existing component-kernel schema rather than a second authoring-only schema
- size authoring includes default and minimum dimensions
- invalid public contracts are rejected before save
- no custom `renderCode` or user script is executed in this slice
- SCADA Workbench behavior is unchanged; publishing user packages into the runtime registry remains a later M6 slice
