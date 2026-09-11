# UI C1 Studio Tokens + Primitives

Status: accepted for merge · 2026-09-11

Plan source: `docs/design/industrial-designer-rollout.md` → **C1 primitive/token visual system**.

Accepted implementation head: `8e864925ba1f417d69f0322384a5e642496dfb83` on `refactor/ui-c1-tokens-primitives`, based on accepted B3 main `8580d22b84fbb4ae9a576da287320b0f417a9b0e` and PR #193.

## Result

C1 establishes one visual-value authority for the Studio without starting the C2 shell/layout migration.

### Token authority

`src/styles/tokens.css` now carries the target values from `industrial-designer-spec.md`:

- neutral light palette with `#1769aa` as the single editor interaction accent;
- 11/16 status, 12/18 tool/property, 13/20 body/title, and 18/24 workbench-title typography;
- normal spacing scale 4 / 8 / 12 / 16 / 24, with 2 / 6 reserved for micro gaps and split hit areas;
- panel radius 0, ordinary control radius 2, floating radius 4;
- 28px ordinary controls, 26px compact/tree rows and status bar;
- target shell geometry tokens for C2: menu 28, main toolbar 36, document bar 28, left panel 248 and right Inspector 320 with the specified resize bounds.

Legacy names such as `surface-muted`, `border-subtle`, `accent-soft-strong`, and `radius-pill` remain only as same-value compatibility aliases. They no longer define an independent palette or geometry system.

### Primitive state authority

`src/ui/ui-primitives.css` is the shared control-state authority. `src/styles/ui-foundation.css` has been reduced to product layout and density rather than competing control styling.

The primitive layer now has explicit visual treatment for:

- default;
- hover;
- focus-visible;
- pressed/active;
- disabled;
- read-only;
- error;
- mixed/indeterminate.

The former `first-of-type` toolbar-primary inference and legacy hard-coded blues were removed. Button priority is semantic through the primitive variant instead of DOM order.

`Checkbox` now exposes read-only, invalid, and indeterminate states. New shared primitives are available for `Menu`, `Dialog`, `SplitPane`, and `StatusBar`. `SplitPane` includes a focusable separator with pointer dragging, directional-key adjustment, Home/End bounds, and `aria-valuenow/min/max` semantics.

### State sample and regression guard

The internal route `#/__ui-states` renders real Studio primitives and is intentionally absent from ordinary Workspace navigation. It is a visual/state acceptance surface, not a product module.

`scripts/check-ui-token-authority.mjs` is part of `npm run lint` and prevents the shared foundation/primitive layer from silently reintroducing the replaced legacy blue values, 999px pill geometry, or `first-of-type` semantic styling. It also verifies the target token declarations and compatibility aliases.

## Browser and CI acceptance

Implementation head `8e864925ba1f417d69f0322384a5e642496dfb83` passed every required gate:

- CI `34597048724` — success;
- Editor Transaction Browser Check `34597048837` — success;
- Editor Save Leave Browser Check `34597048709` — success;
- Editor Mode Selection Browser Check `34597048954` — success;
- Component Editor Browser Checks `34597048928` — success;
- UI Foundation Browser Check `34597048904` — success.

The dedicated C1 Chromium gate verifies real computed styles rather than CSS source only. It proves:

1. target palette tokens are active and `text-subtle / panel` stays above 4.5:1 while `border-strong / panel` stays above 3:1;
2. ordinary controls render at 28px with 12/18 typography and 2px radius;
3. hover, focus and pointer-down states resolve to the target accent states;
4. disabled text uses the dedicated disabled color rather than blanket opacity;
5. read-only values remain readable and visually distinct from disabled controls;
6. error and mixed/indeterminate states are exposed by the actual primitives;
7. Menu and Dialog use the floating 4px radius and floating shadow;
8. SplitPane keyboard adjustment updates its real ARIA value from 220 → 228 → 180 → 320;
9. StatusBar renders at 26px / 11px using the shared panel surface;
10. the state-sample browser run emits no page errors and captures a current visual evidence screenshot.

## Preserved boundaries

C1 does not change:

- Scene, Component/package, storage, or runtime schemas;
- B1 transaction/history authority;
- B2 save revision / leave authority;
- B3 Preview and selection-scope authority;
- M9 Attribute / Property authority;
- managed SVG author-reference/runtime target authority;
- normal Workspace information architecture;
- SCADA/Component command semantics;
- D-batch PropertyRow, final mixed-value Inspector behavior, or Scene Navigator.

C1 also does not claim that the current editor shell already matches the target 28/36/28/26 workstation structure. The old single editor header and `StudioWorkspaceExit` DOM portal remain temporary pre-C2 structure.

## Next gate

Proceed to **C2 shared StudioShell/layout**. C2 should consume these C1 tokens and primitives, introduce explicit menu/main-toolbar/document/status slots for both editors, replace the `StudioWorkspaceExit` DOM query/MutationObserver with a shell navigation slot, and preserve all B1-B3 behavior while doing so.
