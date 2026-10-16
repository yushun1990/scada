# Component I/O, Authoring Runtime, and Scene DSL Governance Closeout (PRs #221–#224)

## Gate and authority

- Date: 2026-10-16
- Work item: `CIO-T1` closeout and post-PR #221–#224 governance status reconciliation
- Status: `accepted`
- Gate: [PLAN](../../PLAN.md), `M10A` (active 3D architecture contract and measured spike) plus authorized product-polish and architecture governance reconciliation. `M10B`–`M10G` remain `not-started`.
- Finding and work-item IDs reconciled:
  - `CIO-ARCH` (`CIO-001`, `CIO-003`, `CIO-008`, `JA-001`, `JA-002`)
  - `CIO-T1`, `CIO-T1-BROWSER`, `CIO-T1-DELIVERY`, `PR222-R1` (`CIO-002`, `CIO-BR-001`–`003`, `CIO-DLV-001`–`002`)
  - `CAR-ARCH` / `CAR-0` (`JA-001`, `JA-002`)
  - `DSL-AUTH-ARCH` (`DSLA-R1`–`R10`)
- Architecture and governance authorities:
  - [Component inputs, outputs and composition ADR](../architecture/adr-component-input-output-composition.md)
  - [Component-authored private Update runtime ADR](../architecture/adr-component-authored-update-runtime.md)
  - [Scene DSL text-first authoring proposal ADR](../architecture/adr-scene-dsl-text-first-authoring.md)
  - [M10 delivery governance](../governance/m10-3d-delivery-governance.md)
  - [M10 acceptance matrix](../acceptance/m10-3d-acceptance-matrix.md)
- Audited `main` base and head revision before documentation reconciliation:
  `1c7e4f604ea666b4cf2a67370cfe5dfde18c6f16`

## Why this governance reconciliation existed

