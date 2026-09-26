# 3D Scene Editor readiness review

- Date: 2026-09-25
- Status: reviewed; remediation findings remain open
- Review baseline: `main@84d522c` (PR #197), with follow-up comparison against
  PR #198 head `5eb3c9d`

## Decision

The repository has a sound 2D scene, component-contract, runtime-semantics and
portable-work foundation, but it is **not ready for direct 3D feature work**.

3D must be introduced as a dimension-specific scene and presentation adapter
that shares the existing runtime semantics. It must not be implemented by
adding Three.js branches to the current Konva renderer, adding nullable 3D
fields to Scene v8, or opening a second runtime authority.

Before M10 product implementation begins, the repository must close the R0
remediation gate and accept the M10A architecture/technology evidence defined
by the delivery governance and acceptance matrix.

## Review scope and method

The review covered:

- the authoritative roadmap and accepted M6–M9 boundaries;
- Scene, component, visual, runtime, persistence and work-package schemas;
- editor and renderer ownership;
- component authoring changes introduced by PR #197 and retained by PR #198;
- build/lint output and bundle shape;
- the missing contracts required for binary 3D resources and standalone use;
- a target design and staged delivery model for a 3D editor.

Local build and lint passed during the review, with warnings and a Vite
large-chunk warning. That result proves only that the inspected revision builds;
it is not security, browser, migration, performance or architectural
acceptance.

## Foundations to preserve

The following are valid foundations and should be extended rather than
replaced:

- the public `Attributes + Properties + Actions + Events + Anchors` component
  vocabulary;
- the authored Attribute/runtime Property authority split;
- one effective runtime Property snapshot for rendering and Actions;
- canonical persisted semantics and the existing DSL/runtime compilation path;
- explicit data-source and device/platform effect host boundaries;
- command/history and local-first repository abstractions;
- package-scoped standalone dependency/runtime isolation;
- Scene v8 as the accepted 2D scene document;
- Konva as the existing 2D presentation implementation.

## Finding register

| ID | Severity | Finding | Required disposition | Gate |
| --- | --- | --- | --- | --- |
| R3D-001 | P0 | Public user Action definitions persist executable `implementation` source and the Workbench runs it with `new Function`. | Remove executable source from the portable public contract and remove the unrestricted execution path; migrate or reject legacy input explicitly. | R0 |
| R3D-002 | P0 | Workbench method authoring claims runnable capability while ready user-component activation rejects every component declaring Actions/Events. | Restore one truthful capability boundary and add authoring/package/activation consistency tests. | R0 |
| R3D-003 | P0 | SVG theme binding automatically creates public executable Actions, which can make the resulting component fail activation. | Replace this with declarative private visual behavior or another already accepted host-owned path. | R0 |
| R3D-004 | P1 | No accepted 3D Scene, component-presentation, resource, package or browser acceptance contract exists. | Accept the M10 design and prove the M10A spike before product implementation. | M10A |
| R3D-005 | P1 | Component registration and package validation require a concrete Konva renderer; work-package validation uses a fake renderer cast. | Split contract validation/registry from dimension-specific presentation registration. | M10C |
| R3D-006 | P1 | Persistence and distribution store JSON documents but provide no content-addressed binary resource authority. | Add an AssetRepository and resource-closed package model before persisted GLB authoring. | M10B |
| R3D-007 | P1 | `SceneRenderer` and `ScadaEditorPage` own too many application, gesture and rendering concerns; the main bundle is already oversized. | Extract the shared editor/session boundary and load the 3D adapter as a separate route chunk. | M10C/M10D |
| R3D-008 | P1 | New checks can exist outside CI and at least one check copies algorithms instead of exercising production exports. | Require production-importing deterministic tests and explicit CI registration. | R0 and every gate |
| R3D-009 | P2 | Current/proposed/implemented status is inconsistent across PLAN, design notes and implementation. | Use the authority order and status protocol established by this governance change. | R0 |

## P0 evidence

This section records the inspected 2026-09-25 baseline, not the current source.
R3D-001 remediation is `implemented` by PR #200 at
`d591f348512b0ce9639372e0267ad826b664fb17`; R3D-002/003 remediation is
`implemented` by PR #201 at `79a89d581997134e1eb8e4a8f1247c7861b8aff5`.
R3D-008/009 are tracked in the [R0.3 handoff](../progress/m10-r0.3-test-authority.md).
These implementation records do not close R0: the dedicated closeout must
reconcile all five findings with exact-candidate acceptance evidence.

### R3D-001 — unrestricted authored execution

`src/component-system/definition.ts` adds `implementation?: string` to
`ComponentActionDefinition`. The implementation is cloned and distributed with
the component definition, while `src/component-system/validation.ts` validates
the Action signature but establishes no accepted execution or capability
boundary for that implementation.

`src/features/component-library/ComponentLayerMethodInspector.tsx` constructs
and executes the authored source with `new Function`. The provided `$self`,
`layers` and `$emit` variables are convenience arguments, not a sandbox: source
executed this way retains ambient browser authority such as `globalThis`,
network APIs and timers.

This conflicts with the existing PLAN rules that portable user Actions/Events
have no accepted executable contract, `implementationDraft` is inert, and
unrestricted JavaScript is a non-goal.

Required R0 outcome:

- no current portable definition/package field is executable merely because it
  contains source text;
- no component-authoring preview runs user source with `eval` or `new Function`;
- legacy persisted `implementation` input has an explicit reject-or-strip
  migration with a diagnostic;
- any future controlled-script proposal requires a separate ADR, capability
  model, isolation strategy and standalone-parity acceptance.

### R3D-002 — contradictory activation contract

`src/features/component-library/runtime-activation-core.ts` deliberately rejects
ready user components whose public contract contains Actions or Events because
there is no accepted executable implementation contract. The Workbench,
however, exposes and runs implementations for those public Actions.

The two surfaces therefore disagree about whether the component is runnable.
R0 must make authoring, validation, packaging, activation, preview and
standalone behavior agree.

### R3D-003 — theme generation creates its own activation failure

`generateComponentSvgThemeBindings` in
`src/component-system/managedSvgTheme.ts` adds several public Actions carrying
implementation source. Those Actions then trigger the activation rejection
described above.

SVG theme state is presentation behavior and should remain a declarative
Property/Visual Rule concern. It must not manufacture a public executable API
as an incidental side effect of visual authoring.

## Structural evidence

### Scene and visual models are two-dimensional

Scene v8 persists `x`, `y`, `width`, `height` and a scalar rotation. Component
anchors use normalized 2D positions/outward vectors and component size uses
only width/height. The visual model is a 2D group/svg/image/vector/text layer
tree.

These are valid 2D contracts. Adding optional `z`, `depth`, camera and material
fields throughout them would weaken validation and couple the accepted 2D model
to an unrelated spatial representation.

### Validation is renderer-coupled

`ComponentRegistration` contains one renderer typed around Konva groups.
`src/features/scada-works/scada-work-package.ts` creates a
`validationOnlyRenderer` cast solely to build a registry for validation. This
shows that contract identity/validation and presentation realization currently
have the wrong dependency direction.

### Persistence cannot own model resources

Repository records persist a string document, and IndexedDB has no binary
asset store. Existing component distribution accepts self-contained image data
URLs, which is unsuitable for large GLB and texture resources. 3D authoring
must not start by embedding arbitrary binary data in Scene JSON.

### Renderer/editor ownership is already concentrated

At the review baseline:

- `src/renderer/SceneRenderer.tsx` is approximately 2,700 lines;
- `src/features/scada-editor/ScadaEditorPage.tsx` is approximately 1,400 lines;
- the main production chunk is approximately 903 KB minified / 294 KB gzip
  (`main@84d522c`), and the compared PR head is approximately 907 KB / 296 KB;
  both produce Vite's large-chunk warning;
- `StandaloneRuntimePage` is imported eagerly from the app entry.

The 3D implementation must therefore be a lazy adapter behind a shared
application/session boundary, not more dimension checks inside these files.

## Correct target boundary

```text
Scene2D v8 ─┐
            ├─ RuntimeSceneProjection ─ one semantic runtime
Scene3D v1 ─┘                         ├─ Konva 2D presentation
                                     └─ Three/R3F 3D presentation

Work package manifest
├─ dimensioned Scene document
├─ exact component dependency closure
└─ content-addressed binary resource closure
```

The normative design is recorded in
`docs/architecture/3d-scene-editor.md`. The staged correction and delivery
rules are recorded in `docs/governance/m10-3d-delivery-governance.md`; required
evidence is recorded in `docs/acceptance/m10-3d-acceptance-matrix.md`.

## Review decision by area

| Area | Decision |
| --- | --- |
| Scene v8 and 2D geometry | Keep as the 2D authority. |
| Attribute/Property/runtime semantics | Reuse without a 3D fork. |
| Konva renderer | Keep only inside the 2D adapter. |
| Component registry | Refactor into contract and presentation registries. |
| Component package | Add representation-specific presentations through a versioned migration. |
| Anchors | Separate common anchor identity/role from 2D/3D geometry. |
| Storage | Add content-addressed Blob resources. |
| Work package | Version to a manifest plus exact resources; keep legacy 2D parsing. |
| User JavaScript | Remove from current portable execution; reconsider only through a separate accepted design. |
| Three/R3F | Evaluate in M10A, then keep in a lazy 3D adapter. |

## Conditions for starting 3D product implementation

All of the following are required:

1. R3D-001 through R3D-003 are closed with tests.
2. PLAN and documentation truthfully describe the surviving component
   capability boundary.
3. The M10A schema, resource threat model and renderer spike are accepted.
4. A fixed reference scene and target environments establish measurable bundle,
   load, interaction and memory baselines.
5. The next stage is explicitly marked active in PLAN.

Installing Three.js, creating a production 3D route, or persisting Scene3D data
before these conditions is implementation ahead of the accepted gate.
