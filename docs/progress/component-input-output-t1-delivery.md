# CIO-T1 candidate delivery and complete browser verification

## Gate and authority

- Date: 2026-10-04. Work item: `CIO-T1-DELIVERY`; status: `implemented`, not
  `accepted`. This delivers the preserved `CIO-T1` / `CIO-T1-BROWSER` candidate
  and repairs the correctness prerequisite exposed by its complete browser step.
- Gate: [PLAN](../../PLAN.md), M10A plus already-authorized product polish.
  M10B–M10G remain `not-started`; no architecture acceptance is advanced.
- Finding IDs: `CIO-002`; prior `CIO-BR-001`–`CIO-BR-003`; new `CIO-DLV-001`
  (stale history fixture) and `CIO-DLV-002` (Property rename loses references).
- Architecture: [Component inputs/outputs §§2, 4, 7](../architecture/adr-component-input-output-composition.md),
  [Component public/private boundary](../architecture/component-system.md),
  [M9 Attribute/Property authority](../architecture/component-attributes-properties.md),
  [controlled private operations](../architecture/adr-proposal-controlled-layer-methods.md),
  [governance](../governance/m10-3d-delivery-governance.md) and
  [acceptance matrix](../acceptance/m10-3d-acceptance-matrix.md).
- Parent architecture [PR #221](https://github.com/yushun1990/scada/pull/221)
  remains OPEN at `b54260612018806a5bef9487672e822bf2f67fd7`; its two CI jobs
  passed, with no review or merge at the delivery audit. No new execution,
  composition, schema or Scene-routing authority is inferred from that result.
- Main production base: `f8a060dc4255b6695ddecffa60493ade5d761c74` (PR #220).
  A fresh `git fetch origin` confirmed this remained `origin/main`.
- Implementation base: `b54260612018806a5bef9487672e822bf2f67fd7`.
- Implementation head:
  `e5da7159a6718eeceac055ffe682265bbe19108c`.
  Subsequent documentation/capture delivery revisions and remote results belong
  in the candidate PR description; this record describes local evidence only.
- The 29 changed/new source, script and workflow files at that exact code head
  have SHA-256 `9e15439a4671246d9da5bd7902d6c66ee5ee126bcbc6cd0233ba35223d4b2328`:
  sorted repository-relative path + NUL + committed file bytes + NUL.
  Every committed byte was compared with the tested working files. Documentation
  and captures are excluded. The initial 24-file snapshot is preserved in the
  [browser-fixture record](component-input-output-t1-browser-fixtures.md).

## Implemented

The [T1 contract UI record](component-input-output-t1-contract-ui.md) and
[browser-fixture record](component-input-output-t1-browser-fixtures.md) describe
the public 操作/private 图层操作 distinction, typed read-only schemas, truthful
capability limits, current import/configuration/authorRef browser paths and
source-matched decoded-image guard. Their original failure rows are retained,
rather than rewritten as passing historical runs.

### CIO-DLV-001 — history fixture no longer matches the authoring surface

The complete component-editor step passed `pages-smoke` and then failed after
30 seconds at `titleField.focus()` in `pages-component-document-history-smoke`:
Enter had closed the inline title editor, so its input no longer existed.
Later assertions still addressed retired `.property-contract-item` cards.

The fixture now reopens the title before text editing and checks the displayed
title after Escape closes the input. It stages a deliberately different value
before Escape, preserving the cancellation assertion. Property-key editing
uses the current saved row's 编辑 button and compact form's explicit 保存/取消.
It proves that Escape/blur and explicit Cancel cannot persist a staged key or
dirty the document; it does not claim Escape dismisses the compact form.

Visual creation and title changes still share ordered undo/redo. Property
rename, rule-reference update and animation-reference update must be one
command; save/reopen retains the complete redone document. The final script
supports both Chromium and Firefox without separate copied algorithms.

### CIO-DLV-002 — compact save deletes Property-dependent presentation

Once the fixture reached its original reference assertion, production failed:
the expected `renamedState` rule reference was `undefined` because the rule had
been removed. The old `resolveReconciledProperty` recognized a rename only when
the next entry was the same JavaScript object. Compact save copies the entry
and synchronizes its title, so normal name editing broke that assumption.

Changed files/contracts:

- `ComponentContractRowTable.tsx` supplies an optional editor-only
  `{ previousKey, nextKey }` intent on its existing one-save callback.
- `ComponentPropertyContractEditor.tsx` and the retained Property path in
  `ComponentContractEditor.tsx` pass that intent through to `updateDefinition`.
- `component-property-references.ts` extracts the real production reconciliation
  from `ComponentEditorPage.tsx`. It validates the named old/new keys, then
  updates rule conditions, Property `valueSource` keys and animation activations
  inside the existing single document mutation. Attribute value sources stay
  in their separate namespace. Invalid intent throws before any result is
  committed. Deletion without rename intent never guesses a replacement from
  equal values or object identity.
- `scripts/check-component-property-references.ts` imports that renderer-free
  production export and is registered in CI. It covers copied-entry/title-sync
  rename, both rule references, Attribute isolation, animation activation,
  deletion, kind/operator fallback, invalid intent and immutable inputs.
- `pages-component-document-history-smoke.mjs` retains the previously failing
  rule assertion and adds animation activation plus save/reopen assertions.

The supplied intent is private authoring-session data, not a persisted schema,
runtime Property writer or new interaction contract. Rules/animations keep
their accepted schemas and host runtime semantics.

## Explicitly not implemented

T2 layer ownership/kind/input validation, transient test overlays, stale-run
fences or explicit atomic apply; T3 Scene Trigger/Effect routing; T4 nested
composition; portable authored public execution; a registry/runtime refactor;
3D product work; removed theme/Rule-editor UI or implicit draft promotion.
`CIO-004`/`CIO-005`/`CIO-006` runtime debts are not closed by this delivery.

## Compatibility and migration

Scene v8, component package v2, work package v1, public Action/Event definitions,
private `methods`, persisted source and package-scoped standalone boundaries are
preserved. No version or storage migration occurs. Property-key edits repair
existing authored visual references; telemetry/derived runtime values continue
through the accepted host-owned runtime, without writing Attributes/history.

All 31 pre-existing tracked captures were backed up before browser execution
and restored byte-for-byte afterward. The 15 relevant T1/capability/authorRef
captures are retained, including the historical gray-source mismatch image.
No unrelated screenshot replacement is included.

## Verification

Environment: Linux x86_64, Node `v22.23.2`, Playwright `1.63.0`, Vite `8.3.0`,
TypeScript `6.0.3`, React `19.3.0`. Built Vite preview:
`http://127.0.0.1:4175/`. Browser viewports: T1/capability 1366×900,
authorRef 1440×1000, history 1200×800; hit fixtures use their existing sizes.
There is no deployed-URL claim.

Exact per-command outcomes and source paths:
[local verification manifest](../../artifacts/component-input-output-t1-delivery-results.json).
Full stdout and a backup of the overwritten captures remain in
`/tmp/scada-cio-t1-delivery-yw6yi3yp/` for the local audit.

| Command / configured step | Exact local result |
| --- | --- |
| `npm run build` | PASS, exit 0; 661 modules; main JS 915.39 kB / 298.37 kB gzip; editor lazy chunk 333.91 kB / 98.08 kB gzip. |
| `npm run lint` | PASS, exit 0; 25 existing warnings, no new warning; UI primitive/token/Shell checks pass. |
| Every command in CI → Runtime model checks | PASS, all 73 exit 0: 59 TypeScript production checks, 3 model/registration Node commands, 11 syntax checks. Existing cached `tsx` was used for local execution; no dependency was installed. |
| `node scripts/check-model-check-registration.mjs` | PASS; all 66 deterministic checks are registered in CI/lint. The separate PostgreSQL publication API check is registered but not run locally. |
| `npx --yes tsx scripts/check-component-property-references.ts` | PASS, exit 0; copied-entry rename and all reference/failure assertions above. |
| Every browser command in Component Editor → Verify component interactions | PASS; all 21 configured commands exit 0 against the built code, including the previously unverified history path. |
| `SCADA_BROWSER=firefox node scripts/pages-component-interaction-contract-smoke.mjs` | PASS, exit 0. |
| `SCADA_BROWSER=firefox node scripts/pages-component-capability-consistency-smoke.mjs` | PASS, exit 0. |
| `SCADA_BROWSER=firefox node scripts/pages-managed-svg-author-ref-smoke.mjs` | PASS, exit 0. |
| `SCADA_BROWSER=firefox node scripts/pages-component-hit-smoke.mjs` | PASS, exit 0. |
| `SCADA_BROWSER=firefox node scripts/pages-component-document-history-smoke.mjs` | PASS, exit 0; complete title/key/reference history and save/reopen. |
| `node scripts/pages-component-document-history-smoke.mjs` | PASS again in Chromium after the final engine-selection change. |
| `node scripts/pages-scada-work-package-transfer-smoke.mjs` | PASS, exit 0; work transfer regression. |
| `node scripts/pages-standalone-runtime-smoke.mjs` | PASS, exit 0; package-scoped standalone regression. |
| `node --check scripts/pages-component-document-history-smoke.mjs` and `git diff --check` | PASS, exit 0. |

The browser step executes the current scripts listed in its workflow; Firefox
is a targeted five-script set, not every component/Pages browser command.
Compared with the prior browser-fix build, main JS is unchanged and the editor
chunk grows 0.39 kB / 0.10 kB gzip. No dependency was added; the existing
>500 kB warning remains. This is not performance acceptance.

The first sandboxed attempts failed on `tsx` IPC (`listen EPERM`) and Chromium
launch permissions. Authorized runs outside that sandbox passed. Those
environment failures are not presented as product failures or hidden passes.

## Risks and follow-up

The complete local component step is green; remote CI and deployed acceptance
must be assessed against the actual delivery revision. The parent design review
remains a merge dependency. This implementation is not an acceptance/closeout
PR, and locally green tests do not accept an architecture amendment.

Removed direct theme/Rule authoring, authorRef Rule-editor convergence and
draft-to-ready publication still have no new UI proof. This record makes no
security, migration, deployment or renderer-performance acceptance claim.

## Next eligible work item

Review the scoped delivery candidate and parent #221, complete required remote
checks, then collect exact-main deployment evidence through a separately
identified closeout. Only after those prerequisites may T2 ownership/transient
trial/stale-run/explicit apply be separately authorized. No next tranche or
later M10 gate is started by this handoff.
