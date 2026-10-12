# Component input/output T1 — contract UI and read-only consumption

This records the original 2026-10-03 local T1 snapshot. The committed candidate,
complete component-browser step and newly discovered Property-reference
correction are recorded in the [2026-10-04 delivery handoff](component-input-output-t1-delivery.md).
The initial failures below remain diagnostic history.

## Gate and authority

- Date: 2026-10-03. Work item: `CIO-T1`. Status: `implemented`, not `accepted`.
- Gate: compatible product polish alongside M10A; no M10 gate promotion.
- Finding IDs: `CIO-002` UI vocabulary/typed contract display; presentation-only
  clarification for `CIO-004`/`CIO-006`. Their runtime/ownership/routing debts
  are not closed by these UI changes.
- Scope: repository owner's “start the next step” request, bounded to the T1
  follow-up identified by the [audit](component-input-output-audit.md).
- Architecture sections: [input/output amendment §§2, 4, 7](../architecture/adr-component-input-output-composition.md),
  [component system §§3, 7–8](../architecture/component-system.md),
  [M9 value authority](../architecture/component-attributes-properties.md),
  [controlled editor operations](../architecture/adr-proposal-controlled-layer-methods.md).
  The amendment's parent PR #221 is still OPEN; this follow-up does not accept it
  or use it to authorize a new execution/schema/composition contract.
- Starting worktree: clean. Prior branch `docs/component-contract-intent-authority`
  preserved; follow-up branch `polish/cio-t1-contract-consumption`.
