# Issue 209: Component Editor SVG Interaction Optimization

## Status

Implemented for review · 2026-09-27 · issue #209 (sub-items 1–2 and the
declarative part of 3; authored-function execution split into an ADR
proposal).

Base: `main@af5f077`. Product polish under the current `PLAN.md`
product-polish phase, driven by an open issue. No M10A boundary change.

## Sub-item 1 — 属性看板移除「资源」组（SVG 图层）

The SVG layer's properties panel no longer renders a standalone 「资源」
group. The `ComponentVisualAssetImportControl` (替换文件) moved into the
style inspector's SVG branch, directly above the SVG group, so the accepted
UX1 Palette → Navigator/Canvas → Inspector replacement authority keeps
working from one consolidated place. Image layers keep their 「资源」 group
(替换文件 + 资源引用) unchanged.

- `ComponentVisualTreeEditor.tsx` — the 资源 group is now image-only.
- `ComponentVisualStyleInspector.tsx` — SVG branch mounts the replacement
  control; new `onSelectionChange` prop.
- `ComponentEditorPage.tsx` — passes `selectLayer` through.
- `scripts/pages-svg-import-compatibility-smoke.mjs` — replacement-control
  locator rescoped to `.component-layer-inspector-body`.

## Sub-item 2 — 自动识别 SVG 属性并在 SVG 组中列出

New shared helper `component-svg-property-detection.ts`
(`detectSvgClasses` / `isSvgThemeClassName`), extracted from the marking
workbench's inline detection so both surfaces share one implementation. The
SVG inspector group now renders a 「检测到的 SVG 属性」 block listing, with
zero authoring required:

- element count and detected CSS-class count;
- one row per class: name, usage count, theme badge for `scada-theme-*`,
  and up to four initial-fill swatches (+N overflow);
- empty-state guidance when no classes exist;
- clicking a row opens the source/marking workbench.

## Sub-item 3 — 行为看板 SVG 函数（合规部分）

The behavior panel keeps its declarations-only contract
(`data-portable-action-execution="disabled"`): non-SVG layers get the
"no layer-specific behavior" notice, SVG layers get the declarative theme
"functions". The separate 主题外观预览 button grid was folded into the
可绑定主题状态 list — each state row now carries its own `▶` run-preview
button (applies that theme state to the canvas layer via
`applyThemeToManagedSvgDocument`, a pure document transform — no script
execution), with the active state highlighted; the preview section keeps
only the 默认原色 reset.

### Not implemented — authored function code (`<>` edit + arbitrary run)

PR #198's implementation stored authored JavaScript on
`definition.actions[].implementation` and ran it via `new Function` with a
live `$self` mutation context. That conflicts with the non-negotiable rule
(authored definitions must not execute unrestricted JavaScript) and with
the accepted R0 correction (PR #200 removed portable Action source
execution; the Action model has no `implementation` field today). Per the
repository contract the requirement was converted into an ADR proposal
instead of a silent workaround:
`docs/architecture/adr-proposal-controlled-layer-methods.md` (controlled
QuickJS-WASM engine behind the existing `ControlledScriptEngine` contract,
structured host bridge, lazy-loaded). Awaiting acceptance; nothing in this
change pre-implements it.

## Verification

- `npm run build`, `npm run lint` — passed.
- Browser smokes against local `vite preview`
  (`SCADA_PAGES_URL=http://localhost:4173/`), all passed:
  `pages-svg-import-compatibility-smoke.mjs` (relocated replacement
  control + persisted presentation/structure assertions),
  `pages-managed-svg-author-ref-smoke.mjs` (marking-workbench alias flow),
  `pages-managed-svg-authoring-smoke.mjs` (UX1.6 dogfood chain),
  `pages-component-inspector-scope-smoke.mjs`,
  `pages-component-inspector-style-groups-smoke.mjs`,
  `pages-component-svg-drag-smoke.mjs`.
- Evidence captures:
  `artifacts/issue-209-svg-properties-tab-1440.png` (SVG properties panel:
  几何 + 替换文件 + SVG with detected-props block; no 资源 group),
  `artifacts/issue-209-behavior-run-preview-1440.png` (per-row ▶ with
  运行态 active and the canvas recolored),
  `artifacts/issue-209-image-resource-group-kept-1440.png` (image layer
  keeps 资源/样式 groups).

## Risks

- The ADR proposal is the only path to the issue's authored-function
  sub-item; until it is accepted the behavior panel stays declarative.
- The relocated 替换文件 control must survive the next deployed-pages
  workflow run (the import-compat smoke was updated in step).
