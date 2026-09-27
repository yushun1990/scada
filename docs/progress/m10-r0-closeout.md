# M10-R0 closeout — readiness remediation

Status: **accepted · 2026-09-27**

Authorities:

- finding register: `docs/reviews/2026-09-25-3d-editor-readiness-review.md`
- execution/status protocol: `docs/governance/m10-3d-delivery-governance.md`
- required evidence: `docs/acceptance/m10-3d-acceptance-matrix.md` — R0 acceptance

## Why R0 existed

The 2026-09-25 3D readiness review authorized the staged M10 program but
found that the current 2D portable-execution boundary was not truthful:
authored Action source could execute unrestricted JavaScript, Workbench
affordances claimed capabilities that ready activation rejected, and several
deterministic checks either copied production algorithms or ran outside CI.
R0 corrected those defects before any 3D implementation work. It installed no
3D stack, added no Scene3D persistence, and changed no Scene v8 schema.

## Finding disposition

### R3D-001 — unrestricted authored execution (P0)

Finding: public user Action definitions persisted executable `implementation`
source and the Component Workbench executed it with `new Function`.

Fixed by PR #200 → `main@d591f34` (2026-09-25):

- `implementation` removed from the public `ComponentActionDefinition`
  contract; current-schema validation rejects it;
- the `new Function` execution path and the arbitrary-JavaScript Action
  editor/test runner were replaced with a read-only capability/signature view;
- legacy local/package input strips Action source without reading it and
  reports affected Action keys as explicit migration diagnostics;
- canonical cloning/serialization reconstructs Action contracts from allowed
  fields only, so smuggled executable fields cannot propagate;
- managed-SVG theme metadata no longer ships default JavaScript templates;
- `implementationDraft` remains inert data through save/export/import.

Evidence: `scripts/check-portable-execution-boundary.ts` (production-importing,
registered in the CI verify job) asserts each bullet above plus a static scan
that component authoring contains no `eval`/`new Function` path.

### R3D-002 / R3D-003 — contradictory activation contract and theme-generated Actions (P0)

Finding: Workbench method authoring claimed runnable capability while ready
user-component activation rejects every component declaring Actions/Events,
and SVG theme binding automatically created public executable Actions that
made the authored component fail its own activation.

Fixed by PR #201 → `main@79a89d5` (2026-09-26):

- one production capability authority now shared by ready serialization,
  distribution, import planning and runtime activation;
- SVG theme binding creates one collision-safe bindable select Property plus
  five private `svg.themeState` Visual Rules — never public Action/Event
  declarations; exact legacy auto-generated Actions are removed only during
  explicit rebind and reported, unrelated declarations are preserved;
- portable Action/Event creation affordances removed; legacy declarations
  remain visible for explicit cleanup; ready/export/publication are disabled
  while unsupported declarations remain; legacy packages import as editable
  drafts instead of silently activating.

Completed by PR #203 → `main@9c8c347` (2026-09-27):

- the disconnected declarative editors (Visual Rules, Visual Animations,
  managed-SVG typed elements) are restored inside the layer inspector through
  the existing document-history authority — one committed gesture remains one
  undoable command;
- validated SVG file replacement restored behind the existing
  sanitization/resource authority; grouped geometry locks apply consistently
  to source editing, replacement and typed geometry while presentation stays
  editable; SVG layers expose no raw `assetRef` text input;
- the layer behavior banner states the truthful boundary: generic declarative
  behavior lives in Visual Rules; portable user components create/execute no
  Action/Event in the layer inspector;
- the deployed acceptance path (new-work starter removal through the normal
  delete command, Inspector relocation, exact dependency closure) was repaired
  without weakening assertions.

Evidence: `scripts/check-component-capability-consistency.ts` (deterministic,
production-importing, in CI verify) plus the capability/authoring browser
smokes now running both in PR CI and on deployed Pages — see the final
evidence section.

### R3D-008 — checks outside CI / copied algorithms (P1)

Finding: new checks could exist outside CI and at least one check copied the
production algorithm it claimed to verify.

Fixed by PR #202 → `main@7eebd81` (2026-09-27):

- copied-algorithm geometry checks replaced with production-importing checks
  over the actual renderer/canvas functions;
- explicit CI registration enforced (`scripts/check-model-check-registration.mjs`
  fails CI when a deterministic check is not registered);
- all 62 deterministic check files inventoried; omitted checks (including the
  controlled-script codec check) registered;
- enabling the codec check exposed and fixed a real inherited-key validation
  failure (`__proto__` admitted as a visual target) with 15 negative cases.

Completed by PR #203 → `main@9c8c347`:

- the five formerly Pages-only smoke cases (`pages-smoke.mjs`,
  `pages-managed-svg-authoring/author-ref/geometry`,
  `pages-svg-import-compatibility`) now execute in PR CI with path triggers;
- R0 capability-consistency and geometry cases added to the deployed Pages
  smoke alongside their PR-CI registration.

### R3D-009 — status drift (P2)

