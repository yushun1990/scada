# M9A2 — Component Workbench + SCADA Inspector authority separation

Status: **implemented; awaiting final CI / merge acceptance**.

Architecture authority: `docs/architecture/component-attributes-properties.md`.

## Goal

Expose the M9A1 Attribute / Property split directly in both authoring surfaces without prematurely changing runtime authority.

## Component Workbench

The root component contract Inspector now exposes two independent sections:

```text
Public Contract
├─ Attributes     authored static configuration
└─ Properties     runtime semantic values / binding targets
```

Attributes use a dedicated contract editor and support the shared scalar kinds/defaults/options, but they do **not** expose `bindable`.

Properties retain their explicit runtime-binding capability.

The migrated Pump is the representative proof:

- `runningColor` / other state colors are Attributes;
- `state` is a semantic Property;
- changing the public contract does not create state-specific Pump component types.

## SCADA Inspector

For a selected component instance the Inspector now renders:

```text
组件配置 · Attributes
    ↓ authored edit
SceneNode.attributes

运行属性 · Properties
    ↓ authored fallback edit
SceneNode.propertyFallbacks
    ↓ optional bindable-only binding
SceneNode.bindings
```

Binding controls are generated only from `definition.properties[key].bindable`.
There is no Attribute binding path in this authoring surface.

## Boundary deliberately not crossed

M9A2 is an authoring-authority slice only.

It does **not** claim that authored Attributes already affect runtime rendering. The current Renderer / Action compatibility API still consumes the Property-side snapshot only. Visual Rules also remain Property-triggered in the current runtime.

Those runtime boundaries are M9B1 work:

- resolved authored Attribute snapshot supplied to renderer/private visual logic;
- one effective Property snapshot retained for Renderer and Action handlers;
- runtime telemetry/derived updates remain unable to mutate Attributes;
- component-private visual rules can read explicit Attribute and Property namespaces.

## Deterministic acceptance

`scripts/check-m9a2-authoring-authority.ts` guards the authoring contract:

- Pump `runningColor` is an Attribute, not a Property;
- Pump `state` remains a bindable Property;
- Component Workbench has separate Attribute / Property contract surfaces;
- the Attribute editor contains no `bindable` authority;
- SCADA Inspector exposes separate Attribute / Property groups;
- Attribute edits target `node.attributes` only;
- Property fallback edits target `node.propertyFallbacks` only;
- binding authority checks only `definition.properties[key].bindable`.

Full CI Build + runtime/model checks + Lint remains the merge gate.

## Next gate

After this slice merges, proceed to **M9B1 Runtime Attribute / Property authority split**. Do not add further schema aliases or Inspector-only workarounds before fixing the runtime context itself.
