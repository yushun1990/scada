# CIO-T1 browser-fixture and source-matched raster follow-up

This records the original 2026-10-03 browser-fixture snapshot. See the
[2026-10-04 delivery handoff](component-input-output-t1-delivery.md) for its
committed candidate, complete browser step and Property-reference prerequisite.

- Date: 2026-10-03
- Work item: `CIO-T1-BROWSER`; status: `implemented`, **not `accepted`**.
- Gate: M10A plus explicitly authorized product polish. No later M10 gate or
  component execution/composition amendment is activated.
- Branch: `polish/cio-t1-contract-consumption`.
- Base and HEAD: `b54260612018806a5bef9487672e822bf2f67fd7`.
- At this initial snapshot changes remained uncommitted on top of the preserved
  T1 worktree. This historical record makes no pushed-candidate, remote-CI or
  deployment acceptance claim; subsequent delivery evidence is linked above.
- Parent architecture [PR #221](https://github.com/yushun1990/scada/pull/221)
  remains OPEN, with no merge/accepted-authority claim.
- The original 24 changed/new `src/`, `scripts/` and `.github/` files, including
  preceding T1 changes, have SHA-256
  `2eefb185e7b05452f5907c30e142b1f6cf58e710b056e9ea6020af8b7eb225f2`.
  Calculation: sorted repository-relative path + NUL + file bytes + NUL.
  Documentation and captures are excluded. This is built-worktree evidence,
  not exact-commit evidence.

## Authority, scope and non-goals

Read with [PLAN](../../PLAN.md), the
[T1 handoff](component-input-output-t1-contract-ui.md),
[component-system architecture](../architecture/component-system.md),
[Attribute/Property authority](../architecture/component-attributes-properties.md),
[controlled layer-operation ADR](../architecture/adr-proposal-controlled-layer-methods.md)
and the [reviewing interaction amendment](../architecture/adr-component-input-output-composition.md).
The [M10 governance](../governance/m10-3d-delivery-governance.md) and
[acceptance matrix](../acceptance/m10-3d-acceptance-matrix.md) still govern status;
this work does not close their later-gate findings.

Selected work: repair two stale browser fixtures against explicitly chosen
current workflows, preserving substantive capability/authorRef assertions.
The failing pixel check then exposed a narrow existing 2D renderer defect;
source-matched decoding was added as its independently reviewable correctness
prerequisite. This scope adjustment does not restore removed UI or introduce a
new feature, semantic authority, schema or execution capability.

Non-goals: no T2 temporary overlay/atomic apply, T3 payload routing, T4 nested
composition or 3D implementation; no component/Scene/package schema migration;
no automatic draft promotion; no unrestricted authored JavaScript; no public
portable Action/Event execution. Existing private QuickJS trial behavior and
inert `implementationDraft` boundaries remain unchanged.

## Findings and repaired contracts

### CIO-BR-001 — stale capability authoring/ready assumptions

**Reproduction:** the old script timed out waiting for removed
`一键绑定声明式运行状态`; saving a locally authored SVG component now correctly
keeps it `draft`, rather than implicitly promoting it to `ready`.

**Changed files:**

- `scripts/pages-component-capability-consistency-smoke.mjs`.
- `scripts/fixtures/component-capability-theme.scada-component.json`.
- `scripts/check-component-capability-consistency.ts`.

The browser now imports an SVG and saves the actual local document, asserts
`draft`, then imports a validated frozen declarative package through the normal
confirmation UI as the legitimate positive `ready` path. It configures the
existing `state` Property, saves/reopens, and verifies green/red Preview pixels
including warm-cache return transitions. Preview does not mutate the authored
Property fallback or document. Empty public Action/Event creation/execution
controls remain unavailable.

The exact exported component is activated and placed in a canonical Scene v8
work, whose export carries that exact dependency closure. A separate, fresh
runtime browser loads the actual export with its authored green fallback;
then a canonical ValueBinding fixture derives red alarm presentation while
preserving the authored running fallback. Neither runtime path initializes
Studio IndexedDB or executes the package's `implementationDraft` sentinel.

The deterministic check parses the frozen artifact, regenerates Property/rules
using production `generateComponentSvgThemeBindings`, validates activation and
compares production canonical serialization byte-for-byte. It does not copy
the generator or weaken the portable public-execution boundary.

**Evidence gap retained:** this does not prove removed one-click theme binding,
Rule-editor UI authoring or direct draft-to-ready publication. Those are not
silently replaced by a shallow absent-button assertion or fixture-only claim.

### CIO-BR-002 — stale Property card and authorRef workflow

**Reproduction:** the old script timed out on removed `.property-contract-item`.
“添加属性” opens a draft form; without explicitly saving it, no Property exists.

**Changed file:** `scripts/pages-managed-svg-author-ref-smoke.mjs`.

The browser commits the compact Property form and verifies the exact persisted
numeric, bindable `property1` contract (default `7`, description included),
including its saved row and binding badge. It uses the actual marking workbench
to author `statusLamp`, rename to `runLamp`, undo and redo; canonical
`svg-tag-000003` remains stable. Serialized SVG bytes retain both authored `id`
and canonical `data-scada-tag`. Save/reopen preserves the alias and Property
contract; Preview remains read-only for private layer-operation authoring.

**Evidence gap retained:** no removed Rule-editor authorRef convergence UI is
claimed. Deterministic managed-SVG checks still cover authorRef identity,
immutability, rule targeting and package portability.

### CIO-BR-003 — old decoded image cached under a new source

**Reproduction:** after the workflow repair, the capability pixel assertion
failed with a saved/preview `running` value. Production rule resolution and the
actual generated image data URL both contained `#11bf62`, but the editor canvas
remained gray. The original unconditional snapshot read also failed the added
production-export deterministic assertion: old gray image was returned for a
new green source instead of `null`.

**Changed files:**

- `src/component-system/CompositeComponentVisualRenderer.tsx`.
- `src/component-system/visual-asset-snapshot.ts`.
- `scripts/check-visual-asset-raster-budget.ts`.

`useVisualAsset` previously retained the previous decoded image on the first
render after an `assetRef` change. `acquireDisplayRaster` could therefore cache
old pixels under the **new** source's key; the correct decoded image arriving
later reused that poisoned raster. The hook now carries source ownership with
the decoded image and reads only matching snapshots, or an already-ready entry
for the current source. Pending/failed or delayed old-source completion cannot
supply old pixels to the current source's display raster.

The source-match decision is a renderer-free production export, consumed by
the real hook and tested using image tokens without a dummy renderer cast.
It is private presentation-session cache state, not a Property or persisted
resource authority. Cache budgets, decoding policy, listener disposal and
external-resource fail-closed rules are not widened.

The regression was red before the guard and green after it; the same browser
flow now passes green → red → green → red and standalone-derived presentation
in both engines. No sleeps, skips or acceptance-assertion weakening were used
to hide the defect.

### Browser lane registration

- `.github/workflows/ci.yml`: syntax-check the capability script; extended model
  checks already execute through their existing registered commands.
- `.github/workflows/component-editor-smoke.yml`: include frozen fixtures/model
  changes in path triggers; preserve both existing browser checks.
- `.github/workflows/pages-smoke.yml`: retain the checks and upload capability
  captures alongside T1/managed-SVG evidence.

This is registration and local syntax evidence, not a remotely green lane.

## Verification and exact local outcomes

Environment: Linux x86_64; Node `v26.5.0`; Playwright `1.63.0`; Chromium
`153.0.8010.12`; Firefox `155.0`. Vite built-worktree preview URL:
`http://127.0.0.1:4175/`. Capability Studio/standalone viewports are 1366×900; the authorRef workbench
viewport is 1440×1000. There is no deployed URL claim. The local preview process
was stopped after verification.

- `npm run build`: **PASS**, 660 modules. Main JS 915.39 kB / 298.37 kB gzip;
  editor lazy chunk 333.52 kB / 97.98 kB gzip. Compared with preceding T1 main
  915.25 / 298.34 kB, the correction adds 0.14 / 0.03 kB; no dependency was added.
  Existing >500 kB warning remains; this is not performance acceptance.
- `npm run lint`: **PASS**, 25 existing warnings, no new warning. Two unused
  helpers disappeared with the rewritten browser checks. UI primitive/token/
  StudioShell audits pass.
- `node scripts/check-model-check-registration.mjs`: **PASS**, 65 checks
  registered in CI/lint.
- `node --check scripts/pages-component-capability-consistency-smoke.mjs` and
  `node --check scripts/pages-managed-svg-author-ref-smoke.mjs`: **PASS**.
- Three modified workflow YAML files parse; documentation link/code-fence
  checks and `git diff --check`: **PASS**.

All 14 production-model commands passed (exit 0):

```sh
for check in \
  check-component-capability-consistency \
  check-visual-asset-raster-budget \
  check-visual-runtime \
  check-managed-svg-authoring \
  check-managed-svg-visual-rules \
  check-managed-svg-portability \
  check-portable-execution-boundary \
  check-component-interaction-schema \
  check-m9b1-runtime-authority \
  check-m9b2-package-scene-e2e \
  check-preview-component-state \
  check-standalone-work-runtime \
  check-scada-work-package \
  check-distributable-component-package
do
  npx --yes tsx scripts/$check.ts
done
```

All browser commands below passed (exit 0) on the final built production source:

```sh
export SCADA_PAGES_URL=http://127.0.0.1:4175/
for script in \
  pages-component-capability-consistency-smoke \
  pages-managed-svg-author-ref-smoke \
  pages-component-interaction-contract-smoke \
  pages-component-hit-smoke
do
  SCADA_BROWSER=chromium node scripts/$script.mjs
  SCADA_BROWSER=firefox node scripts/$script.mjs
done
node scripts/pages-layer-methods-smoke.mjs
node scripts/pages-component-package-transfer-smoke.mjs
node scripts/pages-component-svg-drag-smoke.mjs
node scripts/pages-standalone-runtime-smoke.mjs
```

The last four scripts use their existing browser paths/defaults; they are not
claimed as dual-engine runs. Pointer/group/blank-selection/release-only snap,
one-command SVG drag, private sandbox trial and separate portable/standalone
regressions remain green. This is a **targeted set**, not every command in the
entire component-editor/pages workflow.

Retained local captures:

- `artifacts/component-capability-source-mismatch-before-chromium.png` — gray
  canvas before the guard; diagnostic history only.
- `artifacts/component-capability-{preview,standalone,derived}-{chromium,firefox}.png`
  — passing Property/standalone pixel evidence.
- `artifacts/managed-svg-author-ref-{chromium,firefox}.png` — current workbench.
- Existing six `artifacts/component-interaction-*.png` captures refreshed by
  the final T1 run. The tracked legacy layer-method screenshot was restored,
  rather than adding an unrelated screenshot replacement to this work item.

## Remaining risks and next eligible work

Both previously stale browser scripts now pass against the chosen current
workflow, and the newly exposed raster regression is corrected. However:

1. Parent PR #221 still needs review/accepted architecture handling. No schema,
   public execution, ownership/apply or nested-composition amendment is opened.
2. The entire remote CI/browser lane and an exact delivery revision/deployment
   have not been verified here. The local targeted passes are not gate closeout.
3. Removed theme/Rule UI authoring, authorRef UI convergence and direct draft
   promotion have no new browser evidence. If wanted, their product/workflow
   scope must be decided explicitly rather than resurrected by these tests.
4. The main-bundle warning remains. This small before/after report does not
   establish renderer performance acceptance.

Next eligible item: review and deliver the scoped T1 plus browser-fixture/
renderer-correctness candidate after handling its parent dependency, then run
required CI/deployed exact-revision evidence and decide closeout separately.
Only after those conditions may T2 ownership/temporary trial/stale-run fences/
explicit atomic apply be separately authorized. T3/T4 and later M10 work are
not implicitly started.
