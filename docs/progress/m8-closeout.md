# M8 closeout — Portable SCADA Work + Standalone Runtime

Status: **accepted · 2026-09-02**

## Review scope

This is the final closeout review for the M8 product claim:

```text
saved SCADA work
+ required portable dependencies
    ↓
dependency-complete work artifact
    ↓ explicit browser transfer
fresh browser
    ↓ direct standalone load
read-only runnable SCADA surface
```

The review asks whether that end-to-end claim is now truthful, not whether M8 has accumulated enough implementation slices.

## Accepted gates

All M8 gates are now individually accepted:

- M8A1 — Registry-scoped Scene validation
- M8A2 — Portable SCADA work package codec
- M8A3 — Explicit browser SCADA work package transfer
- M8B1 — Standalone/read-only runtime shell
- M8A4 — Portable visual resource closure
- M8B2 — Standalone canonical semantic parity

The earlier `docs/progress/m8-closeout-review.md` correctly blocked M8 after M8B1 because two end-to-end gaps remained. Both demonstrated blockers are now resolved.

## Resolved blocker 1 — portable visual resource closure

The old problem was:

```text
component-type dependency closure
≠
visual-resource closure
```

A distributable SVG/Image layer could previously reference a host-relative resource that did not exist in a fresh browser.

M8A4 established the accepted portable boundary:

- distributable SVG/Image resources must be self-contained accepted `data:image/...` refs
- relative/root-relative/`http(s)`/`blob:`/non-image refs fail closed
- local authoring may retain unresolved/local refs until explicit distribution
- package version 1 remains sufficient because the artifact shape did not change

The deployed M8A4/M8B2 standalone smoke renders a distinctive embedded SVG/Image resource in a fresh browser without external asset installation or hidden network dependency.

Therefore the phrase **dependency-complete work artifact** is now justified for the accepted M8 portable component boundary.

## Resolved blocker 2 — standalone canonical Scene semantic parity

The old problem was:

```text
standalone render
≠
canonical Scene semantic execution
```

A Scene v7 package could carry valid persisted `scadaSemantics`, load successfully, and have those semantics silently ignored.

M8B2 now uses the accepted canonical path:

```text
PersistedScadaSemantics
    ↓ restoreScadaSemanticPlan
ScadaDslSemanticPlan
    ↓ compileScadaDslRuntime
ScadaDslCompiledRuntime
    ↓ package runtime activation
attachPreviewScadaSemantics
```

The package-owned runtime session:

- restores/compiles every non-null semantic program
- attaches only after `PreviewRuntime` activation
- owns deterministic reverse-order disposal
- injects RuntimeDataSource, primary-device resolution and outbound action dispatch as explicit host capabilities
- fails closed when a semantic program requires a mandatory unavailable host capability
- does not infer MQTT/WebSocket/HTTP/vendor transport

Scene v7 parsing continues to validate persisted semantic references against the component contract before execution.

The deployed Pages fixture proves authored `process-valve.state=closed` is changed by persisted canonical semantics to effective runtime `state=open`, which then activates the existing component-private green visual rule.

## End-to-end acceptance evidence

Final M8 accepted revision:

`main@b967c0f515e3b4e52a4ecab5c56e275f1a63c6ea`

M8B2 final evidence:

- PR #110
- final PR head `2d1328a637d9acafc3d9d5806c39b2b0e315981f`
- PR CI #770 (`33589416945`) passed
- main CI #771 (`33591388326`) passed
- Deploy GitHub Pages #245 (`33591388105`) passed
- Pages Browser Smoke #196 (`33591427942`) passed

The #196 deployed run also re-passed the existing component-authoring, animation, pointer, geometry, component-package transfer, SCADA work-package transfer and reusable starter-package browser regressions.

The standalone smoke explicitly proved all of these in one fresh-browser path:

```text
.scada-work.json
    ↓ exact portable dependency closure
self-contained SVG/Image resource renders
    ↓
canonical Scene v7 semantics restored / compiled / attached
    ↓
authored valve state=closed → effective runtime state=open
    ↓
existing Visual Rule renders green
    ↓
no authoring chrome
no Studio IndexedDB initialization
```

## Explicit non-blockers

M8 does not need to invent or reopen these concerns in order to close:

- concrete MQTT/WebSocket/HTTP/SSE/vendor transport — deliberately deferred by M7B2 until a real target exists
- production publication-backend provisioning — separately deferred
- automatic work hosting/publication — not part of the accepted explicit file-transfer/standalone product path
- portable executable user component Actions/Events — current runnable portable package gate intentionally rejects them
- `implementationDraft` execution — remains inert by design
- trusted built-in/native component packaging — built-ins remain explicit host capabilities
- runtime data-source configuration inside the work artifact — runtime adapters are host capabilities rather than portable Scene authority
- Studio persistence from standalone mode — absence is desired and deployed-proven
- editor mock telemetry in standalone mode — absence is desired and deterministic-proven
- broad asset-manager/media-library UX or a package-v2 resource table — no demonstrated M8 requirement remains for them

These may become future requirements when concrete product/integration needs justify them; they are not hidden M8 blockers.

## Closeout decision

**Close M8.**

The original M8 product claim is now covered end to end and no further demonstrated portability/runtime blocker was found in the final review.

Do **not** create M8B3 merely to continue milestone numbering.

The next architecture milestone is the already accepted Component Attribute / Property authority split:

**M9 — Component Attribute / Property Authority Split**

Architecture authority:

`docs/architecture/component-attributes-properties.md`

M9 should begin with a deliberate versioned schema/SDK and legacy-classification migration gate rather than scattered field renames.
