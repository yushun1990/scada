# M8 closeout review — Portable SCADA Work + Standalone Runtime

Status: **closeout blocked · 2026-08-31**

## Review scope

This review was performed after M8B1 merged and its deployed acceptance smoke passed.

The review does not ask whether M8 has accumulated enough code. It checks the original M8 product claim:

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

## Accepted evidence before closeout

All planned implementation gates through M8B1 are individually accepted:

- M8A1 — registry-scoped Scene validation
- M8A2 — versioned SCADA work package with exact component-type dependency closure
- M8A3 — explicit browser export/import with atomic persistence and fresh-browser dependency activation
- M8B1 — storage-independent package-scoped standalone runtime shell

M8B1 final evidence:

- PR #107
- final PR head `ab82cb3b8692393bd36f403d6c2b1cefe0cc6323`
- merged revision `main@9a1a0f9ac2da157bc6b496e0c05c905196a3f548`
- main CI #759 (`33392597346`) passed
- Deploy GitHub Pages #240 (`33392597356`) passed
- Pages Browser Smoke #191 (`33392662848`) passed

Therefore the review does **not** reopen M8B1.

## Closeout finding 1 — portable visual resource closure is incomplete

Severity: **closeout blocker**

M7A1 explicitly deferred external asset-tree bundling. That deferred boundary is still observable in the current component model:

- distributable component packages contain `definition`, `visual` and inert `implementationDraft`, but no resource payload/table
- SVG/Image visual layers persist a free-form string `assetRef`
- visual validation checks only that `assetRef` is a string
- the Component Workbench explicitly says it currently saves only `assetRef`; resource upload/management remains future work
- the composite renderer resolves `assetRef` directly through `window.Image`

Consequently this is currently a valid distributable component shape in principle:

```text
image layer
assetRef = assets/vendor-logo.png
```

Embedding that component package into `.scada-work.json` satisfies M8A2's **component-type** dependency closure, but a fresh runtime does not possess `assets/vendor-logo.png`. The package can therefore validate and transfer while its visual resource is missing.

The existing M7/M8 browser proofs use vector-only starter packages, so they do not exercise this boundary.

### Required closeout repair

Portable distribution must become honest about external visual resources before M8 can claim dependency-complete portability.

The minimum acceptable repair should remain narrow. It may, for example, establish a self-contained allowed resource form and fail closed for unresolved external `assetRef` values, rather than designing a broad asset manager immediately.

What matters for closeout is the invariant:

> A component accepted as portable must not depend on an undeclared host-relative visual resource.

A larger asset catalog/upload UX is not required for this closeout repair.

## Closeout finding 2 — standalone runtime silently ignores canonical Scene v7 semantics

Severity: **closeout blocker**

Scene v7 established `PersistedScadaSemantics` as the canonical persistence authority for SCADA Value / Behavior / Interaction semantics.

The accepted restoration path is:

```text
PersistedScadaSemantics
    ↓ restoreScadaSemanticPlan
semantic plan
    ↓ compileScadaDslRuntime
compiled runtime
    ↓ attachPreviewScadaSemantics
host-owned runtime state/effects
```

M6.5.9C intentionally delivered `attachPreviewScadaSemantics()` as a narrow per-component runtime bridge and explicitly deferred broad scene-wide orchestration.

M8B1 currently:

- validates the Scene/package
- creates the package-scoped registry
- creates `new PreviewRuntime([], registry)`
- calls `runtime.acquire(scene)` from the standalone renderer

It does **not** currently restore/compile/attach non-null `node.scadaSemantics`.

Both M8B1 deterministic and deployed browser fixtures use `scadaSemantics: null`, so the accepted B1 tests prove package-scoped rendering but not canonical semantic execution.

This means a valid Scene v7 package may carry accepted persisted semantics, load successfully in standalone mode, and then silently render without those semantics. That is worse than a deliberate unsupported error because it weakens the accepted fail-closed semantic model.

### Required closeout repair

Standalone runtime startup needs a scene-level semantic orchestration boundary that:

- restores and compiles every non-null persisted semantic program against the package-scoped registry
- attaches semantic sessions only after the package-scoped runtime is active
- owns deterministic disposal
- keeps real data sources and `ScadaDeviceActionDispatcher` as explicit host capabilities rather than inventing a protocol
- fails closed when a semantic program requires an unavailable mandatory host capability instead of silently ignoring the program
- adds deterministic coverage with non-null persisted semantics
- adds the narrowest useful browser proof that standalone rendering observes canonical semantic effects

This does **not** require choosing MQTT/WebSocket/HTTP or reopening M7B2.

Operational interaction hit-testing should be reviewed inside the same repair: `read-only` means no authoring mutation, not automatically that all runtime-facing component interaction must remain `listening={false}` forever.

## Findings that are not blockers

The review explicitly does **not** treat these as M8 failures:

- no concrete MQTT/WebSocket/HTTP/SSE/vendor transport — M7B2 deliberately defers selection until a real target exists
- no automatic work hosting/publication — not part of the accepted local file-transfer/standalone boundary
- portable executable component Actions/Events remain unsupported — current portable execution gate intentionally rejects them
- `implementationDraft` remains inert — accepted invariant
- trusted built-in/native components remain host capabilities rather than embedded dependencies — accepted artifact design
- standalone does not write to Studio IndexedDB — desired behavior, now proven by deployed smoke
- standalone starts without editor mock telemetry — desired behavior, now proven by deterministic/runtime construction checks

## Closeout decision

**Do not close M8 yet.**

The planned A1/A2/A3/B1 gates are individually accepted, but the end-to-end milestone claim is not yet strong enough because:

```text
component dependency closure ≠ visual resource closure
and
standalone render ≠ canonical Scene semantic execution
```

These are demonstrated missing portability/runtime requirements, so additional M8 work is justified by the roadmap's own closeout rule rather than by milestone numbering.

## Recommended minimum sequence

1. **Portable visual resource closure**
   - define the self-contained portable resource boundary
   - reject undeclared host-relative assets
   - extend deterministic/browser transfer proof with an SVG/Image-bearing portable component
2. **Standalone canonical semantic parity**
   - scene-wide restore/compile/attach lifecycle
   - explicit host capability injection/fail-closed behavior
   - non-null semantic deterministic + deployed runtime proof
3. repeat M8 closeout review

Do not reopen concrete production transport during either repair.

## Roadmap implication

The authoritative roadmap should now treat:

```text
M8B1 standalone/read-only shell          accepted
M8 closeout                              BLOCKED
```

and keep the next implementation gate on the first demonstrated closeout repair rather than marking M8 complete.