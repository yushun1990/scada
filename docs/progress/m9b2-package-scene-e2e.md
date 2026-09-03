# M9B2 — Package / Scene compatibility + end-to-end acceptance

Status: **implemented; acceptance candidate in PR #121; deployed Pages smoke pending after merge**.

Architecture authority: `docs/architecture/component-attributes-properties.md`.

Depends on accepted M9B1 runtime authority from PR #120.

## Goal

Prove that the accepted Attribute / Property authority split survives every accepted M7/M8 distribution and standalone-runtime boundary without introducing a flattened compatibility surface.

## Representative portable component

`starter.process-valve` is the M9B2 representative generic industrial component.

Public contract:

```text
Attributes
├─ closedColor
├─ openColor
└─ faultColor

Property
└─ state = closed | open | fault
```

`state` remains the bindable runtime semantic Property.
Presentation colors are authored Attributes.

Private Visual Rules select the authored color through an explicit Attribute `valueSource` while rule activation remains Property-driven.

No state/color-specific component types are introduced.

## Distribution boundary proof

The portable component package remains v2 and canonical round-trip serialization preserves:

- Attribute definitions and defaults;
- bindable Property definitions;
- Attribute-backed Visual Rule source metadata;
- existing Anchors and declarative animations.

The generic reusable-component activation path still accepts and runs the package without component-specific runtime code.

## Canonical Scene v8 proof

The M9B2 fixture authors an instance override:

```text
Attribute.openColor = #7c3aed
Property fallback state = closed
```

Canonical Scene v8 normalization resolves the other Attribute defaults while preserving the instance override:

```text
closedColor = #64748b
openColor   = #7c3aed
faultColor  = #ef4444
```

The canonical node contains `attributes` and `propertyFallbacks` separately and does not regain legacy `props` authority.

## SCADA work package proof

SCADA Work Package v1 serialization / parsing preserves:

- the resolved authored Attribute snapshot;
- the authored Property fallback independently;
- the exact portable dependency closure;
- canonical persisted SCADA semantics.

No Studio installation or registry mutation is required merely to make the artifact runnable.

## Browser transfer proof

The deployed browser transfer smoke paths are now explicitly Attribute / Property-aware instead of merely reusing the pre-M9 M7/M8 transfer assertions.

`pages-component-package-transfer-smoke.mjs` now proves:

- browser component export emits current distributable component package v2 rather than the legacy v1 migration input;
- a non-default authored Attribute definition and a bindable Property definition survive explicit file export;
- fresh-browser import preserves the two public namespaces independently;
- the imported ready component activates through the normal component registry/palette without flattening Attribute and Property authority.

`pages-scada-work-package-transfer-smoke.mjs` now proves:

- `starter.process-valve` enters the work artifact as a v2 Attribute / Property-aware dependency;
- the persisted Scene v8 instance carries `Attribute.openColor = #7c3aed` separately from `propertyFallbacks.state = open`;
- explicit browser work export preserves both Scene instance namespaces and the dependency contract;
- fresh-browser work import persists the Scene and missing dependency with the same separation;
- same-type dependency collision rejection still fails closed without repository mutation.

These checks close the browser-transfer coverage gap found during PR #121 audit while keeping the final deployed standalone proof as the M9 closeout gate.

## Standalone runtime proof

Persisted Scene semantics derive:

```text
Property.state: closed → open
```

Standalone runtime then exposes:

- immutable authored Attribute snapshot with `openColor = #7c3aed`;
- immutable effective Property snapshot with `state = open`;
- unchanged persisted authored Property fallback `state = closed`.

Private Visual Rule evaluation receives those explicit namespaces and renders the valve body using the authored purple `openColor` while rotating the open-state handle.

This proves runtime Property derivation does not mutate authored Attributes and that authored presentation survives package/work/standalone boundaries.

## Deterministic gate

`scripts/check-m9b2-package-scene-e2e.ts` proves the complete in-memory artifact/runtime chain:

```text
component package
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

Existing reusable-component checks were also strengthened so `starter.process-valve` proves non-default authored color values drive its Visual Rules.

Final PR CI #888 (`33727739029`) passed on head `c8ad50119869c260cafbaa1df1bde89e72c10287` before this evidence-only documentation update:

- Build ✅
- Runtime/model checks ✅
- M9B2 package/Scene end-to-end gate ✅
- reusable portable component regression ✅
- browser work-transfer script syntax check ✅
- Lint ✅
- publication-api ✅

## Fresh-browser / Pages proof

`pages-standalone-runtime-smoke.mjs` now uses a canonical Scene v8 work artifact and authors:

```text
Attribute.openColor = #7c3aed
Property fallback state = closed
Persisted semantic state = open
```

The browser smoke requires the deployed canvas to contain the authored purple valve body rather than the package default green. Therefore the deployed proof cannot pass through the previous Property-only / hard-coded-color behavior.

It still verifies:

- dependency-complete direct work-package load;
- self-contained portable SVG/Image resource closure;
- no Studio authoring chrome;
- no Studio IndexedDB initialization or hidden install.

The Pages script is syntax-checked in PR CI. Actual fresh-browser execution against deployed `main` remains the final post-merge acceptance evidence before M9 closeout.

## Boundary not reopened

M9B2 does not add:

- flattened `props` runtime compatibility;
- Attribute binding;
- protocol-specific fields;
- hidden package installation;
- standalone authoring persistence;
- new runtime authority layers.

The slice is compatibility proof only.
