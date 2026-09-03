# M9B2 — Package / Scene compatibility + end-to-end acceptance

Status: **accepted · 2026-09-03**.

Architecture authority: `docs/architecture/component-attributes-properties.md`.

Depends on accepted M9B1 runtime authority from PR #120.

## Goal

Prove that the accepted Attribute / Property authority split survives every accepted M7/M8 distribution and standalone-runtime boundary without introducing a flattened compatibility surface.

## Representative portable component

`starter.process-valve` is the representative generic industrial component:

```text
Attributes
├─ closedColor
├─ openColor
└─ faultColor

Property
└─ state = closed | open | fault
```

`state` remains the bindable runtime semantic Property. Presentation colors are authored Attributes. Private Visual Rules select authored color through an explicit Attribute `valueSource` while rule activation remains Property-driven.

## Deterministic package / Scene / runtime proof

`scripts/check-m9b2-package-scene-e2e.ts` proves:

```text
component package v2
    ↓ serialize / parse
canonical Scene v8
    ↓
SCADA Work Package
    ↓ serialize / parse
standalone runtime
    ↓
Attribute snapshot + effective Property snapshot
    ↓
private Visual Rule
    ↓
authored presentation color
```

The deterministic path verifies:

- distributable package v2 preserves Attribute / Property contract authority;
- Scene v8 resolves Attribute defaults while preserving an instance-authored non-default override;
- Scene stores `attributes` independently from `propertyFallbacks` and does not regain legacy `props` authority;
- SCADA Work Package round-trip preserves both authored namespaces and exact portable dependency closure;
- standalone runtime exposes immutable authored Attributes separately from effective Properties;
- persisted semantics derive Property state without mutating authored Attributes or persisted Property fallback state;
- private visual evaluation combines derived runtime state with authored static presentation.

## Browser transfer proof

`pages-component-package-transfer-smoke.mjs` proves a ready local component can explicitly export/import through a fresh browser as current package v2 while preserving a non-default Attribute definition and a bindable Property definition in separate namespaces.

`pages-scada-work-package-transfer-smoke.mjs` proves:

- `starter.process-valve` enters the work artifact as a v2 Attribute / Property-aware dependency;
- the persisted Scene v8 instance carries `Attribute.openColor = #7c3aed` separately from `propertyFallbacks.state`;
- explicit browser work export and fresh-browser import preserve both namespaces and dependency authority;
- same-type dependency collision rejection remains fail-closed without repository mutation.

## Standalone deployed proof

The final deployed fixture authors:

```text
Attribute.openColor = #7c3aed
Property fallback state = closed
Persisted semantic state = open
```

The standalone runtime restores canonical semantics and derives effective `Property.state = open` while leaving the authored Attribute and Property fallback unchanged. The process-valve private Visual Rule then reads authored `Attribute.openColor` and renders the valve body purple.

The same smoke also verifies:

- dependency-complete direct work-package load;
- self-contained portable visual resource closure;
- no Studio authoring chrome;
- no Studio IndexedDB initialization or hidden dependency install.

## Acceptance history

PR #121 implemented M9B2. Its deterministic and PR-CI gates passed before merge.

The first deployed Pages Browser Smoke #208 passed the three M9-critical fresh-browser paths — component transfer, work transfer and standalone purple proof — then failed only in the final pre-M9 reusable starter-package smoke because that older script still asserted component package v1.

PR #122 repaired that stale acceptance-harness assertion to package v2 and strengthened it to verify explicit Attribute / Property namespaces. No runtime or package implementation changed in PR #122.

## Final acceptance evidence

Final accepted revision:

`main@1584337ab620bed4a611b22257c85c1774548d60`

Final exact-main evidence:

- main CI #892 (`33733268754`) passed
- Deploy GitHub Pages #258 (`33733268872`) passed
- Pages Browser Smoke #209 (`33733329792`) passed

Pages Browser Smoke #209 explicitly passed:

- v2 component browser export/import with separated Attribute / Property authority;
- Scene v8 SCADA work browser export/import with `attributes` / `propertyFallbacks` separation;
- fresh-browser standalone canonical semantics deriving `Property.state: closed → open` while preserving authored purple `Attribute.openColor`;
- purple Visual Rule rendering from the explicit Attribute namespace;
- reusable starter package deployment/import/persistence/palette activation using v2 packages with explicit Attribute / Property namespaces.

## Boundary not reopened

M9B2 does not add:

- flattened `props` runtime compatibility;
- Attribute binding;
- protocol-specific fields;
- hidden package installation;
- standalone authoring persistence;
- new runtime authority layers.

The slice is compatibility/end-to-end proof only.

Closeout record: `docs/progress/m9-closeout.md`.