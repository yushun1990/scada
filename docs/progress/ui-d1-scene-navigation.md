# UI D1 Scene Navigator and Palette

Status: implemented; browser acceptance in progress · 2026-09-15

Source: [UI rollout D1](../design/industrial-designer-rollout.md).

## Result

SCADA's layer placeholder is replaced by a view of the actual Scene v8 hierarchy. Search matches names, type keys, IDs and hidden/locked state, retaining matching ancestors. Group collapse, search, keyboard focus and reveal-selected are transient UI state. No second tree or persistence schema is introduced.

The Navigator shares the page's existing selection with Inspector and Canvas. It supports Ctrl/Command toggles, Shift ranges, Arrow/Home/End focus navigation, Left/Right expansion and Enter/Space selection. Hidden and locked objects remain discoverable and inspectable. Single-object visibility/lock commands use the existing document commit/undo authority; inherited hidden/locked state is labeled explicitly. Preview blocks selection and authored-state mutation while permitting search and expansion.

The renderer shows a passive outline for visible descendant/locked selections and reports their identity in its existing status snapshot. Transform handles retain the existing root-object scope; the Navigator does not introduce a second geometry editing authority.

The Palette filters registered components by name/type/category and exposes category filtering and an empty result state. The unused SCADA resource tab is removed. Component Workbench's real local asset upload/placement flow is unchanged.

## Verification

`pages-scene-navigation-smoke.mjs` covers a persisted nested fixture with hidden/locked descendants; ancestor-preserving search, reveal, Inspector/Canvas selection, keyboard and modifier selection, undo/redo of visibility, lock persistence, unchanged Attributes, transient navigation state and Preview guards. It also verifies Palette filtering and removal of the resource placeholder.

The dedicated Scene Navigation Browser Check gates PRs and the same smoke runs after Pages deployment. Existing B1, B2, B3, Shell and compact-toolbar browser regressions are retained.

## Remaining rollout scope

D2 PropertyRow/binding details and D3 mixed-value editing/full cross-editor Tabs/Tree accessibility remain separate work. This D1 slice does not implement nested transform handles, drag reparenting, a new component catalog, connection-tree editing, protocols or runtime semantics. Broader visual zoom/DPR/Firefox task acceptance remains in F.
