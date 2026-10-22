# M10A GLB/resource threat-model proposal handoff

## Gate and authority

- Date: 2026-10-22.
- Gate: `M10A` (`active`).
- Work item: `M10A-RESOURCE`; finding: `R3D-004`. `R3D-006` implementation remains M10B work.
- Deliverable status: `implemented` — documentation proposal and fixture specification only; resource-profile acceptance and executable ingest/corpus evidence remain incomplete.
- Architecture sections: [3D Scene Editor](../architecture/3d-scene-editor.md), “Resource authority”, “Stable imported targets”, “Versioning and migration”, “Decisions to close in M10A”.
- Acceptance: [M10A Resource threat model](../acceptance/m10-3d-acceptance-matrix.md#resource-threat-model); this is one input to that row, not the gate closeout.
- Base revision: `main@9b483b5962c1ca6fcdabda3628b96eee7cfd7aa0` (PR #226).
- Head revision for the proposal, corpus and PLAN changes verified here: `1416a2bc330db2ef2de8f66a1bb21812693ee840`. The subsequent handoff commit adds this record and an explicit APNG variant to N17; the PR records its final head.
- Branch: `docs/m10a-glb-resource-threat-model`.

## Implemented

- [Resource decision proposal](../architecture/adr-m10a-glb-resource-profile.md): a GLB 2.0 core/embedded PNG-JPEG candidate profile, empty extension/extra-decoder allowlist, MIME/byte checks, no authored URI resolution, exact SHA-256 resource closure, staged validation and atomic failure obligations.
- Candidate ceilings for encoded/decoded bytes, nodes/primitives/accessors/textures/animation, session reservations and concurrent jobs. Every value is explicitly unmeasured and awaits M10A spike evidence before acceptance.
- [Corpus contract](../acceptance/m10a-glb-resource-corpus.md): six positive-control families and 29 negative/failure families, with proposed diagnostic stages/codes, identity mutation rules and side-effect assertions. These are recipes, not binary fixtures or executed security checks.
- `PLAN.md`: records merged PR #226 and links this active proposal without changing any gate status.
- Read-only parallel review corrected reservation-before-copy, budget-before-expansion, and non-interruptible decode cancellation accounting. No independent acceptance or remote review verdict is claimed.

## Explicitly not implemented

- No GLB parser/admission implementation, fixture binaries/generator, image decoding, network interception, rendering/capability spike or numerical performance measurements.
- No production Scene3D persistence, AssetRepository, transport/container, Component Package migration, runtime/registry split or 3D UI.
- No Three/R3F or other dependency added; no CI workflow change, browser/deployment claim or M10A closeout.

## Compatibility and migration

Only Markdown files change. Scene v8, Component Package v2, Work Package v1,
current 2D resource handling and the isolated PR #226 schema drafts are
unchanged. The proposal explicitly records that manifest-shape validation does
not verify real resource bytes or a GLB admission policy. Its stricter candidate
profile is not retroactively applied to current persisted artifacts.

## Verification

Local environment: Node `v22.23.2`, npm `12.0.1`, installed Vite `8.3.0`;
dependencies were not installed or updated by this work.

| Command / check | Exact outcome |
| --- | --- |
| `git fetch origin --prune`; `git switch main`; `git pull --ff-only origin main` | PASS — clean worktree; main fast-forwarded from `5d57856348abe2d7574302f58535555261015f16` to `9b483b5962c1ca6fcdabda3628b96eee7cfd7aa0`; new branch starts at that base. |
| `npx --offline tsx scripts/check-m10a-scene3d-contracts.ts` | PASS, exit 0 — Scene3D invariants, WorkContent discrimination, Scene v8 purity, Package v3 invariants and projection parity. This is the existing structural check, not GLB security evidence. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — 67 checks execute in CI or its lint command. No new executable check is claimed. |
| `npm run build` | PASS, exit 0 — 661 modules transformed; main `index-CUXv6Wp0.js` 915.44 kB / 298.39 kB gzip. Existing >500 kB chunk warning remains. Not a new measured 3D baseline. |
| `npm run lint` | PASS, exit 0 — 25 existing warnings, no errors; UI primitive/token/StudioShell audits pass. |
| `git diff --cached --check` before the content commit | PASS, exit 0 — no whitespace errors. |
| Ad hoc local Markdown target check over PLAN/proposal/corpus | PASS, exit 0 — 46 relative file targets exist. Does not validate anchor rendering or external URLs and is not an admission test. |

The checks ran with these documentation changes in the worktree. Subsequent
review corrections touched prose only. No product-code test failure remains;
no browser, codec, decoder, migration or measured-limit pass is inferred.

## Risks and follow-up

- The profile deliberately excludes otherwise valid glTF features; its
  compatibility cost needs review against named reference assets.
- All numerical ceilings need boundary fixtures and actual browser/device
  measurement. Memory accounting is not a proof of native decoder/GPU usage.
- The artifact container, exact renderer versions and context-recovery policy
  remain open M10A decisions. Native decode cancellation limitations must be
  observed, not assumed away.
- The published glTF baseline is pinned in the proposal. Moving upstream
  specifications/validator behavior must not silently alter fixture expectations.
- Actual GLB admission and repository rollback must be proven at production
  exports in M10B after its gate is activated.

## Next eligible work item

Review this resource-profile proposal, then run the remaining isolated M10A
rendering/capability and measurement work using concrete hashed fixtures:
Chromium/Firefox, lazy loading, no hidden fetch, picking/transforms, shared
Property-driven presentation, disposal and context failure. Resolve candidate
ceilings/container/versions in the M10A closeout. This handoff does not start
that spike or activate M10B.
