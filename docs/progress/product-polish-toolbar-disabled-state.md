# Component Editor Toolbar Disabled-State Unification

## Status

Implemented for review · 2026-09-27.

Base: `main@a724a48` (PR #204). Dogfooding polish under the current `PLAN.md`
product-polish phase. No new numbered milestone, no M10A boundary change.

## Problem

The Component editor top toolbar expressed "unavailable" inconsistently:

- Portaled edit commands (copy / delete / undo / redo, grid toggle) render
  with a native `<button disabled>`, so the shell's `.icon-button:disabled`
  rule grayed them.
- Directly rendered toolbar commands (snap toggle, group/ungroup,
  align/distribute) are Base UI `ToolbarButton`s. Base UI keeps disabled
  toolbar buttons focusable and exposes `data-disabled` / `aria-disabled`
  instead of the native attribute, so every `:disabled`-scoped rule missed
  them, and the shell's higher-specificity `.icon-button` color override
  suppressed the shared `.ui-button[data-disabled]` gray. They looked exactly
  like enabled commands; the only disabled signal was the `not-allowed`
  cursor on hover — accompanied by a wrong accent hover highlight.

The same latent hover defect existed in the shared primitives
(`.ui-button-*:hover:not(:disabled)`) and the SCADA shell
(`.canvas-tool-group button:hover:not(:disabled)`, `.toggle-button:hover`):
any Base UI `data-disabled` button could light up on hover.

## Changes

- `src/editor-toolbar-context.css` — the component toolbar disabled gray now
  matches both `:disabled` and `[data-disabled]`; hover and pressed states
  exclude both; the disabled rule is ordered after the pressed rule so an
  unavailable pressed toggle still reads as gray.
- `src/ui/ui-primitives.css` — button hover/active states
  (primary/accent/secondary/ghost) exclude `[data-disabled]`, matching the
  shared disabled rule that already covers both disabled representations.
- `src/workbench.css` — SCADA toolbar and toggle hover rules exclude
  `[data-disabled]`.
- `scripts/pages-component-toolbar-smoke.mjs` — new assertions: both toolbar
  families render the live theme's `--ui-color-text-disabled`, keep it on
  hover, keep the disabled background and the `not-allowed` cursor, while an
  enabled neighbor keeps its interactive color; SCADA undo/redo on a fresh
  work (empty history) are checked the same way.

No component contract, schema, runtime, persistence, or renderer change.
Base UI's focusable-disabled toolbar accessibility pattern is preserved; no
native `disabled` is forced onto toolbar buttons.

## Verification

- `npm run lint` — oxlint 0 errors (29 pre-existing unrelated warnings); UI
  primitive, C1 token authority, and StudioShell authority checks pass.
- `npm run build` — production build succeeds.
- Local pre/post probes (Chromium, `#/components/new`, 1600×900):
  - before: group/align disabled rest color `rgb(83, 97, 91)`
    (`--ui-color-text-secondary`), hover `rgb(9, 82, 69)` on
    `rgb(225, 241, 233)` accent; undo (native disabled) already gray.
  - after: group/align/undo all `rgb(140, 152, 145)` (component theme
    `--ui-color-text-disabled` `#8c9891`) at rest and on hover with a
    transparent background; the snap toggle (enabled, pressed) keeps its
    accent.
  - evidence: `artifacts/toolbar-disabled-before.png` /
    `artifacts/toolbar-disabled-after.png` plus full-page variants.
- `SCADA_PAGES_URL=http://localhost:4173/ node scripts/pages-component-toolbar-smoke.mjs`
  against `npm run preview` of the built head — passed, covering the new
  disabled-state assertions for both editors (component theme gray
  `#8c9891`, SCADA gray `#8a9099`, no hover highlights).
- The extended smoke is already registered unchanged by path in
  `component-editor-smoke.yml` (PR gate) and `pages-smoke.yml` (deployed
  Pages gate), so both gates now run the disabled-state assertions.

## Remaining risks

- Compact arrange-menu items and non-toolbar disabled controls are not
  assertion-covered; they already consume the shared primitive disabled rule.
- Deployed Pages acceptance is a post-merge gate, as with prior polish items.

## Next eligible work item

Report the deployed Pages smoke result for the merged head; continue the
outstanding D2/D3 UI rollout items. Not started here.