Under the repository execution contract (`AGENTS.md` and `docs/governance/m10-3d-delivery-governance.md`), candidate implementation and architecture PRs must not self-promote their status to `accepted` before merge and exact-main verification evidence exist. Between 2026-10-09 and 2026-10-13, four stacked governance, architecture, and product-polish PRs (#221, #223, #222, #224) were reviewed and merged into `main`. PRs #221 and #223 establish architecture-only acceptance from their corrected documents and reviews; they do not establish successful browser verification at their merge revisions. At #223's merge, CI and GitHub Pages deployment passed, but malformed browser workflow YAML prevented browser jobs from executing. The later PR #222 final head supplies the successful Component Editor browser baseline, and the #222/#224 merge revisions have successful exact-main CI, deployment, and the deployed Pages smoke scenarios listed below.

Because each PR preserved its pre-merge `active` or `implemented` status header at commit time, `PLAN.md`, `README.md`, `docs/architecture/`, `docs/governance/`, and `docs/progress/` retained pre-merge statements claiming that PR #221 was still open/under review and that PR #222 lacked remote/deployed evidence.

This closeout reconciles all repository authority layers with the verified `main` ledger without starting any next implementation tranche implicitly.

## Merged PR and exact-main evidence ledger

| PR | Work item | Branch head | Merge commit on `main` | Merge date (UTC) | Exact verification evidence | Final status |
| --- | --- | --- | --- | --- | --- | --- |
| [#221](https://github.com/yushun1990/scada/pull/221) | `CIO-ARCH` (`CIO-001`, `CIO-003`, `CIO-008`, `JA-001`, `JA-002`) | `da633112082a27eafbf352ef9cd757ab3dd8c2fa` | `5791cdc107db7fec9d243bc747f13e455a99954b` | 2026-10-09 | Markdown/link/anchor audit and deterministic production-export probes in [contract review correction](../governance/component-contract-review-correction.md). | `accepted` (architecture amendment) |
| [#223](https://github.com/yushun1990/scada/pull/223) | `CAR-ARCH` / `CAR-0` (`JA-001`, `JA-002`) | `7c10b758dd451205c413e6c3597a32817d2dc4c0` | `fade11782b8dc8a3c36b4f869a2197d3e91a7fd1` | 2026-10-09 | `main` CI #1232 (`37894906142`) PASS; Deploy GitHub Pages #353 (`37894906101`) PASS. Pages #341/#342 and Component Editor #184 failed workflow validation before browser execution at `fade117`; browser coverage at this revision is unverified (details below). | `accepted` (architecture direction baseline; execution `not-started`) |
| [#222](https://github.com/yushun1990/scada/pull/222) | `CIO-T1`, `CIO-T1-BROWSER`, `CIO-T1-DELIVERY`, `PR222-R1` | `aad102ad2af6612ab71ad24f3e9f652cc7d4d1d2` | `370981cadb0089cb3b27e8bcec6b245fa119d36b` | 2026-10-10 | PR head `aad102a`: CI #1234 (`38035719020`), Component Editor Browser Checks #187 (`38035719019`), Editor Transaction #89 (`38035719018`), Editor Save Leave #116 (`38035719052`), Editor Mode Selection #76 (`38035719029`), Studio Shell #73 (`38035719060`), Scene Navigation #46 (`38035719013`) — all PASS. Exact-main `370981c`: CI #1235 (`38037219651`) PASS, Deploy GitHub Pages #354 (`38037219672`) PASS, Pages Browser Smoke #345 (`38037261061`) PASS. | `accepted` |
| [#224](https://github.com/yushun1990/scada/pull/224) | `DSL-AUTH-ARCH` (`DSLA-R1`–`R10`) | `86464a36446f0181fa3b5d68358b27e355dab4a6` | `1c7e4f604ea666b4cf2a67370cfe5dfde18c6f16` | 2026-10-13 | Exact-main `1c7e4f6`: CI #1238 (`38334529972`) PASS, Deploy GitHub Pages #355 (`38334529923`) PASS, Pages Browser Smoke #346 (`38334581275`) PASS. | `accepted` (architecture review baseline; implementation `not-started`) |

### Browser evidence scope — PR225-R1 / PR225-R2

At `fade117`, [Pages #341](https://github.com/yushun1990/scada/actions/runs/37894904997) has zero check runs; [Pages #342](https://github.com/yushun1990/scada/actions/runs/38034569588) and [Component Editor #184](https://github.com/yushun1990/scada/actions/runs/38034570145) have zero jobs. The exact-revision [Pages workflow line 60](https://github.com/yushun1990/scada/blob/fade11782b8dc8a3c36b4f869a2197d3e91a7fd1/.github/workflows/pages-smoke.yml#L60) and [Component Editor workflow line 85](https://github.com/yushun1990/scada/blob/fade11782b8dc8a3c36b4f869a2197d3e91a7fd1/.github/workflows/component-editor-smoke.yml#L85) contain an unindented shell command outside the YAML `run` block. These are workflow-validation failures with no executed browser tests, not failures of stale browser fixtures. The separately documented fixture defects in the [browser-fixture record](component-input-output-t1-browser-fixtures.md) and [delivery record](component-input-output-t1-delivery.md) came from executed local checks and remain separate historical evidence.

The PR222-R1 combined Property rename/type change, atomic undo/redo, and complete Save/reopen scenario passed in Chromium in [Component Editor #187](https://github.com/yushun1990/scada/actions/runs/38035719019), at PR head `aad102ad2af6612ab71ad24f3e9f652cc7d4d1d2`. Its [workflow](https://github.com/yushun1990/scada/blob/aad102ad2af6612ab71ad24f3e9f652cc7d4d1d2/.github/workflows/component-editor-smoke.yml#L46) runs `pages-component-document-history-smoke.mjs` against the built revision at `http://127.0.0.1:4173/`. The [review-fix record](component-input-output-t1-review-fix.md) also retains the separate local Chromium/Firefox runs. [Pages Smoke #345](https://github.com/yushun1990/scada/actions/runs/38037261061), at merge `370981cadb0089cb3b27e8bcec6b245fa119d36b`, passed deployed contract/capability and visual-asset smoke; its [command list](https://github.com/yushun1990/scada/blob/370981cadb0089cb3b27e8bcec6b245fa119d36b/.github/workflows/pages-smoke.yml#L39) omits the document-history fixture. No separately identified deployed run proves the combined Property edit/history/Save/reopen regression. This closeout retains the passing build-preview and local regression evidence without claiming deployed coverage for that scenario.

## Finding and tranche dispositions

### 1. Component Input/Output and Composition (`CIO` program)

| Item | Finding IDs | Status | Disposition and remaining boundary |
| --- | --- | --- | --- |
| `CIO-ARCH` | `CIO-001`, `CIO-003`, `CIO-008`, `JA-001`, `JA-002` | `accepted` | Merged in PR #221 (`5791cdc`). Freezes public Action (`操作`) vs Event (`事件`) vs private Layer Operation (`图层操作`), host-owned semantic Property truth, JA-001 unknown/usable equipment input obligations, JA-002 consumer-feedback isolation, and future child-contract preservation/explicit Event re-export invariants. |
| `CIO-T1` (incl. `CIO-T1-BROWSER`, `CIO-T1-DELIVERY`, `PR222-R1`) | `CIO-002`, `CIO-BR-001`–`003`, `CIO-DLV-001`–`002` | `accepted` | Merged in PR #222 (`370981c`). Public `操作` / private `图层操作` labels, read-only Action/Event schemas and source-matched visual-asset decoding have deployed Pages smoke evidence (#345). Atomic Property rename/type reference reconciliation, undo/redo and complete Save/reopen have Chromium build-preview evidence (#187) plus the separately recorded local Chromium/Firefox runs; deployed coverage of that regression is unverified. See the evidence scope above. |
| `CIO-T2` | `CIO-004`, `CIO-005` | `not-started` | Editor Layer Operation owner/scope/kind/argument validation, transient test preview overlay, stale-run cancellation fence, and explicit one-command atomic apply require separate authorization and evidence under [ADR §7](../architecture/adr-component-input-output-composition.md#7-migration-order-and-acceptance-boundary). |
| `CIO-T3` | `CIO-006`, `CIO-007` | `not-started` | Narrow Scene `Behavior = Trigger -> Effect` authoring, canonical/compatibility single-route migration, and typed payload-to-argument mapping remain unstarted and coordinate with `DSL-AUTH-ARCH` §3 step 1. |
| `CIO-T4` | `CIO-008` (composition) | `not-started` | Nested reusable Component Layer, read-only child contract consumption, parent-private child Event triggers, and explicit parent Event re-export remain unstarted. |

### 2. Component Authoring Runtime (`CAR` program)

| Stage | Status | Disposition and remaining boundary |
| --- | --- | --- |
| `CAR-ARCH` / `CAR-0` | `accepted` | Merged in PR #223 (`fade117`) after PR #221 (`5791cdc`). Establishes the three-role product direction (fixed Engine, Component Workbench private Model/Update authoring, public-contract Scene consumption) and records JA-001/JA-002 obligations on PumpSwitch and private feedback. Approves no executable schema or runtime capability. |
| `CAR-1` | `not-started` | Independent Portable Component Execution ADR required before any runtime/editor/package work: unknown/usable input lifecycle, one Model/commit boundary, presentation composition ordering, generation fencing, optional public outcome route, sandbox/ABI/capability budgets, and versioned admission. |
| `CAR-2`–`CAR-4` | `not-started` | Narrow runtime prototype (`CAR-2`), Component Workbench Logic authoring (`CAR-3`), and portable package/standalone parity (`CAR-4`) remain gated behind `CAR-1` acceptance. |

### 3. Scene DSL Text-First Authoring (`DSL-AUTH` program)

| Stage | Status | Disposition and remaining boundary |
| --- | --- | --- |
| `DSL-AUTH-ARCH` | `accepted` | Merged in PR #224 (`1c7e4f6`). Establishes the verified source baseline (`src/scene/scada-dsl*.ts` has zero production UI/persistence/editor-Preview consumers) and freezes the staged work order. Does not amend `scada-dsl-v1.md` or M9A1.4. |
| `DSL-AUTH` §3 step 1 | `not-started` | Prerequisite (`CIO-T3`-adjacent): wire existing DSL v1 (`$self` / `$device`) into Scene authoring, `scadaSemantics` persistence, editor Preview, primary-device selection, and one-command undo before evaluating grammar extensions. |
| `DSL-AUTH` §4 / §5 | `not-started` | Named device slots (`$pump1`) and typed Event payload references (`$event.<field>`) remain candidate extensions requiring §3 step 1 observation plus a separate accepted ADR and versioned Scene/semantics migration. |

## Implemented

Documentation and governance status synchronization only:

- `PLAN.md` §§3.1, 11: replace pre-merge `active`/`implemented` branch narratives for `CIO-ARCH`, `CIO-T1*`, `CAR-ARCH`, and `DSL-AUTH-ARCH` with the verified post-PR #224 status ledger and explicit `not-started` gates for `CIO-T2`–`T4`, `CAR-1`–`CAR-4`, `DSL-AUTH §3 step 1`, and `M10B`–`M10G`.
- `README.md`: update `adr-component-input-output-composition.md` reference from "under review" to `accepted`, and correct the final priority paragraph so `M10-R0` is stated as `accepted` and `M10A` as `active`.
- `docs/architecture/adr-component-input-output-composition.md`, `adr-component-authored-update-runtime.md`, `adr-scene-dsl-text-first-authoring.md`, `adr-proposal-controlled-layer-methods.md`, `component-system.md`, `component-attributes-properties.md`, `scada-binding-behavior.md`, and `docs/design/component-editor-redesign.md`: synchronize status headers and cross-references with merged PRs #221–#224.
- `docs/governance/component-contract-review-correction.md`, `docs/governance/component-authored-update-review-correction.md`, `docs/progress/component-authored-update-runtime-arch.md`, `docs/progress/component-input-output-audit.md`, and `docs/progress/component-input-output-t1-*.md`: record post-merge `accepted` dispositions and link this closeout record while preserving historical local verification tables.

## Explicitly not implemented

- No `src/`, `scripts/`, `package.json`, or `.github/workflows/` changes.
- No `CIO-T2`, `CIO-T3`, `CIO-T4`, `CAR-1`–`CAR-4`, `DSL-AUTH` §3 step 1, or `M10A`–`M10G` feature/schema/runtime implementation.

## Compatibility and migration

Scene v8, Component Package v2, SCADA Work Package v1, `SCADA_SEMANTICS_VERSION = 1`, DSL v1 (`$self` / `$device`), M9 Attribute/Property separation, M10-R0 portable declarative-only activation, and package-scoped standalone runtime remain unchanged.

## Verification

The initial reconciliation at `fb1f99026e992ca746b70da1359d328f7337080d`
recorded the following local results. Its Markdown link count predates the
PR225-R1/R2 evidence links added above.

| Command | Exact outcome |
| --- | --- |
| `npm run build` | PASS, exit 0 — `tsc -b && vite build`, 661 modules transformed; `dist/assets/index-CUXv6Wp0.js` `915.44 kB` (`298.39 kB` gzip), `dist/assets/EditorStorageGate-CWHEwH7C.js` `334.02 kB` (`98.14 kB` gzip); existing `>500 kB` chunk warning unchanged. |
| `npm run lint` | PASS, exit 0 — `oxlint .` (0 errors, 25 existing warnings across 300 files), `check-ui-primitives.mjs`, `check-ui-token-authority.mjs`, and `check-studio-shell-authority.mjs` all passed. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — `Model check registration passed: 66 checks execute in CI or its lint command.` |
| `npx --yes tsx scripts/check-component-interaction-schema.ts` | PASS, exit 0 — read-only Action parameter and Event payload presentation contract. |
| `npx --yes tsx scripts/check-component-property-references.ts` | PASS, exit 0 — atomic Property rename/type/default visual reference reconciliation. |
| `npx --yes tsx scripts/check-component-capability-consistency.ts` | PASS, exit 0 — declarative theme Property/rules and package/work/standalone parity. |
| `npx --yes tsx scripts/check-portable-execution-boundary.ts` | PASS, exit 0 — public Action source rejected/migrated, `implementationDraft` inert. |
| Markdown link/anchor/fence verification across all 19 touched `.md` files | PASS, exit 0 — 19 Markdown files, 208 relative links and anchors resolved, balanced code fences, no replacement characters. |
| `git diff origin/main -- src scripts package.json package-lock.json .github` | PASS, exit 0 — empty diff; production code, tests, dependencies, and workflows untouched. |
| `git diff --check` | PASS, exit 0 — no whitespace errors. |

### PR225-R1 / PR225-R2 correction verification — 2026-10-16

Correction base / reviewed head: `fb1f99026e992ca746b70da1359d328f7337080d`.
Work item: `CIO-T1-CLOSEOUT`; findings: `PR225-R1`, `PR225-R2`.
Changed file: this closeout record only. Contracts and gate statuses are
unchanged; the correction head and remote check results belong to PR #225's
delivery metadata.

| Command / evidence | Exact outcome |
| --- | --- |
| `gh api` for Pages #342 / Component Editor #184 jobs and Pages #341 check runs | PASS, exit 0 — each returned zero jobs/check runs at `fade117`. |
| `git show` exact historical workflows + Python/PyYAML parse | PASS, exit 0 — both `fade117` browser workflows reject malformed YAML; the #222 final-head Component Editor workflow and merge-revision Pages workflow parse successfully. |
| `gh run view 38035719019 --log` and `gh run view 38037261061 --log` | PASS, exit 0 — #187 checks out `aad102a`, uses `http://127.0.0.1:4173/`, and logs the Chromium combined-edit/history/Save/reopen pass; #345 checks out `370981c`, uses deployed Pages, and logs contract/capability passes. The exact #345 workflow omits document history. |
| `npm run build` | PASS, exit 0 — 661 modules; main 915.44 kB / 298.39 kB gzip; editor chunk 334.02 kB / 98.14 kB gzip. Existing large-chunk warning remains. |
| `npm run lint` | PASS, exit 0 — 25 existing warnings, no errors; primitive/token/StudioShell checks pass. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — 66 registered checks. |
| Python read-only Markdown link/anchor/fence/encoding audit across the PR diff | PASS, exit 0 — 19 Markdown files, 211 relative links/anchors, balanced fences and valid UTF-8. |
| `git diff 1c7e4f604ea666b4cf2a67370cfe5dfde18c6f16 -- src scripts package.json package-lock.json .github` | PASS, exit 0 — empty diff. |
| `git diff --check` | PASS, exit 0 — no whitespace errors. |

No fresh browser run or deployment was performed for this documentation
correction. Historical workflow-validation failures and the missing deployed
history scenario remain explicit evidence limits.

## Risks and follow-up

- Accepting `CIO-ARCH`, `CIO-T1`, `CAR-ARCH` (`CAR-0`), and `DSL-AUTH-ARCH` does **not** close runtime/editor debts `CIO-004`–`CIO-007` or authorize portable user script execution.
- Removed one-click SVG theme button, removed layer-inspector Visual Rule/Animation authoring UI, and direct draft-to-ready promotion in the Workbench remain separate product-workflow questions if re-opened.

## Next eligible work item

Select and explicitly scope **one** of the following authorized next items (none is started by this closeout):

1. **`M10A` decision record and spike** (`R3D-004`): isolated schema drafts (`WorkContent`, `Scene3D v1`, `Component Package v3`), GLB/resource threat model, disposable rendering spike, and measured 2D/3D baselines.
2. **`CIO-T2` editor Layer Operation correction** (`CIO-004`, `CIO-005`): owner/scope/kind/input validation, transient test preview overlay, stale-run cancellation fence, and explicit one-command atomic apply.
3. **`DSL-AUTH-ARCH` §3 step 1 / `CIO-T3`**: wire existing DSL v1 (`$self` / `$device`) into Scene authoring, `scadaSemantics` persistence, editor Preview, and undo, or scope narrow Scene `Behavior = Trigger -> Effect` routing migration.
4. **`CAR-1` Portable Component Execution ADR**: define unknown/usable input delivery and lifecycle, private Model/commit/presentation ordering, generation fencing, and sandbox/ABI/capability admission.
