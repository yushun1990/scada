# Repository execution contract

This file applies to the entire repository. It is the operational contract for
AI-assisted work; it does not replace product or architecture authority.

## Authority order

When instructions disagree, use this repository order:

1. `PLAN.md` — current execution gate and accepted boundaries.
2. `docs/architecture/` — accepted architecture decisions.
3. `docs/acceptance/` — evidence required to close a gate.
4. `docs/governance/` — delivery process and status rules.
5. The active issue or PR — the smallest authorized work item.
6. `docs/progress/` — historical evidence, not current authority.

Do not treat an old progress note, branch name, commit message, UI mock, or
test-script name as authorization for a new milestone.

## Start every task

Before editing:

1. Read `PLAN.md` and identify the current execution gate.
2. Read the architecture and acceptance documents linked by that gate.
3. Inspect the worktree and preserve unrelated user changes.
4. State the selected work item, its explicit non-goals, and its required
   verification.
5. Confirm that the task belongs to the current gate. If it belongs to a later
   gate, stop and report the dependency instead of implementing ahead.

For M10 work, also read:

- `docs/reviews/2026-09-25-3d-editor-readiness-review.md`
- `docs/architecture/3d-scene-editor.md`
- `docs/governance/m10-3d-delivery-governance.md`
- `docs/acceptance/m10-3d-acceptance-matrix.md`

## Non-negotiable architecture rules

- Preserve Scene v8 as the accepted 2D document. Do not add optional 3D fields
  to turn it into a mixed-dimensional schema.
- Scene2D and Scene3D must project into one renderer-independent runtime model;
  do not create a second Property, DSL, data-source, Action, or standalone
  runtime authority for 3D.
- Keep Konva inside the 2D presentation adapter and Three/R3F inside a lazy 3D
  presentation adapter.
- Component contract validation must not require a renderer or a dummy
  renderer cast.
- Imported packages and authored definitions must not execute unrestricted
  JavaScript. Do not use `eval`, `new Function`, hidden script injection, or
  direct authored access to DOM, React, Konva, or Three objects.
- External model or texture fetching is fail-closed. Portable artifacts must
  carry an exact validated resource closure.
- Editor-only state, such as the navigation camera, must not silently become
  persisted runtime state.
- One committed user gesture must produce one undoable command.

If a requirement conflicts with one of these rules, propose an ADR and wait for
that decision to be accepted. Do not silently work around the rule.

## Delivery discipline

- Keep one PR focused on one accepted gate or one independently reviewable
  prerequisite.
- Prefer domain/codec/runtime work before UI integration.
- Tests must exercise production exports. A test that copies the production
  algorithm is not evidence for that algorithm.
- Schema and package changes require versioned parsing, migration fixtures,
  malformed-input tests, and rollback/failure behavior.
- UI or renderer changes require deterministic model tests plus the browser
  evidence named by the acceptance matrix.
- New heavyweight dependencies require an accepted design decision, lazy-load
  proof, and a before/after bundle report.
- Do not update a gate to `accepted` in the same implementation PR unless all
  required evidence already exists and the PR is explicitly a closeout PR.

## Status and handoff

Use only the statuses defined in the M10 governance document. Every handoff
must record:

- base and head revisions;
- work item and finding IDs addressed;
- files and contracts changed;
- verification commands and exact outcomes;
- remaining risks or failed checks;
- the next eligible work item, without starting it implicitly.

Compilation alone is never completion. Do not claim browser, deployment,
migration, security, or performance acceptance without the corresponding
evidence.
