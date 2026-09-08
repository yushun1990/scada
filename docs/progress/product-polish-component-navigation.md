# Component Editor Navigation Polish

## Status

Implemented for review · 2026-09-08.

Base: `main@6c1bc25` (PR #171). This is dogfooding polish under the existing `PLAN.md` gate, with no new numbered milestone.

## Problems and changes

- Palette help consumed space needed by the Navigator. Keep the Palette and search visible while the actual layer list scrolls independently; use short contextual drawing instructions and a clearly selected `选择` button to leave drawing mode.
- Group arrows looked interactive but did nothing. Give nonempty groups real, separately focusable disclosure controls. Collapsing a group preserves selection and never edits its contents.
- Large or nested components were difficult to navigate. Search by name, layer ID, or type. A descendant match retains its ancestor path, and a matching group includes its contents. Search temporarily expands results; clearing it restores the collapse state. `定位所选` clears the filter, opens ancestors, and scrolls the selected layer into view. Canvas selection also reveals collapsed ancestors.
- Component settings depended on finding blank Canvas space. Provide a persistent Inspector `组件设置` action that reuses the existing empty layer selection and exits drawing mode. The Inspector names its current context. Esc cancels drawing first, then clears a layer selection; Esc inside search clears only the query.
- Preview incorrectly allowed visual history changes through its buttons and keyboard shortcuts. Both Undo and Redo now require an editable Canvas, preserving their stacks until returning to Design.
- Replace prominent implementation terminology in creation, navigation, and configuration help with instructions describing the user's next action.

## Preserved authorities

`ComponentVisualDefinition.layers` remains the only visual forest, sibling-order, and parentage authority. Navigator filtering and collapse are transient view state. Navigation uses the existing layer selection callbacks, and creation/manipulation stays with Palette and Canvas. There is no fake root, tree-side creation/reparenting, schema migration, runtime target expansion, renderer change, or M8/M9 boundary change.

Search does not silently drop selected layers. The selected count and `定位所选` remain available when a filter hides a selection. Disclosure controls work in Preview because they change only navigation; actual editing remains disabled.

## Verification

- Production build and repository lint pass locally (existing unrelated lint warnings remain).
- `check-component-layer-navigation.ts` proves nested search, ancestor paths, empty groups, preserved forest order, and immutable authoring data/collapse state.
- Existing component create-mode and layer-order model checks pass.
- `pages-component-navigation-smoke.mjs` covers the user flow, search/collapse interaction, settings and Esc, Preview history lock with both history stacks populated, save/reload without persisted navigation state, and independent scrolling at 1000 × 700.
- The PR browser workflow builds the proposed head and runs navigation, existing arrange, and toolbar checks before merge. The new navigation smoke is also registered in the existing deployed Pages gate.

Browser acceptance must be reported from completed runs; registration of a script alone is not acceptance. Deployed Pages acceptance remains a post-merge gate.