- Base revision: `b54260612018806a5bef9487672e822bf2f67fd7` (PR #221 head).
  Unchanged production baseline: `f8a060dc4255b6695ddecffa60493ade5d761c74`.
- Head revision remains `b54260612018806a5bef9487672e822bf2f67fd7` plus the
  uncommitted T1 worktree. No delivery commit or deployed candidate is claimed.
  The 19 changed/new source, script and workflow files have source-snapshot
  SHA-256 `e15c93d067df4f7248f3d2bf0ac8986cb0a36ecadbf4d5d5b37b77a086c4bd91`
  (sorted relative path + NUL + file bytes + NUL for each file; docs/captures excluded).

## Implemented

- `ComponentEditorPage.tsx` separates public **操作** / **操作（未开放）**
  from private **图层操作**. `ScadaEditorPage.tsx` and
  `ComponentInteractionsInspector.tsx` use the same public vocabulary.
- Shared `src/components/ComponentInteractionSchema.tsx`, its token-based CSS,
  and production presentation mapper `component-interaction-schema.ts` show:
  - declared positional Action parameters, names/titles/descriptions and kinds;
  - named Event payload fields, required/optional and explicit nullability;
  - enum labels and exact scalar values (`1` differs from `"1"`);
  - no parameters, no accepted payload, and an explicitly empty record schema
    as distinct cases; unknown Event fields are explicitly unavailable.
- Both Workbench contracts and Scene interaction consumption use this read-only
  view. It exposes no editing callbacks, source execution, runtime state or
  live mutable definition/options arrays.
- `ComponentContractEditor.tsx` preserves trusted contract read-only behavior
  and legacy portable declaration deletion. It offers no public Action/Event
  creation/editing/execution. Empty Actions alone no longer claim portable
  activatability when unsupported Events may still remain.
- `ComponentLayerMethodInspector.tsx`, `ComponentLayerMethodCodeModal.tsx` and
  new-source template explanations use private-operation vocabulary and state
  the actual current boundary: explicit editor testing, authored canvas changes
  (not transient preview), no portable runtime execution, diagnostic-only `$emit`.
  Existing stored source is not rewritten and diagnostic outputs are not routed.
- Scene UI says operation requests are separate from Event definitions and
  that current compatibility invocation uses no arguments / no payload mapping.
  It does not add argument controls or change dispatch.
- New production-export deterministic check and browser smoke are registered in
  CI/Component Editor/Pages lanes. Existing selectors for renamed UI are updated.
  Two pre-existing unindented layer-smoke command lines are restored inside the
  relevant YAML `run` blocks so those workflows parse and execute their checks.

## Explicitly not implemented

- T2 layer scope/kind/argument validation, transient test overlay, stale-run
  fences or one-command explicit apply; existing sandbox/commit debts remain.
- T3 Scene Trigger/Effect redesign, new routing authority or payload mappings.
- T4 child Component layers, child inspectors or parent Event re-export.
- Portable public Action/Event execution or runtime private-operation execution.
- New schema/package versions, migrations, registry/runtime refactors or 3D work.
- Restoration of the removed theme-binding button or readiness UI merely to
  satisfy an obsolete browser script.

## Compatibility and migration

Scene v8, component/work codecs, public definitions, `actions`/`events`, private
`methods`, `LayerMethod` APIs, sandbox facade and persisted source stay unchanged.
No storage migration occurs. New template comments/explanations describe current
capability; they do not add host operations. Runtime Property/Attribute ownership,
trusted handler registration, legacy Scene behaviors and canonical semantics are
unchanged. Portable legacy contracts still import as drafts for explicit cleanup.

## Verification

Local environment: Linux x86_64, Node `v26.5.0`, Playwright `1.63.0`, headless
Chromium `153.0.8010.12` / Firefox `155.0`, viewport 1366×900 for T1.
Browser commands below use `SCADA_PAGES_URL=http://127.0.0.1:4173/` against
`npm run build` + `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
They are local built-worktree evidence, not deployed or exact-commit acceptance.

| Command | Outcome |
| --- | --- |
| `npx --yes tsx scripts/check-component-interaction-schema.ts` | PASS, exit 0 — order/kinds/metadata, required/optional/nullability, scalar enum identity, absent/empty payload and immutable contract consumption. |
| `npx --yes tsx scripts/check-typed-action-event-contract.ts` | PASS, exit 0 — production definition/runtime/DSL typed interaction boundary. |
| `npx --yes tsx scripts/check-preview-component-state.ts` | PASS, exit 0 — immutable separate snapshots and compiled/legacy routing isolation. |
| `npx --yes tsx scripts/check-portable-execution-boundary.ts` | PASS, exit 0 — public source rejection/migration and inert draft data. |
| `npx --yes tsx scripts/check-layer-methods.ts` | PASS, exit 0 — existing bounded QuickJS requests and failure surfaces, not T2 commit/scope acceptance. |
| `npx --yes tsx scripts/check-component-capability-consistency.ts` | PASS, exit 0 — production declarative generation/package/activation/standalone consistency; not normal browser authoring proof. |
| `npx --yes tsx scripts/check-m9a2-authoring-authority.ts` | PASS, exit 0 — separate authoring/configuration/binding authorities. |
| `npx --yes tsx scripts/check-m9b1-runtime-authority.ts` | PASS, exit 0 — separate private-rule namespaces and authored pump colors. |
| `npx --yes tsx scripts/check-m9b2-package-scene-e2e.ts` | PASS, exit 0 — package/Scene/work/standalone authority parity. |
| `npx --yes tsx scripts/check-component-authority-migration.ts` | PASS, exit 0 — existing explicit/ambiguous legacy classification. |
| `npx --yes tsx scripts/check-distributable-component-package.ts` | PASS, exit 0 — existing version/resource/capability fixtures. |
| `npx --yes tsx scripts/check-component-package-transfer.ts` | PASS, exit 0 — pure import/collision boundary. |
| `npx --yes tsx scripts/check-standalone-work-runtime.ts` | PASS, exit 0 — package-scoped runtime and explicit capabilities. |
| `npx --yes tsx scripts/check-user-component-activation.ts` | PASS, exit 0 — declarative ready activation; unsupported declarations excluded. |
| `npx --yes tsx scripts/check-scada-behavior-contract.ts` | PASS, exit 0 — existing edge/no-replay behavior. |
| `npx --yes tsx scripts/check-component-layer-navigation.ts` | PASS, exit 0 — unchanged selection/navigation model. |
| `npm run build` | PASS, exit 0 — 659 modules; main JS 915.25 kB / 298.34 kB gzip; editor lazy chunk 333.52 kB / 97.98 kB gzip. Existing >500 kB chunk warning retained; no performance acceptance. |
| `npm run lint` | PASS, exit 0 — UI primitive/token/Shell checks pass; 27 pre-existing warnings, no new warning. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — 65 deterministic checks execute in CI/lint. |
| `node --check scripts/pages-component-interaction-contract-smoke.mjs` | PASS, exit 0 — syntax only. |
| `node scripts/pages-component-interaction-contract-smoke.mjs` | PASS, exit 0 — Chromium complete T1 flow: private scope, typed draft import, read-only schemas, cleanup/undo/redo/save/reopen, Preview guards, trusted contracts and Scene requests. |
| `SCADA_BROWSER=firefox node scripts/pages-component-interaction-contract-smoke.mjs` | PASS, exit 0 — same T1 flow in Firefox. |
| `node scripts/pages-component-inspector-scope-smoke.mjs` | PASS, exit 0 — separate remembered tabs/selection, cleanup, correct persistence and Preview gates. |
| `node scripts/pages-layer-methods-smoke.mjs` | PASS, exit 0 — existing theme test/canvas update, custom source save/reload in bounded editor engine, no public Action promotion. |
| `node scripts/pages-component-package-transfer-smoke.mjs` | PASS, exit 0 — fresh-browser v2 transfer/activation and collision rejection. |
| `node scripts/pages-component-capability-consistency-smoke.mjs` | FAIL, exit 1 — 30 s timeout at removed `一键绑定声明式运行状态` button (line 45). Base script already expects it; base `src` contains no such UI. Readiness assumptions further downstream also need review. |
| `node scripts/pages-managed-svg-author-ref-smoke.mjs` | FAIL, exit 1 — 30 s timeout at obsolete `.property-contract-item` selector (line 99), before the renamed layer tab. Base script has the same selector; current compact contract rows no longer use it. The subsequent package-transfer command in that chained run did not execute; it was rerun separately and passed above. |
| `python3` + `yaml.safe_load` for changed workflows | PASS, exit 0 — all three YAML files parse and contain the new browser-check registration. One-off local check, not a new repository test. |
| `git diff --check` | PASS, exit 0 — no whitespace errors. |

Retained local captures: `artifacts/component-interaction-actions-{chromium,firefox}.png`,
`component-interaction-events-{chromium,firefox}.png` and
`component-interaction-private-{chromium,firefox}.png`. The existing layer-method
capture overwritten by its smoke was restored; unrelated prior artifacts are
not changed. No CI run, deployment, security audit or gate closeout is claimed.

## Risks and follow-up

The complete browser lanes cannot be claimed green: the two stale scripts above
remain registered and fail before their end-to-end assertions. This work updates
only their labels, not their obsolete workflow assumptions. Do not replace them
with shallow absence checks, silently skip them, or restore removed UI to make a
script green. T1 local proof does not replace declarative browser authoring or
managed-SVG authorRef acceptance. Parent PR #221 remains an explicit review/merge
dependency. No acceptance status is advanced.

## Next eligible work item

Explicitly scope a browser-fixture correction for the current accepted component
contract/authoring workflow, retaining the original capability and authorRef
assertions and collecting built/deployed evidence. After that and the parent
review dependency, T2 editor-operation ownership/transient test/atomic explicit
apply may be scoped under ADR §7; it is not started here. M10 stays at M10A.

## Browser-fixture follow-up

The failure rows and source snapshot above record the original T1 worktree.
The separately scoped `CIO-T1-BROWSER` follow-up updates those two browser
workflows and fixes a real source-mismatch raster regression found by their
pixel assertions. Its current scope, revisions/snapshot and verification are
recorded in [the browser-fixture handoff](component-input-output-t1-browser-fixtures.md).
The original failures are retained as diagnostic history, not current status.
Removed direct theme/Rule authoring and parent/deployment acceptance are still
not claimed. No gate is accepted by that follow-up.
