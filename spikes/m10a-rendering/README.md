# M10A isolated rendering experiment

This is a disposable capability and measurement harness, separate from the
SCADA application. It follows the accepted M10A spike authority and experiments
with the resource-profile proposal in PR #227. Neither that proposal nor this
experiment closes M10A or activates M10B.

The production entry point, dependencies, Scene v8, storage, registry and
Preview/standalone paths do not import this directory. The spike has its own
package and lockfile. Three/R3F load only at its 3D route boundary.

## Run and reproduce

Run from the repository root with Node 22 (recorded local environment:
22.23.2). The root install supplies existing production types imported by the
spike; the nested install supplies the experimental renderer and test tools.

```sh
npm ci
npm ci --prefix spikes/m10a-rendering
npm --prefix spikes/m10a-rendering run check:fixtures
npm --prefix spikes/m10a-rendering run check:model
npm --prefix spikes/m10a-rendering run build
npm --prefix spikes/m10a-rendering run report:bundle -- --out artifacts/bundle.json
npm --prefix spikes/m10a-rendering run preview
```

Open `http://127.0.0.1:4175/`. The preview command is foreground-owned; Ctrl-C
stops it. In another terminal, run the built-page browser checks:

```sh
npm --prefix spikes/m10a-rendering exec -- playwright install chromium firefox
npm --prefix spikes/m10a-rendering run check:browser -- --base-url http://127.0.0.1:4175/ --output-dir artifacts/browser
```

The harness runs Chromium and Firefox sequentially, retains failures and
screenshots, and records exact revision, worktree state, source/build hashes,
browser versions and hardware information. `--browser chromium` or
`--browser firefox` narrows the lane; `--headed` is an explicit separate
environment. Missing native capability is recorded as `not-verified`, never
as a successful render. An injected unsupported path tests the error UI only.

The dedicated `M10A Isolated Rendering Spike` workflow runs the fixture/model,
build/bundle and browser checks. CI software-rendering results are experiment
evidence, not named-device performance acceptance.

## Fixed inputs and runtime boundary

`scripts/fixtures.mjs` generates three original project fixtures: one triangle,
one cube with an embedded 2×2 PNG and rotation clip, and a 200-cube reference
scene. Their exact bytes and SHA-256 identities are checked in. Regeneration is
explicit (`npm --prefix spikes/m10a-rendering run fixtures`); normal checks
require byte-for-byte reproducibility and a pinned independent Khronos
conformance report.

There is no file picker, arbitrary URL or portable package import. The renderer
loads only these fixed identities. Its byte guard is an experimental fixture
gate, not the future production GLB validator, resource corpus, AssetRepository
or safe import capability.

The host imports the production `RuntimeValueStore` and
`resolveEffectiveComponentProps`. The HTML reference and 3D adapter consume one
frozen effective snapshot. This establishes scalar presentation behavior for
visibility, color and animation. It does not establish canonical DSL wiring,
full Preview/standalone parity or a second runtime contract.

Transform gestures use local experiment history. Pointer movement is transient;
release produces one command, Escape restores the starting transform and Undo
reverts one committed command. Nothing is written to a Scene document, database
or package. Picking maps to the fixed logical fixture ID, not a Three UUID.

## Measurement interpretation

The browser harness distinguishes actual pointer-flow assertions from scripted
orbit/transform probes. Frame percentiles describe requestAnimationFrame
scheduler intervals, not GPU timings or isolated render duration. Idle demand
rendering records the number of renders separately. The first fixture load is
in a new browser context; repeated loads are warm-process parses with HTTP
cache disabled by request interception, not a claimed warm HTTP-cache benchmark.

JS heap values are browser estimates without forced collection; unavailable
counters stay unavailable. Renderer-owned internal resources and model-owned
resources must be distinguished in disposal evidence. Neither flat counters nor
these small fixtures establish total native/GPU memory safety or the candidate
32 MiB/4,096-node/texture limits from PR #227.

Reports must retain the exact fixture and environment rather than turn one
machine's results into universal FPS/memory budgets. Production 2D before/after
build comparison is a separate byte-identity check; the spike bundle is not
added to the product build.

## Disposal and later work

Discard this shell, local gesture history and test bridge after the decisions
are recorded. Later gates must implement their own accepted contracts and test
production exports. The useful outputs are fixed fixture recipes, dependency
and lazy-loading observations, renderer lifecycle findings, browser capability
results and reproducible measurement commands.

Still required for M10A closeout: measured boundary-sized fixtures on named
target hardware, resource-profile/container decisions, an executable malformed
corpus at the appropriate boundary, and an accepted budget/capability decision.
This experiment does not start canonical 3D authoring, storage migration or
package-runtime integration.
