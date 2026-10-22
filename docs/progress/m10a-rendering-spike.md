# M10A isolated rendering/capability spike handoff

## Gate and authority

- Date: 2026-10-23 (Asia/Shanghai); final browser run 2026-10-22 16:06:14–16:07:13 UTC.
- Gate: `M10A` (`active`); work item: `M10A-RENDER-SPIKE`.
- Deliverable status: `implemented`. Local capability evidence exists; named target-device measurements, budget decisions and independent acceptance remain incomplete.
- Finding IDs: `R3D-004`; scoped lazy-loading evidence for `R3D-007` and check registration for `R3D-008`. This does not close their later production work.
- Architecture sections: [3D Scene Editor](../architecture/3d-scene-editor.md), renderer/runtime separation, resource authority, editor interaction, performance and “Decisions to close in M10A”; [M10A governance](../governance/m10-3d-delivery-governance.md#m10a--architecture-contract-and-technical-spike).
- Acceptance: [M10A rendering spike and measured baselines](../acceptance/m10-3d-acceptance-matrix.md#rendering-spike).
- Base: `docs/m10a-glb-resource-threat-model@e98eebd80f8839cf918bad504e4f77d239e66612` ([PR #227](https://github.com/yushun1990/scada/pull/227)), on `main@9b483b5962c1ca6fcdabda3628b96eee7cfd7aa0`. PR #227 is a resource-profile proposal, not accepted production admission.
- Tested implementation head: `ed4e4a779085784dd2b74dd038814d0af2bb96e7`, clean worktree at final local browser/bundle capture. Subsequent commits retain evidence/PLAN and correct the CI display environment; application, fixture and harness source remains unchanged. The PR records its final head and remote results.
- Branch: `spike/m10a-rendering-capabilities`; stacked on PR #227 to keep its review delta separate.

## Implemented

- [Separate experiment package](../../spikes/m10a-rendering/README.md), lockfile and build. Its `#/3d` route dynamically imports Three/R3F. The initial shell neither imports nor requests the heavy adapter or GLBs.
- Three deterministic, self-authored GLBs, pinned SHA-256 identities, structural checks and an independent pinned Khronos validator. The fixture guard copies bytes before asynchronous hashing; GLTFLoader parses the verified owned copy. Only these fixed fixtures can load.
- Real WebGL2 GLTFLoader rendering, stable logical-ID raycast picking, native-pointer translate/rotate/scale, orbit/control arbitration, one committed gesture per local undo entry and Escape cancellation.
- Production `RuntimeValueStore` and `resolveEffectiveComponentProps` feed one frozen scalar snapshot to an HTML reference and the 3D adapter. Checks observe actual Three group visibility, material color, texture and animation mixer, alongside HTML CSS. This is a limited presentation proof.
- Explicit model geometry/material/texture/ImageBitmap, mixer, controls and object-URL cleanup; stale fetch/decode fencing; visible unsupported and context-loss states; re-entry through a fresh adapter.
- Deterministic/model checks, bundle import-closure measurement, a Chromium/Firefox browser harness, and a [dedicated workflow](../../.github/workflows/m10a-rendering-spike.yml) registered for the spike and its imported host boundaries. CI retains its own run artifacts; the local artifacts below do not stand in for remote CI results.

Files/contracts changed: `spikes/m10a-rendering/**`, the dedicated workflow,
this handoff/evidence directory and the scoped PLAN pointer. No production
contract changes.

## Explicitly not implemented

- No production 3D route/work creation, Scene3D codec/persistence, AssetRepository, package/container migration, contract/presentation registry split or standalone 3D runtime.
- No arbitrary file/URL import or production resource admission. The fixed-fixture guard is not the executable malformed corpus specified in PR #227.
- No full DSL/Preview/standalone parity, Konva presentation parity or new Property authority. The HTML reference consumes the existing host's scalar effective values only.
- No accepted target hardware, performance/memory budget, GLB size/texture/node ceiling, production deployment or M10A closeout. M10B–M10G remain `not-started`.

## Compatibility and migration

Production `src/`, root `package.json`/lockfile, Scene v8, Component Package v2,
Work Package v1 and PR #226 schema drafts are unchanged. The nested dependency
graph is not imported by the product. All 20 product HTML/JS/CSS/WASM build
files are byte-identical to the recorded base, totaling 2,049,988 bytes. This
is a build comparison, not a new production UI/browser acceptance run.

The isolated package pins Three `0.186.1`, R3F `9.8.2`, React/ReactDOM `19.2.8`,
Vite `8.3.5`, TypeScript `6.0.2`, Playwright `1.63.0`, tsx `4.23.15` and
`gltf-validator@2.0.0-dev.3.10`. These are measured experimental versions,
not a production dependency decision. Root dependencies retain their existing
versions. No persisted artifact needs migration or rollback; discard the
experiment directory/workflow to remove the experiment.

## Verification

Local tools: Node `v22.23.2`, npm `12.0.1`; Linux
`7.2.11-200.fc44.x86_64`, Intel i7-8550U, 8 logical processors,
16,637,739,008 reported memory bytes. Both browser runs were headless,
1280×900, DPR 1. No dedicated benchmark isolation or forced GC was used.

| Command / check | Exact outcome |
| --- | --- |
| `npm --prefix spikes/m10a-rendering run check:fixtures` | PASS, exit 0 — all 3 fixtures regenerate identically; each has 0 Khronos errors/warnings/infos and 0 external resolver attempts. [Report](m10a-rendering-spike-evidence/fixtures.json). |
| `npm --prefix spikes/m10a-rendering run check:model` | PASS, exit 0 — actual host snapshot behavior, gesture commit/cancel boundaries, hash/size/identity rejection and asynchronous caller-buffer mutation regression. |
| `npm --prefix spikes/m10a-rendering run build` | PASS, exit 0 — TypeScript and Vite build, 44 modules; heavy-chunk size warning retained. |
| `node spikes/m10a-rendering/scripts/bundle-report.mjs --out /tmp/scada-m10a-bundle-final.json` | PASS, exit 0 — Three/R3F absent from the initial static import closure; retained [bundle report](m10a-rendering-spike-evidence/spike-bundle.json). |
| `npm run build` | PASS, exit 0 — 661 modules; existing >500 kB warning. [Log](m10a-rendering-spike-evidence/product-build.log). |
| `node spikes/m10a-rendering/scripts/bundle-report.mjs --root --dist dist --out /tmp/scada-m10a-root-after.json --compare /tmp/scada-m10a-root-before.json` | PASS, exit 0 — 20/20 product files identical in path, bytes, gzip bytes and SHA-256. [Before](m10a-rendering-spike-evidence/root-before.json), [after](m10a-rendering-spike-evidence/root-after.json). |
| `npm run lint` | PASS, exit 0 — 0 errors, 25 existing warnings; primitive/token/StudioShell audits pass. [Log](m10a-rendering-spike-evidence/product-lint.log). |
| `node scripts/check-model-check-registration.mjs` | PASS, exit 0 — 67 existing root checks registered; nested experiment checks run in their dedicated workflow. |
| `npx --offline tsx scripts/check-m10a-scene3d-contracts.ts` | PASS, exit 0 — existing schema/projection draft invariants. |
| `npx --offline tsx scripts/check-preview-component-state.ts` | PASS, exit 0 — existing immutable Attribute/effective Property boundary. |
| `npm audit --prefix spikes/m10a-rendering --json` | PASS, exit 0 — 0 reported vulnerabilities at capture; [audit snapshot](m10a-rendering-spike-evidence/dependency-audit.json). This is not security acceptance. |
| Built preview plus `node spikes/m10a-rendering/scripts/browser.mjs --base-url http://127.0.0.1:4175 --output-dir /tmp/scada-m10a-browser-final` | PASS, exit 0 — Chromium 20/20 and Firefox 20/20; 0 failed or missing required capability checks. [Exact-head raw report and relative screenshot paths](m10a-rendering-spike-evidence/browser/report.json). |
| `git diff --cached --check` before implementation commit | PASS, exit 0. |
| Handoff file-target/artifact digest check | PASS, exit 0 — 16 relative file targets exist; all 24 retained artifacts match the manifest byte lengths and SHA-256 hashes. |

The initial [CI run at `682fe73`](https://github.com/yushun1990/scada/actions/runs/39812354119)
passed install, fixture/model/build/bundle checks and Chromium 20/20, but exited
2 because Firefox reported `WEBGL2_UNSUPPORTED` without an X display. Its
report retains 24 passed checks and 1 required capability `not-verified`; it is
not a browser pass. The workflow now keeps Chromium headless and runs Firefox
headed under Xvfb, as an explicit separate environment following
[Playwright's Linux CI guidance](https://playwright.dev/docs/ci#running-headed).
Both lanes retain separate reports and still fail on missing native capability.
This changes no assertion or application behavior; the PR records rerun status.

The baseline capture had only untracked `spikes/` in its worktree; tracked
product source and dependencies were unchanged from base. The final report
retains source/build hashes and an empty worktree at the tested implementation
head. All raw files are copied without rewriting; [artifact manifest](m10a-rendering-spike-evidence/manifest.json)
records their byte lengths and SHA-256 digests. The owned preview was stopped
after the final run. The raw Vite log preserves its reporter's trailing space;
final whitespace checking excludes the two retained `.log` artifacts.

### Capability and interaction results

| Browser | Native renderer evidence | Capability checks |
| --- | --- | --- |
| Chromium `153.0.8010.12` | WebGL2; ANGLE Vulkan **SwiftShader software renderer** | 20 passed |
| Firefox `155.0` | WebGL2; privacy-masked `Intel(R) HD Graphics 400, or similar`; physical GPU **unverified** | 20 passed |

Each lane covers lazy entry, visible textured rendering, repeated load,
snapshot-driven presentation, actual-pointer selection/three transforms/undo/
cancel, reference measurement, three unload/reload cycles, delayed fetch after
unload, modified hash rejection before parsing, context loss and fresh re-entry,
delayed publication after context loss, late decoded ImageBitmap cleanup,
texture-decode failure cleanup, injected unsupported UI and no hidden network
or unexpected page errors. Injection results are labelled separately from native
capability. Examples: [Chromium textured render](m10a-rendering-spike-evidence/browser/chromium-native-ready.png),
[Firefox reference scene](m10a-rendering-spike-evidence/browser/firefox-reference-scene.png).

### Fixed fixtures and bundle sizes

| Fixture | Bytes | Contents | SHA-256 |
| --- | ---: | --- | --- |
| triangle | 1,140 | 1 triangle | `65b7d7be579ede8f57eff280512f382423adaabc41b38ee8874fb6d4faeee1b8` |
| textured | 2,856 | cube, embedded 2×2 PNG, 2-second clip | `1e0cec9a6a136afa3e650bc102b552311c30ced7d0a1ba7be0dd2e6c54c96f5e` |
| reference | 28,004 | 200 cubes, 2,400 triangles, 200 draw calls | `26dd63a73f92a2d0c3978b589c065ee66a555daa71276979b79094a271c7a44b` |

| Build artifact | Raw bytes | gzip level 9 bytes |
| --- | ---: | ---: |
| Product initial JS `index-CUXv6Wp0.js`, before and after | 915,443 | 295,673 |
| Isolated experiment initial JS `index-DQI4vTF6.js` | 201,446 | 63,141 |
| Isolated lazy JS `ThreeAdapter-MQUr2hgW.js` | 1,016,201 | 267,179 |

The experiment's initial shell is separate from the product. These numbers are
not an integrated product size forecast. Vite console gzip uses different
compression settings; the table uses the report script's explicit level 9.

### Observed timing and resource counts

First model load means the textured fixture in a new non-persistent browser
context after shell load; OS/disk caches are not purged. Repeated load uses the
same process with warm module/decoder state. Playwright routing disables HTTP
cache in both cases. Model total measures fetch/hash/parse/first frame;
route wall time additionally includes entry/chunk/React/browser orchestration.
These are single observations, not statistically established limits.

| Browser | First model total / parse (ms) | Repeated model total / parse (ms) | First route / repeated wall (ms) |
| --- | ---: | ---: | ---: |
| Chromium | 74.6 / 12.8 | 28.0 / 4.1 | 651.6 / 152.6 |
| Firefox | 175.0 / 16.0 | 109.0 / 10.0 | 1,240.9 / 190.2 |

The reference scene uses 180 requestAnimationFrame samples per phase. The
table reports **scheduler intervals**, not GPU duration, CPU render time or
human input latency. Orbit/transform measurements use scripted motion;
native-pointer correctness is checked separately.

| Browser | Phase | p50 / p95 / p99 (ms) | Rendered frames |
| --- | --- | ---: | ---: |
| Chromium | idle | 16.7 / 16.8 / 17.6 | 0 |
| Chromium | orbit | 54.0 / 80.5 / 117.1 | 180 |
| Chromium | transform | 37.6 / 49.7 / 67.9 | 180 |
| Firefox | idle | 17.0 / 18.0 / 18.0 | 0 |
| Firefox | orbit | 17.0 / 18.0 / 23.0 | 180 |
| Firefox | transform | 17.0 / 19.0 / 20.0 | 180 |

For each of three textured-model unload cycles, both browsers return
geometry/texture/program counts from 1/2/1 to 0/0/0, with one model texture and
ImageBitmap released, zero owned object URLs, and the renderer-owned `DFG_LUT`
released separately. Idle demand rendering performs no model renders in the
measurement phase. Chromium reports a coarse 10,000,000-byte JS heap before
entry and after unload; Firefox does not expose this counter. Neither result
proves total native/GPU memory usage or absence of process-wide leaks.

## Risks and follow-up

- The fixed tiny assets do not validate candidate 32 MiB/4,096-node/texture ceilings, malicious inputs, decoder peak memory, multi-viewport ownership or long-running soak behavior. No numeric performance budget is accepted from these samples.
- The tested renderer's embedded image loader can swallow a decode failure. The experiment's LoadingManager error fence rejects the result before publication and revokes its owned blob URL; injected decode failure tests this path. A future production importer still needs its own accepted admission/rollback proof.
- Asynchronous hash validation now parses an owned immutable byte snapshot. Context loss invalidates pending generations and aborts fetch; a non-interruptible decode may still finish and must be disposed without publication. Both failure paths have direct regression evidence.
- Three `0.186.1` retains a PBR `DFG_LUT` texture outside model traversal. This one-renderer experiment captures the texture through `onBeforeCompile` uniforms and disposes it after the final model. Do not promote this version-specific observation into a shared renderer/cache lifecycle contract.
- Discard the shell, local transform history and test bridge after M10A decisions. Later gates must implement accepted domain/runtime contracts and production-export tests; copying this spike into the editor is not authorized.
- The resource profile, artifact container, decoder/renderer versions, target hardware and quantitative budgets still require an accepted M10A decision. Local author validation and remote CI are not independent approval.

## Next eligible work item

Review the resource proposal and this isolated spike, then define named target
hardware and boundary-sized fixtures for a separate M10A measurement tranche.
Use that evidence and the negative-corpus plan to resolve resource/container/
version/capability/budget decisions in the M10A closeout. This PR does not start
that tranche, accept M10A or activate M10B.
