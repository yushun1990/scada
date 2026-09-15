# UI C2 Shared StudioShell

Status: merged; deployed regression follow-up in progress · 2026-09-15

Plan source: [industrial Designer rollout](../design/industrial-designer-rollout.md), C2. PR: [#194](https://github.com/yushun1990/scada/pull/194), based on C1 `main@03ef6184ed0dcdb61f910b4290b907b694380d8d`.

## Result

Both editors consume one StudioShell with explicit menu, main toolbar, document, work area, status and Workspace navigation slots. Shell navigation replaces App DOM queries, MutationObserver and injected navigation portals. Domain document, command, save/history, runtime and Attribute/Property authorities remain unchanged.

The Shell owns the 28/36/28/26px chrome rows and resizable 248/320px panels. Visibility and width preferences use versioned IndexedDB metadata, outside Scene/Component documents. Menu and keyboard panel controls share the same preference state. Corresponding old header, toolbar and shell CSS has been removed, with a lint guard against restoring those authorities.

## PR failure repair

The failing Component Editor Browser Checks run was [34608776760](https://github.com/yushun1990/scada/actions/runs/34608776760) on `6f317310145d2438cdfe1366b2ff63051401e91e`.

- Lazy-loaded Shell CSS overrode the geometry strip's `flex-shrink`, clipping Component view/grid controls at 1000px. Removed the competing rule so command-family layout remains authoritative.
- Conditionally removed side panels/resizers caused grid auto-placement to put the canvas into a zero-width column. Explicit columns preserve the canvas and remaining panel in all four visibility combinations.
- Toolbar regression now explicitly discards the unsaved fixture through B2's leave guard before changing editor routes. SCADA fits at 1000px, so a separate 900px case exercises actual geometry overflow while retaining the 1000px visibility check.
- Remaining component/work transfer, SVG, standalone and deployed chrome tests now use the shared Shell identity. Standalone absence assertions check the current Shell rather than a deleted class.
- The dedicated Shell regression also runs after Pages deployment and uploads its captures.

## Verification

Local build and lint passed on repair `16dd67a`. Chromium checks passed for StudioShell, compact toolbars, all nine Component Editor checks, B1 transactions, B2 save/leave, B3 mode/selection, C1 foundation, shared chrome, the main authoring smoke, work-package transfer, managed SVG authoring/author refs/geometry/stylesheet compatibility, and fresh standalone runtime.

The SVG checks now perform the current resource upload followed by explicit double-click placement. Unsafe-upload rejection, Inspector replacement, history, canonical target identity, package closure and standalone rendering assertions remain intact.

Remote CI and deployed acceptance remain separate gates; the PR's check rollup and subsequent Pages runs provide those results.

## Acceptance scope

The browser checks cover a single toolbar row, 28px geometry targets, fixed outer command families, reachability of overflowed geometry commands, all panel visibility combinations, canvas position and height, keyboard resizing, preference reload/reset, unchanged document state during layout changes, navigation/leave protection, and lazy-loaded switching between both editors.

Captures cover both editors at 1366×768; the Shell check also measures 1440×900. Toolbar checks measure 1200/1000px plus SCADA overflow at 900px.

Local browser tooling uses Playwright's Chromium 153 build in headless mode. Full 125%/150% browser zoom, DPR 2 and Firefox visual acceptance remain part of rollout F; this record does not claim that broader acceptance.

The renderer-local status nodes remain visually hidden telemetry consumed by existing regression checks. Exposing pointer/zoom through an explicit callback is a follow-up; the visible status row is owned by StudioShell.

## Next

Proceed with D1 Scene Navigator: replace the SCADA layer placeholder with the actual Scene hierarchy, searchable names/types, explicit selection and hidden/locked state. Remove the unused resource placeholder and add Palette search/category filtering. Preserve Scene v8, B1–B3 and M9 semantics. D2 Inspector/property rows and D3 mixed-value editing remain separate work.

## Deployed follow-up

PR #194 merged as `bf995a43c416be0f35a468a9993684eb8de0cf8a`; all eight PR checks, main CI 34969647402 and deployment 34969647366 passed. Pages run 34969714724 exposed older animation fixtures still using single-click Palette creation. Move/scale/fade/blink fixtures now use explicit double-click placement and passed against that deployed revision.

The remaining SCADA feedback check also exposed competing toast declarations in lazy `workbench.css`: `top` and `bottom` stretched the notification over the canvas. Toast layout now has one authority in `editor-chrome.css`; the competing legacy and foundation blocks are removed. Browser evidence confirms an 18px-high transparent message 8px above the canvas footer. This regression now runs in the PR Shell gate as well as after deployment.
