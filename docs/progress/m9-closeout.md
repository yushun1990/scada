# M9 closeout — Component Attribute / Property Authority Split

Status: **accepted · 2026-09-03**

Architecture authority: `docs/architecture/component-attributes-properties.md`.

## Review scope

M9 exists to remove the old conflated public Property authority and make static authored configuration distinct from dynamic runtime semantics across the complete product path:

```text
Component contract
├─ Attributes      authored static configuration
└─ Properties      runtime semantic values / binding targets
        ↓
authoring + persistence
        ↓
package / Scene / work distribution
        ↓
runtime Property derivation
        ↓
component-private presentation using authored Attributes
```

The closeout question is not whether every possible component feature exists. It is whether this authority split is now truthful and preserved across the accepted M7/M8 boundaries.

## Accepted gates

All M9 gates are individually accepted:

- M9A1 — Attribute / Property schema + migration authority
- M9A2 — Component Workbench + SCADA Inspector authority separation
- M9B1 — Runtime Attribute / Property authority split
- M9B2 — Package / Scene compatibility + end-to-end acceptance

No M9B3 is required merely to continue numbering.

## Accepted authority

The final accepted model is:

```text
Attribute
= authored/persisted static presentation or configuration
= not a runtime binding target
= not overwritten by telemetry or runtime propagation

Property
= runtime-capable semantic value/state
= binding target when declared bindable
= one deterministic effective runtime truth
```

Component-private rules and runtime APIs consume these as explicit separate namespaces. They are not flattened back into one `props` object.

## Authoring and persistence proof

M9A1/A2 established and exposed the split:

- `ComponentDefinition.attributes` and `ComponentDefinition.properties` are first-class independent contract namespaces;
- Scene v8 stores instance `attributes` separately from `propertyFallbacks`;
- legacy input is deterministically classified/migrated rather than maintained as a second live authority;
- ambiguous legacy classification fails closed;
- Component Workbench edits Attribute and Property contracts independently;
- SCADA Inspector writes Attribute values only to `SceneNode.attributes`;
- Property fallback edits write only to `SceneNode.propertyFallbacks`;
- binding UI is generated only from bindable Properties;
- DSL/runtime `$self.*` does not expose Attributes as runtime binding targets.

## Runtime proof

M9B1 established the runtime contract:

- telemetry and Value Binding update Properties only;
- Preview/runtime owns an immutable authored Attribute snapshot independently from effective Properties;
- Renderer and Component Actions observe the same effective Property truth;
- Renderer/Action/private Visual Rule paths receive authored Attributes through a separate explicit namespace;
- private Visual Rule target values may source Attributes without making Attributes dynamic runtime state;
- runtime Property updates do not mutate persisted Property fallbacks or authored Attributes.

Accepted M9B1 merge:

`PR #120 → main@9afa0f7fa543e00aa39c88c75b82a5beab4fe964`

## Distribution and standalone proof

PR #121 completed M9B2 and exercised the accepted M7/M8 boundaries:

- distributable component package v2 preserves independent Attribute / Property definitions;
- browser component export/import preserves the two namespaces in a fresh browser;
- canonical Scene v8 preserves `attributes` separately from `propertyFallbacks`;
- SCADA Work Package round-trip preserves both authored authorities and exact dependency closure;
- browser work export/import preserves the same split in a fresh browser;
- package-scoped standalone runtime loads bundled dependencies without Studio installation;
- persisted semantics derive effective Property state without mutating authored Attribute state;
- component-private visual evaluation consumes the two namespaces explicitly.

Representative deployed scenario:

```text
starter.process-valve

Attribute.openColor = #7c3aed   authored purple
Property fallback state = closed
Persisted semantic state = open
        ↓
standalone runtime derives effective Property.state = open
        ↓
private Visual Rule reads Attribute.openColor
        ↓
valve renders purple
```

This proves the component can vary static authored presentation and dynamic runtime state without creating state/color-specific component types.

## Browser acceptance audit and harness repair

The first deployed run after PR #121, Pages Browser Smoke #208, already passed the M9-critical browser chain:

- v2 component package browser export/import ✅
- Scene v8 SCADA work package browser export/import ✅
- standalone authored-purple / derived-open proof ✅

It then failed in the final older reusable starter-package smoke because that pre-M9 script still asserted `packageVersion === 1` while canonical component packages had already migrated to v2.

PR #122 repaired only that stale acceptance harness. It did not change runtime/package implementation. The repaired smoke also checks that deployed starter packages expose explicit `definition.attributes` and `definition.properties` namespaces and do not regain flattened `definition.props` authority.

## Final end-to-end acceptance evidence

Final M9 accepted revision:

`main@1584337ab620bed4a611b22257c85c1774548d60`

Implementation / harness history:

- PR #120 — runtime authority split
- PR #121 — package / Scene / work / standalone M9B2 acceptance implementation
- PR #122 — stale reusable Pages v1 assertion repair only

Final exact-main evidence:

- main CI #892 (`33733268754`) passed
- Deploy GitHub Pages #258 (`33733268872`) passed
- Pages Browser Smoke #209 (`33733329792`) passed

Pages Browser Smoke #209 checked out the exact deployed revision `1584337ab620bed4a611b22257c85c1774548d60` and passed the full deployed sequence, including:

- component authoring/animation regressions;
- Chromium + Firefox pointer regressions;
- SCADA geometry regression;
- v2 component package browser transfer with separated Attribute / Property authority;
- v2 dependency-aware SCADA work browser transfer with Scene v8 `attributes` / `propertyFallbacks` separation;
- standalone canonical semantics deriving `Property.state: closed → open` while preserving `Attribute.openColor = #7c3aed`, rendering purple and avoiding Studio IndexedDB initialization;
- reusable starter package deployment/import/persistence/palette activation with explicit v2 Attribute / Property namespaces.

## Explicit non-blockers

M9 does not need to invent or reopen these concerns to close:

- concrete MQTT/WebSocket/HTTP/SSE/vendor transport — still deferred until a real integration target exists;
- Attribute binding — intentionally rejected by the accepted authority model;
- flattened runtime `props` compatibility — intentionally not a live authority;
- hidden package installation from standalone mode — intentionally absent;
- standalone authoring persistence — intentionally absent;
- portable executable user Actions/Events — separately gated by the accepted portable execution contract;
- production publication-backend deployment — separately deferred;
- broad component marketplace/catalog expansion — not required to prove the authority split.

Future requirements may extend these areas, but they must preserve or deliberately supersede the accepted M9 authority rather than silently reopening it.

## Closeout decision

**Close M9.**

The Attribute / Property authority split is now demonstrated across schema/migration, authoring, persistence, runtime evaluation, component-private visual behavior, component distribution, Scene/work distribution and fresh-browser standalone execution.

No demonstrated M9 blocker remains.

The repository should not invent an M10 implementation slice until a deliberate roadmap review identifies the next product/architecture requirement.