Finding: current/proposed/implemented status was inconsistent across PLAN,
design notes and implementation.

Fixed by PR #202 → `main@7eebd81`: PLAN, README and active design records were
aligned on declarative-only portable activation, explicit legacy draft cleanup
and the remaining R0 closeout procedure; stale private-method/workspace
proposals and M8 scheduling notes were marked historical/superseded.

Completed by this closeout PR: the gate ledger, PLAN and README now record
R0 as accepted and M10A as the active gate, so every authority level states
the same status.

## Acceptance-matrix mapping

### Portable execution boundary

| Required evidence | Where proven |
| --- | --- |
| current validation rejects or explicitly migrates persisted Action `implementation` | `check-portable-execution-boundary.ts` |
| current package serialization cannot emit executable Action source | same check (canonical serializer assertions) |
| package import cannot make supplied source executable | same check (import migration assertions) |
| `implementationDraft` inert through save/export/import/activation | same check |
| normal trusted built-in Action handlers still work | unchanged built-in runtime suites (`check-visual-runtime`, `check-controlled-runtime-*`, `check-reusable-component-packages`, …) green in every R0 CI run; PR #200 explicitly changed no built-in semantics |
| static authority check against `eval`/`new Function` regression | same check (static scan of component authoring) |

### Capability consistency

The required end-to-end fixture — author/import a user component, add
declarative SVG theme behavior, mark ready, activate in ComponentRegistry,
place in Scene v8, export/import the work package, run standalone, and observe
Property state changing the expected visual presentation — is executed by:

- `scripts/check-component-capability-consistency.ts` (deterministic,
  production-importing, CI verify);
- `scripts/pages-component-capability-consistency-smoke.mjs` (browser,
  PR CI and deployed Pages);
- `scripts/pages-managed-svg-authoring-smoke.mjs` (full dogfood chain:
  Palette → managed SVG/PNG import → Visual Rules → ready → package transfer
  in a fresh browser → SCADA placement → exact work-package closure → fresh
  standalone rendering; PR CI and deployed Pages).

All three prove that no public executable Action was silently generated and
that activation diagnostics are empty for the accepted component.

### Documentation and checks

- PLAN, README and active design documents describe the same declarative-only
  execution boundary (R3D-009 disposition above; this PR completes the final
  gate-state sync);
- every remediation check is registered in CI, enforced by
  `check-model-check-registration.mjs`;
- no R0 check copies the implementation it verifies;
- build, lint and the complete affected M6–M9 model checks pass at the final
  revision (CI verify job below).

## Final exact-main evidence

Final R0 accepted revision:

`main@9c8c3471af53dd051c8456ff1eaacc3df593e34c`

Remediation history (each PR passed complete PR checks — verify,
publication-api and four browser jobs — at its head):

- PR #200 — R0.1 portable execution boundary (`d591f34`)
- PR #201 — R0.2 capability consistency (`79a89d5`)
- PR #202 — R0.3 test/authority cleanup (`7eebd81`)
- PR #203 — R0.2 deployed-acceptance completion: declarative inspector
  restoration plus acceptance-harness repair (`9c8c347`)

Final exact-main evidence at `9c8c347`:

- main CI #1182 (`36313178420`) passed;
- Deploy GitHub Pages #336 (`36313178412`) passed;
- Pages Browser Smoke #287 (`36313212959`) passed against the exact deployed
  revision, including the deployed capability browser smoke ("normal SVG
  authoring binds a Property plus private theme rules, exposes no portable
  Action/Event creation, saves ready, and activates into the SCADA palette"),
  the UX1.6 managed-SVG dogfood chain, typed managed-SVG geometry proof,
  component/work package transfer, standalone rendering and the
  Chromium/Firefox pointer regressions.

An independent review of PR #203 (worktree build, lint, model checks and four
browser smokes against a locally built preview) found no architecture or
governance violation; its only non-blocking notes were the then-stale PR-body
CI status and the deferral of deployed evidence to this record.

## Preserved boundaries (explicit non-blockers)

R0 deliberately did not:

- install Three/R3F or any 3D production dependency;
- add Scene3D fields, persistence or a second runtime authority;
- accept a portable Action/Event execution or emission contract —
  `implementationDraft` stays inert until a separate ADR is accepted;
- introduce a general-purpose script language (QuickJS experiments remain
  evidence-only);
- change trusted built-in Action semantics;
- redesign the full Component Workbench.

## Closeout decision

**Close R0.** All five register findings assigned to R0 (R3D-001, R3D-002,
R3D-003, R3D-008, R3D-009) are closed with exact fixing revisions and evidence,
and the acceptance matrix's R0 rows are satisfied at the exact accepted
revision.

M10A — architecture contract and measured technology spike — becomes the
active gate. The next eligible work item is the M10A decision record:
isolated schema drafts (WorkContent envelope, Scene3D v1, Component Package
v3), the GLB/resource threat model, the disposable rendering spike, and the
measured 2D/3D baselines that will set M10D–M10G budgets. M10B and every
later gate remain not-started until M10A is accepted.
