# M10A boundary fixture and measurement handoff

## Gate and authority

- Date: 2026-10-23 (Asia/Shanghai).
- Gate: `M10A` (`active`); work item: `M10A-BOUNDARY-MEASURE`; findings: `R3D-004`, measurement/check traceability for `R3D-007/008`.
- Deliverable: `implemented` — fixed scale fixtures, repeatable observations and scoped failure cleanup. Target-device/budget acceptance remains incomplete.
- Authority: [3D architecture, Rendering and performance](../architecture/3d-scene-editor.md#rendering-and-performance), [M10A governance](../governance/m10-3d-delivery-governance.md#m10a--architecture-contract-and-technical-spike), [M10A measured baselines](../acceptance/m10-3d-acceptance-matrix.md#measured-baselines), [candidate resource ceilings](../architecture/adr-m10a-glb-resource-profile.md#candidate-quantitative-ceilings).
- Base: `main@77b588a715082d5e5ad3b175897dca36b224f118`, after PR #227 (`dda528a`) and PR #228 merged. Their merges did not accept M10A or the candidate resource limits.
- Tested implementation head: `f2ad3374ada769c24d93f7c81118a93496f89102`. Final local regression and measurement reports captured this clean head; matrix start/end revisions and worktrees agree. The following commit adds evidence and PLAN/handoff only; the PR records its final head.
- Branch: `spike/m10a-boundary-measurements`.
- User-selected scope: use the current development machine for an exploratory baseline; identify a production/field target later. The development host is not silently designated as the accepted target device.

## Implemented

- Five deterministic self-authored GLB recipes with committed identities: 1,000/4,096 total input nodes sharing one cube mesh, and 1,024/2,048/4,096-square images on a cube. The node ceiling includes its root. Large generated files remain ignored and total 3,547,880 bytes; generation checks the committed manifest unless an explicit update flag is used.
- Independent pinned Khronos conformance plus bounded fixture checks: image CRC/scanlines, source geometry reuse, node counts/IDs, actual bytes and hashes, mip sampler and analytical RGBA8 estimates. Existing three fixture bytes remain unchanged.
- A fixed catalog connects these known identities to the existing experiment adapter. No arbitrary path, URI or input can enter the loader through the catalog.
- Actual loaded-resource observations count mesh instances, unique geometries, unique CPU attribute/index backing buffers, decoded image dimensions and texture configurations. Shared geometry is not multiplied by its instances; renderer-owned resources remain separately observable.
- A new measurement runner uses fresh browser processes per case/repetition, serial execution, bounded attempt time, exact source/build/fixture identity and a complete expected-attempt matrix. It records first target/repeated load, raw rAF intervals, heap availability, resource counts, errors and screenshots. Output refuses to overwrite an existing report; uncertain cleanup stops further attempts.
- Texture dimensions above the device's reported maximum are rejected before fetching target bytes. The adapter checks first-render API errors and releases an already attached model on failure. Browser regressions inject a smaller device limit and a one-shot `OUT_OF_MEMORY` return after a real draw to verify these branches without causing actual resource exhaustion.
- The existing CI workflow runs generator/conformance/model checks, all capability regressions, and a small node/texture measurement matrix in separate Chromium and Firefox lanes.

Changed surfaces: `spikes/m10a-rendering/` recipes/catalog/adapter/observations/
checks/runner/README, `.github/workflows/m10a-rendering-spike.yml`, the PLAN
pointer and this handoff/evidence directory. [Reproduction commands and method](../../spikes/m10a-rendering/README.md#boundary-observations)
live with the experiment.

## Explicitly not implemented

- No production 3D UI, Scene3D persistence, AssetRepository, package/container format, registry split, new Property runtime or arbitrary GLB admission.
- No executable hostile/malformed-input admission corpus, actual OOM threshold experiment, process/GPU memory bound, soak acceptance or deployment.
- No accepted target device or universal resource/performance budget. No M10A closeout; M10B–M10G remain `not-started`.

## Compatibility and migration

Production source, root dependency files and the nested dependency lockfile are
unchanged. Scene v8 and current package contracts require no migration. All 20
product HTML/JS/CSS/WASM outputs match the base byte-for-byte, totaling
2,049,988 bytes. This does not assert a new production-browser acceptance run.

The isolated initial JS remains 201,446 bytes. Its lazy adapter is now
1,025,047 bytes, up 8,846 bytes from PR #228's 1,016,201-byte prototype; the
catalog/observation additions remain outside the initial import closure.
Generated GLBs are served only when explicitly generated and requested; they
are not added to the product build.

## Verification

| Command / check | Exact outcome |
| --- | --- |
| `git fetch origin --prune`; `git switch main`; `git pull --ff-only origin main` | PASS — clean main advanced from `9b483b5` to `77b588a`; new branch starts there. |
| `npm --prefix spikes/m10a-rendering run fixtures:boundaries` | PASS — 5 fixed inputs generated; committed manifest verified. |
| `node spikes/m10a-rendering/scripts/check-boundary-fixtures.mjs` | PASS, exit 0 — reproducibility and actual byte/shape checks; all 5 have 0 Khronos errors/warnings/infos and 0 external resolver attempts. [Report](m10a-boundary-measurements-evidence/fixtures.json). |
| `node spikes/m10a-rendering/scripts/check-fixtures.mjs` | PASS, exit 0 — the original 3 fixtures are unchanged and conformant. [Report](m10a-boundary-measurements-evidence/original-fixtures.json). |
| `npm --prefix spikes/m10a-rendering run check:model` | PASS, exit 0 — production-resolved shared snapshot, gesture helpers, all 8 exact-byte fixtures/mutation rejection and actual shared-buffer resource observation. |
| `npm --prefix spikes/m10a-rendering run build` | PASS, exit 0 — TypeScript and Vite, 47 modules; heavy lazy-chunk warning retained. |
| `node spikes/m10a-rendering/scripts/bundle-report.mjs --out /tmp/scada-m10a-boundary-bundle.json` | PASS, exit 0 — Three/R3F absent from initial static import closure. [Report](m10a-boundary-measurements-evidence/spike-bundle.json). |
| `npm run build` and root bundle report with `--root --dist dist --compare /tmp/scada-m10a-boundary-root-before.json` | PASS, exit 0 — 661 modules; existing chunk warning; all 20 product outputs unchanged. [Before](m10a-boundary-measurements-evidence/root-before.json), [after](m10a-boundary-measurements-evidence/root-after.json). |
| `npm run lint` | PASS, exit 0 — 0 errors, 25 existing warnings; UI primitive/token/StudioShell audits pass. |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — 67 existing root checks; nested experiment checks are separately registered in the spike workflow. |
| `npx --offline tsx scripts/check-m10a-scene3d-contracts.ts`; `npx --offline tsx scripts/check-preview-component-state.ts` | PASS, exit 0 — existing schema/projection and immutable Attribute/effective Property checks. Production files are unchanged at the tested head. |
| `node spikes/m10a-rendering/scripts/browser.mjs --output-dir /tmp/scada-m10a-boundary-regression-final` against built preview | PASS, exit 0 — 22 Chromium + 22 Firefox checks, 0 failed/required-not-verified. [Raw report](m10a-boundary-measurements-evidence/regression/report.json). |
| `node spikes/m10a-rendering/scripts/measure-boundaries.mjs --screenshots --output-dir /tmp/scada-m10a-boundary-matrix-final` | PASS, exit 0 — 5 cases × 2 browsers × 3 repetitions = 30 complete attempts, 0 failed/required-not-verified; 60 rAF samples per phase per attempt. [Raw matrix](m10a-boundary-measurements-evidence/matrix/report.json). |
| `git diff --cached --check` before implementation commit | PASS, exit 0. |
| Source/build/evidence identity check | PASS — matrix's 34 source/generated-input and 14 built-file hashes match; retained artifacts are indexed by [manifest](m10a-boundary-measurements-evidence/manifest.json). |

The root baseline report includes the in-progress isolated files in worktree
status; tracked product source was identical to main. The final source/build,
regression and matrix reports capture the committed implementation. Raw JSON
and screenshots are copied unchanged; [summary.json](m10a-boundary-measurements-evidence/summary.json)
is explicitly derived from the raw matrix and records its source digest.
The owned local preview was stopped after the run. Remote CI is recorded on the
PR separately and is not inferred from these local results.

### Environment and interpretation

Matrix run: 2026-10-22 16:42:47–16:48:43 UTC. Host: Linux
`7.2.11-200.fc44.x86_64`, Intel i7-8550U, 8 logical processors,
16,637,739,008 reported memory bytes; Node `v22.23.2`, Playwright `1.63.0`.
Both local browsers were headless, 1280×900, DPR 1, with `DISPLAY=:0`.

| Browser | Observed graphics context | MAX_TEXTURE_SIZE |
| --- | --- | ---: |
| Chromium `153.0.8010.12` | ANGLE/Vulkan SwiftShader, software rendering | 8,192 |
| Firefox `155.0` | Privacy-masked `Intel(R) HD Graphics 400, or similar`; physical GPU unverified | 8,192 |

Each attempt warms the existing shell/renderer/decoder with the normal small
textured fixture, unloads it, and only then loads its target. The table's
“first” is the first **target** load after that bootstrap, not a fully cold app
load. HTTP cache is disabled by request interception; OS caches are not purged.
Load totals include fetch/hash/parse/CPU render submission/error checking, not
GPU completion. rAF intervals measure scheduler cadence during scripted
motion, not GPU/CPU render duration or native pointer latency.

### Measured observations

Each row reports medians across its **three independent attempts**. The last
column takes the median of each attempt's p95; samples are not pooled into a
new percentile. Every phase has 60 samples, so p99 is only the maximum observed
interval in that small sample. Ranges remain in the derived summary and every
raw sample remains in the matrix. This is one uncontrolled development host,
without forced GC or statistical tail-confidence claims.

| Browser | Fixture | First / repeated target total (ms) | Idle / orbit / transform p95 (ms) |
| --- | --- | ---: | ---: |
| Chromium | nodes-1000 | 74.0 / 63.2 | 17.0 / 47.9 / 41.0 |
| Chromium | nodes-4096 | 313.2 / 281.9 | 16.9 / 326.8 / 250.0 |
| Chromium | texture-1024 | 72.2 / 56.7 | 16.8 / 24.1 / 23.0 |
| Chromium | texture-2048 | 316.0 / 225.9 | 16.9 / 22.8 / 29.7 |
| Chromium | texture-4096 | 489.5 / 445.1 | 16.9 / 33.1 / 32.9 |
| Firefox | nodes-1000 | 606.0 / 410.0 | 18.0 / 23.0 / 26.0 |
| Firefox | nodes-4096 | 627.0 / 528.0 | 18.0 / 34.0 / 40.0 |
| Firefox | texture-1024 | 59.0 / 59.0 | 18.0 / 18.0 / 18.0 |
| Firefox | texture-2048 | 159.0 / 144.0 | 18.0 / 18.0 / 18.0 |
| Firefox | texture-4096 | 258.0 / 244.0 | 18.0 / 18.0 / 18.0 |

All 30 final unloads return geometry/texture/program counters to zero and leave
zero owned object URLs. Shared node cases observe one 648-byte CPU geometry
backing set despite 999/4,095 mesh instances. Texture cases observe one 840-byte
geometry backing set, one decoded image of its exact declared dimensions and
one RGBA/unsigned-byte texture with mipmapping enabled. The renderer also owns
its separately released `DFG_LUT`. Heap availability/estimates are retained;
Firefox exposes no JS heap counter. Counters are not process/GPU-memory proof.

Visual spot checks: [Chromium 4,096-node input](m10a-boundary-measurements-evidence/matrix/chromium-nodes-4096-1.png)
and [Firefox 4,096-square texture](m10a-boundary-measurements-evidence/matrix/firefox-texture-4096-1.png).

### Candidate limit coverage

| Candidate surface | This tranche establishes | Still unresolved |
| --- | --- | --- |
| 4,096 input nodes | Exact count reached with a shallow hierarchy, one shared mesh/material and 4,095 instances | Unique geometries/materials, hierarchy depth 64, representative industrial models and accepted interaction budget |
| 4,096-square / 16,777,216 pixels | Exact decoded dimensions and mip configuration observed on both contexts; capability guard tested | Decoder peak/native memory and other formats/content patterns |
| 64 MiB image / mip upload estimates | Analytical 67,108,864 RGBA8 bytes and 89,478,484 bytes including 13 mip levels for one image | Actual native/GPU allocation; 128 MiB image and 192 MiB texture aggregates |
| Remaining encoded/expanded/session limits | No coverage claimed | 32 MiB GLB, 2 MiB JSON, 64 MiB geometry/animation, 512 MiB live session, other counts and malformed-input rejection |

## Risks and follow-up

- The measured software-rendered 4,096-node scene has substantial movement cadence cost. Loading that input successfully does not set an acceptable visible-node/draw-call interaction budget. Different browser backends and masked driver strings prevent a physical-GPU comparison.
- The five synthetic models isolate two scale dimensions. They do not cover realistic geometry/material diversity, all candidate limits, decoder working memory or hostile bytes. Existing resource-profile ceilings remain candidates.
- First-render error detection and injected `OUT_OF_MEMORY` cleanup prove a failure branch, not real memory-exhaustion tolerance or GPU completion. Cleanup counters do not qualify a multi-viewport/shared-cache lifecycle.
- CI runs only two smaller cases once per browser with 30 samples. Its purpose is reproducibility/lifecycle regression, not reproducing or accepting the full development-machine timing matrix.
- Preserve the reports as historical measurements. Reruns need new output locations/revisions; later target hardware must be explicitly named before accepting budgets.

## Next eligible work item

Prepare the remaining M10A artifact-container decision proposal and a limit-by-
limit evidence/decision ledger, using the measured node/image observations
without declaring unmeasured ceilings safe. A separate target-device and
remaining-boundary tranche is still required before M10A closeout. This PR does
not start that proposal, freeze budgets, accept M10A or activate M10B.
