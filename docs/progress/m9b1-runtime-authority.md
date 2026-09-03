# M9B1 — Runtime Attribute / Property authority split

Status: **implemented; acceptance candidate in PR #120**.

Architecture authority: `docs/architecture/component-attributes-properties.md`.

## Goal

Carry the M9A1/M9A2 authored/runtime authority split through Preview, Renderer, Component Actions and component-private visual evaluation without flattening Attributes back into the Property namespace.

## Accepted runtime boundary

The runtime contract is now explicit:

```text
Authored SceneNode.attributes
        ↓
ComponentAttributeStore
        ↓ immutable authored Attribute snapshot
        ├─ Renderer
        ├─ Component Action context
        └─ component-private visual evaluation

Authored Property fallbacks
+ external bindings
+ derived / DSL updates
        ↓
ComponentPropertyStore
        ↓ one effective Property snapshot
        ├─ Renderer
        ├─ Component Action context
        └─ component-private visual evaluation
```

Attributes remain authored configuration. Runtime telemetry and derived propagation have no write path into the Attribute store.

## Renderer / Action authority

`ComponentRendererProps` and `ComponentActionHandlerContext` expose separate `attributes` and `properties` namespaces.

The previous flattened `props` runtime surface is no longer the accepted execution contract.

Preview owns both host snapshots:

- `ComponentAttributeStore` holds the authored Attribute snapshot;
- `ComponentPropertyStore` holds the settled effective Property snapshot;
- Renderer and Component Action handlers observe those same host-owned snapshots;
- Property overrides, bindings and derived updates never mutate the Attribute snapshot.

Standalone runtime and Scene rendering use the same explicit renderer boundary.

## Component-private visual authority

Visual Rules now evaluate against an explicit context:

```text
{
  attributes,
  properties,
}
```

A rule target value may remain literal or explicitly source its value from either namespace. Attribute and Property reads therefore remain distinguishable at the private visual boundary instead of being merged into a generic bag.

Validation fails closed when a rule references a missing Attribute or Property source.

Animation activation remains Property-driven in the accepted first slice. This preserves the current semantic model where runtime activation is dynamic Property state; authored Attributes configure presentation rather than acting as telemetry/event state.

## Pump end-to-end proof

The built-in Pump is the representative runtime proof.

Its public contract remains:

```text
Property.state
+ Attribute.stoppedColor
+ Attribute.runningColor
+ Attribute.manualColor
+ Attribute.warningColor
+ Attribute.alarmColor
```

The renderer resolves the current semantic `state` to the corresponding authored color Attribute. The visual node receives the resolved tint rather than choosing from a hard-coded runtime palette.

This proves that authored presentation configuration can change runtime appearance without creating state/color-specific component types and without making color a bindable Property.

## Compatibility fixture migration

Runtime/model fixtures that called the old Property-only Visual Rule resolver or Action context were migrated to the explicit namespace contract.

Intentional legacy persistence inputs remain intact where they are testing migration, including retained Scene v6/v7 `props` inputs. The migration fixtures were not rewritten merely to remove the word `props`.

## Deterministic acceptance

`scripts/check-m9b1-runtime-authority.ts` proves:

- Visual Rules consume explicit Attribute / Property namespaces;
- Attribute-backed visual target values resolve authored instance configuration;
- Property-backed visual target values resolve effective runtime state;
- missing visual sources fail validation;
- Pump presentation color resolves from authored Attributes rather than a hard-coded runtime palette.

`scripts/check-preview-component-state.ts` proves:

- authored Attributes and effective Properties are independent immutable host snapshots;
- runtime/derived Property updates cannot mutate Attributes;
- Renderer and Component Action consumers share the settled host authorities.

Existing Preview/SCADA and typed Action/Event integration fixtures also verify that the Property snapshot remains the same deterministic truth after the context migration.

## Verification

PR #120 head `e30355047b8b4b66606410872fb3ceb56914456b` passed CI #878 (`33712378784`):

- Build ✅
- Runtime/model checks ✅
- M9B1 runtime authority guard ✅
- Preview Component authority guard ✅
- Preview SCADA integration ✅
- Typed Action/Event integration ✅
- Reusable portable component regression ✅
- Lint ✅
- publication-api ✅

## Boundary not claimed by M9B1

M9B1 does not close the full M9 compatibility story.

The next gate is **M9B2 Package / Scene compatibility + end-to-end acceptance**, which must prove that the same authority split survives:

- component package export/import;
- SCADA work package export/import;
- registry-scoped Scene migration/validation;
- standalone direct package load;
- canonical persisted semantics;
- fresh-browser / Pages runtime proof.

Do not reopen a flattened runtime compatibility surface during M9B2. Distribution/runtime compatibility must preserve the explicit Attribute / Property authority established here.
