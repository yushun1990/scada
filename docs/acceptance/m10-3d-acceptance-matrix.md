# M10 3D acceptance matrix

- Status: normative acceptance authority when merged
- Date: 2026-09-25
- Governance: `docs/governance/m10-3d-delivery-governance.md`

## Acceptance rule

A gate advances only when every required row for that gate has evidence against
the exact candidate revision. TypeScript compilation or an implementation demo
alone is insufficient.

Evidence must identify:

- exact Git revision;
- command or browser workflow;
- fixture/input used;
- result and retained artifacts where relevant;
- environment for browser, bundle and performance measurements.

If a required lane cannot run, the result is `not verified`, not `passed`.

## Cross-gate baseline

Every production-code gate must preserve:

- `npm run build`;
- `npm run lint`;
- relevant deterministic runtime/model scripts already present in CI;
- Scene v8 parse/save and 2D editor behavior for changed surfaces;
- component package v2 and work-package legacy fixtures until their replacement
  migrations are accepted;
- package-scoped standalone behavior;
- no automatic remote dependency fetching;
- no imported unrestricted JavaScript execution.

Tests must import production code. Reimplementing an algorithm inside a check
script does not satisfy acceptance.

## Gate summary

| Gate | Domain/codec | Runtime compatibility | Security/resource | Browser/UI | Performance/bundle | Closeout artifact |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Required | Required | Required | Targeted component flow | Main bundle reported | R0 closeout |
| M10A | Schema draft fixtures | Spike parity proof | Threat model/negative corpus | Capability spike | Baseline and budgets | M10A decision record |
| M10B | Required and exhaustive | Legacy 2D projection | GLB/resource closure | Import diagnostics only | Storage/parse measurements | M10B progress record |
| M10C | Required | Full M9 parity | Package validation | 2D regression | 2D bundle no material regression | M10C progress record |
| M10D | Required | Property-driven 3D/standalone | No hidden fetch; disposal | Chromium + Firefox read-only flow | Lazy chunk/reference scene | M10D progress record |
| M10E | Command/history | Preview parity | Validated ingest only | Full authoring task flow | Interaction frame budget | M10E progress record |
| M10F | Anchor/connection geometry | Semantics remain separate | Invalid endpoint handling | Reconnect/edit flow | Connection fixture budget | M10F progress record |
| M10G | All current versions | Full packaged parity | Fuzz/soak/offline | Deployed fresh-browser flow | Enforced final budgets | M10 closeout |

## R0 acceptance

### Portable execution boundary

Required deterministic evidence:

- current component definition validation rejects or explicitly migrates a
  persisted Action `implementation` field;
- current package serialization cannot emit executable Action source;
- package import cannot make supplied source executable;
- `implementationDraft` remains inert through save/export/import/activation;
- normal trusted built-in Action handlers still work;
- a static authority check prevents `eval`/`new Function` from reappearing in
  the portable component-authoring execution path.

The implementation should add a production-importing CI check such as
`scripts/check-portable-execution-boundary.ts`; the exact filename is not
authority, its assertions are.

### Capability consistency

Required end-to-end fixture:

```text
author/import a user component
→ add declarative SVG theme behavior
→ mark ready
→ activate in ComponentRegistry
→ place in Scene v8
→ export/import work package
→ run in standalone
→ Property state changes the expected visual presentation
```

The fixture must prove that no public executable Action was silently generated
and that activation diagnostics are empty for the accepted component.

### Documentation and checks

- PLAN, README and active design documents describe the same execution
  boundary;
- checks added by the remediation are registered in CI;
- no check copies the implementation it claims to verify;
- local build/lint and the complete affected M6–M9 model checks pass.

### R0 closeout decision

The closeout record lists R3D-001, R3D-002, R3D-003, R3D-008 and R3D-009 with
exact fixing revisions and evidence. Only that accepted closeout may activate
M10A.

## M10A acceptance

### Schema and architecture proof

- draft WorkContent, Scene3D v1 and Component Package v3 shapes compile in an
  isolated contract/spike area;
- finite-number, quaternion, positive-scale, hierarchy-cycle, duplicate-ID and
  missing-reference cases have fixtures;
- no draft shape adds 3D fields to Scene v8;
- the RuntimeSceneProjection mapping demonstrates one semantic runtime input
  for equivalent 2D and 3D component instances.

### Resource threat model

The decision record names:

- accepted GLB version and MIME/magic handling;
- allowed extensions and decoder dependencies;
- rejection policy for external/network/file/blob references;
- compressed and decoded byte limits;
- node/primitive/accessor/texture limits;
- hash algorithm and verification sequence;
- malformed-input corpus and expected diagnostics.

### Rendering spike

Against a named revision and fixture, prove:

- route-level lazy loading;
- GLB load without hidden network dependencies;
- raycast selection mapped to a stable logical ID;
- translate/rotate/scale controls and input arbitration;
- one effective Property snapshot driving visibility/material/animation;
- explicit disposal after unload;
- unsupported/context-loss error handling;
- Chromium and Firefox capability results.

Spike code is not product acceptance. The closeout must state which parts are
discarded and which decisions will be implemented later.

### Measured baselines

Record on named target hardware/browser:

- 2D initial and route chunk sizes before adding production 3D dependencies;
- 3D lazy-chunk prototype size;
- cold/warm model load time;
- frame-time percentiles for idle, orbit and transform interaction;
- JS heap and renderer resource counts before/after unload;
- context capability matrix.

