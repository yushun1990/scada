# Component-Level Method Configuration (组件配置 · 行为)

## Status

Implemented for review · 2026-10-01.

Dogfooding polish under the current `PLAN.md` product-polish phase. Extends
the accepted issue #209 controlled layer-methods pattern
(`docs/architecture/adr-proposal-controlled-layer-methods.md`) from the SVG
layer scope to the component scope. No new numbered milestone, no M10A
boundary change, no public Action/Event contract change.

## Problem

Issue #209 delivered per-layer private functions (behaviors tab: list, `<>`
code modal, `▶` controlled-sandbox run). The component itself had no
equivalent: the definition-page 方法 tab only showed the closed public
Action contract (`方法（未开放）` for portable user components), so a
component-level function had to be duplicated onto individual layers.

Requested: implement component-level method configuration with the same
list-style UI as the layer method list.

## Changes

- `src/component-system/visual.ts` — added `ComponentMethodDefinition`
  (same shape/limits as layer methods), `ComponentVisualDefinition.methods`
  as optional private component data, fail-closed validation inside
  `assertComponentVisualDefinition`, and deep cloning in
  `cloneComponentVisual`.
- `src/runtime/controlled-layer-method-engine.ts` — `runLayerMethod`
  accepts an optional `self` context; component methods run with
  `$self` bound to the component (`kind: 'component'`, all layers listed)
  while layer runs keep the edited layer as `$self` (backward compatible).
  Ops stay the structured whitelist (setTheme / setLayerVisible / emit /
  log); no new host capability.
- `src/features/component-library/ComponentMethodInspector.tsx` — new
  component-scope method list reusing the layer-method UI (list rows,
  `+ 新增`, code modal, run-parameters dialog, toasts). Built-in theme
  functions are offered when any managed SVG layer carries
  `scada-theme-*` classes; `setTheme` ops apply to every themed managed
  SVG layer and `setLayerVisible` ops apply across all layers.
- `src/features/component-library/ComponentLayerMethodCodeModal.tsx` —
  `layer` is now nullable so component methods can open the modal without
  a selected layer (preview falls back to the first theme-capable SVG
  layer, or the empty preview state).
- `src/features/component-library/ComponentEditorPage.tsx` — the definition-page
  tab is renamed 方法 → 行为 (`behaviors`) and now hosts **only** the component
  function list, mirroring the right-dock layer 行为 tab. The public Action
  contract card is retired from this tab; a portable user component that still
  carries legacy public Action declarations keeps a cleanup card (delete-only,
  R0 activation cleanup path) above the list. Built-in components see the same
  method list read-only instead of the trusted-contract view.
- `scripts/pages-component-inspector-scope-smoke.mjs`,
  `scripts/pages-component-capability-consistency-smoke.mjs` — tab selectors
  follow the 行为 label; the no-public-Action-creation assertions still hold
  (the list's add button is `+ 新增`, not `+ 添加方法`), the capability smoke
  now pins the method list as the tab content, and the scope smoke keeps the
  legacy-declaration cleanup flow on the renamed tab.
- `src/features/component-library/component-layer-methods.css` — the temporary
  definition-page section chrome was removed with the card retirement; all
  list/modal styles are the existing shared `component-methods-*` classes.

## Authority boundaries preserved

- Component methods are private visual data (`visual.methods`), never part
  of the public Action/Event contract; `definition.actions/events` remain
  the only public interaction contract and stay closed for portable user
  components (R0). Activation/capability checks are untouched.
- Execution goes exclusively through the lazily-loaded QuickJS controlled
  sandbox with the same limits (50 ms / 16 MiB / 512 KiB stack) and the
  structured `__op` bridge; no DOM/React/Konva/Three access, no
  `eval`/`new Function`.
- Persistence, package export/import and cloning carry `visual.methods`
  through the existing visual authorities; malformed input fails closed in
  `assertComponentVisualDefinition`.

## Verification

- `npx tsx scripts/check-layer-methods.ts` — extended with component-level
  coverage: fail-closed validation, `assertComponentVisualDefinition`
  accept/reject, deep-clone isolation, component-scoped `$self` identity
  and ops, layer-scope `$self` backward compatibility, and
  serialize/parse round-trip proving methods stay private visual data with
  empty `definition.actions/events`.
- `npx tsc -b`, `npm run build`, `npm run lint` — pass (no new warnings in
  changed files).
- `npx tsx scripts/check-distributable-component-package.ts`,
  `check-component-package-transfer.ts`,
  `check-portable-execution-boundary.ts`,
  `check-component-capability-consistency.ts`,
  `check-user-component-activation.ts` — all pass unchanged.
- Local browser proof (dev server + Playwright, same flow family as
  `pages-layer-methods-smoke.mjs`): imported a `scada-theme-base` SVG,
  opened Coding 开发 → 行为, ran the built-in `setRunning` at component
  scope (success toast), authored a parameterized `applyComponentState`
  custom function through the code modal (in-modal test run succeeded),
  ran it through the run-parameters dialog, saved, and verified persisted
  `visual.methods` with empty public actions/events; after reload the
  custom function survived and ran again. No page errors.
- Rename/simplification verification (`vite preview` + Playwright):
  `pages-component-inspector-scope-smoke.mjs` passes with the 行为 label
  (legacy-declaration cleanup flow included),
  `pages-component-capability-consistency-smoke.mjs` passes after repair
  (it had been stale on main since e090afe removed the 一键绑定 button and
  4a2258f retired the manual 可用 status select — it now proves themed SVG
  authoring exposes controlled-sandbox layer/component functions without
  portable Action/Event creation and saves a private-contract draft),
  `pages-layer-methods-smoke.mjs` and `pages-component-contract-rows-smoke.mjs`
  pass unchanged, `npx tsc -b` / `npm run lint` clean.
  Visual evidence: `artifacts/component-behaviors-tab-empty.png`,
  `artifacts/component-behaviors-tab-methods-list.png` (tab bar 属性 / 行为 /
  事件（未开放）, method-list-only body).

## Non-goals

- Runtime (preview/standalone) invocation of component methods — the same
  deferral as layer methods; portable runtime stays declarative. Wiring
  controlled functions into runtime evaluation needs its own decision.
- No public Action/Event authoring for portable user components.
- No scene-level per-instance method overrides.
