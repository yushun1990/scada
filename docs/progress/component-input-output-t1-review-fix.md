# CIO-T1 review correction — PR222-R1

## Gate and authority

- Date: 2026-10-10. Work item: `CIO-T1-DELIVERY` review correction; status:
  `implemented`.
- Gate: [PLAN](../../PLAN.md), M10A plus authorized compatible product polish.
- Finding: [PR222-R1](https://github.com/yushun1990/scada/pull/222#discussion_r4236887391),
  the incompatible Property value source retained by the `CIO-DLV-002` repair.
- Architecture: [Attribute/Property authority §§3–4](../architecture/component-attributes-properties.md),
  [input/output amendment §7](../architecture/adr-component-input-output-composition.md),
  [execution governance](../governance/m10-3d-delivery-governance.md), and
  [acceptance matrix](../acceptance/m10-3d-acceptance-matrix.md).
- Fix base / reviewed PR head:
  `8f2e746bf3f6c6d6c5808c0c0bf36906e39c8fd7`.
- Verified source and regression head:
  `a336c3fc4a2039db5e9385ff54062180e9c18ae9`.
- Original production base: `f8a060dc4255b6695ddecffa60493ade5d761c74`;
  original scoped parent base: `b54260612018806a5bef9487672e822bf2f67fd7`.
  GitHub now reports parent #221 merged on 2026-10-09 at
  `5791cdc107db7fec9d243bc747f13e455a99954b`. This fix does not rebase or merge
  main, change a gate status, or claim deployed acceptance.

## Implemented

`reconcileVisualPropertyReferences` previously remapped a Property source key
without checking whether its new default/kind still fit the visual target. A
select `state` supplying `svg.themeState`, renamed and changed to boolean in
one compact-form save, left a document that the persistence validator rejected.

Changed files and contracts:

- `src/features/component-library/component-property-references.ts` now checks
  each resolved Property source with `isComponentPropertyValue` and the existing
  production `visualRuleTargetAcceptsValue`, using the actual layer, target and
  optional SVG tag. Incompatible rules are removed in the existing definition
  mutation, following reference-deletion reconciliation. The edit remains one
  undoable command. Compatible sources, condition repair and animation
  activation repair retain their existing behavior; Attribute sources retain
  their separate namespace. No literal substitution or type coercion is added.
- `scripts/check-component-property-references.ts` now uses valid document
  fixtures with real target layers, a description and distinct Attribute and
  Property names. It serializes and reopens complete documents after rename,
  deletion, kind/operator repair, the reported select-to-boolean edit with and
  without rename, compatible select-to-string changes, and same-kind default
  edits crossing numeric, enum and managed-SVG target limits. It also checks a
  value-only reference with an unrelated condition and preserves immutable
  inputs and invalid-rename rejection.
- `scripts/pages-component-document-history-smoke.mjs` adds a real SVG import
  and placement, seeds the reported source plus a value-only reference and
  compatible condition/animation, then performs the actual combined compact
  Property edit. It verifies deferred persistence, one undo restoring the
  original definition and all visual references, redo pruning only incompatible
  reads, and successful document Save/reopen.

Both extended checks already execute in their existing CI workflows.

## Explicitly not implemented

T2 private operation ownership/apply, T3 Scene routing, T4 nested composition,
portable public execution, CAR runtime work, registry/runtime changes,
deployment, milestone closeout, or M10B and later 3D gates.

## Compatibility and migration

Scene v8, component package v2, work package v1 and all persisted schemas are
unchanged. No storage migration or dependency change occurs. Authored Property
edits remove incompatible private rules; a single undo restores them. Runtime
Property ownership, authored Attributes and package-scoped standalone remain
unchanged.

## Verification

Environment: Linux, Node `v22.23.2`, Playwright `1.63.0`; built Vite preview at
`http://127.0.0.1:4182/`, viewport 1200×800. TypeScript checks used the existing
cached loader with `node --import /home/yushun/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/loader.mjs scripts/<name>`.

| Command / script | Exact outcome |
| --- | --- |
| `npm run build` | PASS, exit 0; 661 modules; main 915.44 kB / 298.39 kB gzip; editor lazy chunk 334.02 kB / 98.14 kB gzip. Existing large-chunk warning remains. |
| `npm run lint` | PASS, exit 0; 25 existing warnings; UI primitive/token/Shell audits pass. |
| `check-component-property-references.ts` | PASS, exit 0; complete-document save/reopen and all reconciliation/failure assertions above. The new incompatible-source assertion failed against the original implementation before the fix. |
| `check-managed-svg-visual-rules.ts` | PASS, exit 0. |
| `check-component-capability-consistency.ts` | PASS, exit 0. |
| `check-distributable-component-package.ts` | PASS, exit 0. |
| `check-component-package-transfer.ts` | PASS, exit 0. |
| `check-visual-runtime.ts` | PASS, exit 0. |
| `check-animation-model.ts` | PASS, exit 0. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0; all 66 deterministic checks are registered. |
| `SCADA_PAGES_URL=http://127.0.0.1:4182/ SCADA_BROWSER=chromium node scripts/pages-component-document-history-smoke.mjs` | PASS, exit 0; combined rename/kind Save/reopen and atomic undo/redo, no page errors. |
| `SCADA_PAGES_URL=http://127.0.0.1:4182/ SCADA_BROWSER=firefox node scripts/pages-component-document-history-smoke.mjs` | PASS, exit 0; same complete assertions, no page errors. |
| `node --check scripts/pages-component-document-history-smoke.mjs` | PASS, exit 0. |
| `git diff --check` | PASS, exit 0. |

Initial setup/fixture failures are excluded from passing evidence: sandboxed
Chromium could not launch (`sandbox_host_linux.cc`, operation not permitted),
so final browser runs used approved execution outside that sandbox. The first
browser fixture omitted placement of the imported resource and timed out at
the layer row; adding the existing resource double-click step fixed both
browser runs. A supplementary mistyped `check-component-library.ts` invocation
failed with `ERR_MODULE_NOT_FOUND`; no such check exists or is counted above.

## Risks and follow-up

Changing a source kind/default can remove dependent private rules by design;
undo restores the complete prior document. Only incompatible Property reads
are removed. The existing lint and bundle warnings remain. Local checks above
do not prove deployment or any new performance/security acceptance. Exact-head
remote outcomes belong to PR #222's delivery metadata after push.

## Next eligible work item

Re-review PR222-R1 and the updated candidate against its new remote CI/browser
results, then obtain any separately required exact-main deployed/closeout
evidence. No later tranche or gate is started by this correction.