M10A uses these measurements to set quantitative budgets for M10D–M10G. Until
that point, this matrix intentionally does not invent universal numeric limits.

## M10B acceptance

### Work and Scene codecs

- raw legacy Scene v8 and Work Package v1 deterministically become 2D work;
- current 2D serialization remains canonical and behaviorally unchanged;
- Scene3D v1 round-trips canonical documents;
- malformed transforms, hierarchy cycles, duplicate IDs, missing parents and
  invalid references fail closed with stable diagnostics;
- unknown future versions fail explicitly.

### Transform/hierarchy math

Pure tests cover:

- quaternion normalization and Euler presentation conversion;
- local/world matrix composition;
- world-transform-preserving reparent;
- bounds aggregation;
- anchor local-to-world projection;
- cancellation/rollback after invalid operations.

### AssetRepository and migration

- digest determinism and byte verification;
- duplicate-content deduplication;
- atomic document/resource write and rollback;
- IndexedDB upgrade from the accepted pre-M10 version;
- interrupted/failed upgrade recovery;
- reference and garbage-collection semantics;
- no persisted object URL.

### GLB validation

Negative fixtures include truncated headers, inconsistent lengths, invalid
JSON, out-of-bounds buffer views, external URIs, forbidden extensions,
oversized counts/textures and decompression-growth violations.

None of the codec/repository tests may require React or a GPU renderer.

## M10C acceptance

### Registry separation

- component contract/package validation runs without Konva, Three or dummy
  renderer casts;
- 2D and 3D presentation availability is queried independently;
- palette compatibility filtering is deterministic;
- Component Package v2 migrates to a v3 2D presentation without visual or
  public-contract change.

### Runtime projection and parity

- equivalent Scene2D and Scene3D component instances project to the same
  Attribute, Property fallback and canonical semantics input;
- telemetry cannot mutate Attributes;
- renderer and trusted Action handlers observe one effective Property snapshot;
- Preview and standalone use injected package-scoped runtime/registries;
- all accepted M9 runtime/package/standalone fixtures pass.

### 2D regression

Required browser paths include open, select, drag, resize, rotate, group,
connect, undo/redo, save/reopen, Preview and standalone package load. The exact
set may reuse existing deployed smoke scripts but must cover any ownership moved
by the refactor.

The before/after 2D bundle report must show that Three/R3F are absent from the
2D initial route.

## M10D acceptance

### Read-only vertical slice

In Chromium and Firefox:

```text
load resource-closed 3D package in a fresh browser
→ render hierarchy/environment/runtime camera
→ select/pick a logical node
→ attach canonical semantics
→ derive an effective Property
→ update visibility/material/animation
→ unload
```

Required assertions:

- no Studio dependency installation or authoring repository initialization in
  standalone;
- no external network fetch from the model/package;
- missing capabilities/resources produce a visible deterministic failure;
- repeated load/unload returns resource counters within the M10A budget;
- initial 2D navigation does not fetch the 3D chunk.

## M10E acceptance

### Authoring task flow

Run the complete task flow on Chromium and Firefox:

- create a 3D work;
- import an accepted GLB and inspect diagnostics;
- place multiple component instances;
- select via viewport and outliner;
- translate, rotate and scale using local/world mode and snapping;
- edit numeric transforms;
- reparent while preserving the requested transform behavior;
- cancel one gesture and commit another;
- undo/redo each committed operation;
- set the runtime camera explicitly;
- save, close and reopen;
- enter Preview and verify document editing is locked.

History assertions prove one committed gesture equals one command and transient
frames are not serialized individually.

Interaction and memory results must remain inside the budgets accepted by
M10A, using the same reference fixture/environment.

## M10F acceptance

- 3D anchor identity survives component package round-trip and reimport;
- endpoint world positions follow translation, rotation, scale and reparent;
- straight and explicit polyline connections render and remain selectable;
- reconnect is one undoable command;
- incompatible, removed and ambiguous anchors fail with diagnostics rather than
  silently reconnecting;
- save/reopen and standalone preserve connection geometry;
- visual connection edits do not create runtime Value/Behavior/Interaction
  semantics.

## M10G and final acceptance

### Security and robustness

- schema/property-based malformed-input suite;
- GLB/resource corpus including resource-exhaustion attempts;
- digest mismatch and missing-resource cases;
- repeated import/open/close/unload soak;
- context loss/recovery or deterministic reload behavior;
- offline standalone execution;
- explicit proof that imported packages/models cannot execute source code or
  fetch unlisted resources.

### Performance and distribution

- all M10A budgets pass on the named environments and reference scenes;
- large-scene optimizations such as instancing/LOD retain selection and runtime
  identity correctness;
- final 2D and 3D chunk reports are attached;
- fresh-browser package transfer and standalone run pass;
- deployment smoke covers exact deployed revision when public asset paths or
  routing are affected.

### Compatibility

- accepted legacy Scene v8, Component Package v2 and Work Package v1 fixtures
  still load through explicit migrations;
- current serialization emits only current canonical versions;
- 2D deployed acceptance remains green;
- runtime semantics produce equivalent effective Property behavior across 2D
  and 3D presentations.

### Final closeout record

The M10 closeout record includes:

- exact accepted revision;
- every gate and associated PRs;
- all finding dispositions;
- CI, browser/deployment, security and performance evidence;
- final schema/package versions;
- explicit remaining non-goals;
- any deferred debt with an owner and reopening condition.

Only this closeout changes the product status from staged 3D work to an accepted
3D Scene Editor capability.
