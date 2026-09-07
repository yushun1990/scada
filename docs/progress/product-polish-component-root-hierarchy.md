# Component Root Hierarchy Product Polish

## Status

In progress · product dogfooding polish · 2026-09-07.

Base revision: `main@419b3a1d5d8ee87aecee5da3d1795a3bae016007`.

This is a post-UX1 product-polish correction under the current `PLAN.md` gate. It does not create a new numbered architecture milestone and does not reopen renderer/runtime/package authority.

## Dogfood finding

After UX1 moved creation to `Palette -> Canvas`, the Navigator still exposed two remnants of the old hierarchy mental model:

1. a top-level `Group 1` could look like a mandatory visual root;
2. after removing that authoring requirement, the Navigator still rendered a fixed `组件根 / 新组件` pseudo-row even though that row was not a persisted `VisualLayer`.

Both representations were misleading. `ComponentVisualDefinition.layers` already supports a visual forest: multiple layers can have `parentId = null`, and a non-null parent is required to be a Group only when a layer actually has a parent.

The product hierarchy is therefore frozen as:

```text
Component document / public contract        not a VisualLayer
visual.layers[]
├─ top-level VisualLayer                    parentId = null
├─ top-level VisualLayer                    parentId = null
└─ Group                                    only when the author explicitly groups layers
   ├─ child
   └─ child
```

## Authority decision

1. The Component document owns component-level authoring state and the public contract; it is not a `VisualLayer` and is not represented as a node in the visual hierarchy.
2. Navigator renders only real `ComponentVisualLayer` records. It has no synthetic component-root row.
3. `parentId = null` means a visual layer is top-level in the visual forest. No persisted or runtime root-layer object is introduced.
4. A `GroupVisualLayer` is an ordinary explicit visual container, not a required root wrapper.
5. New Palette primitives, text and imported resources continue to be created directly at top level unless a separately reviewed interaction explicitly groups/reparents them.
6. Direct creation of an empty Group from the Palette remains removed. Group creation is an arrange operation: select two or more same-parent layers and use the existing Canvas `组合` command.
7. Existing persisted Groups remain valid and visible. There is no silent migration that unwraps a historical or intentional Group because provenance cannot be inferred safely from `id`, name or shape alone.
8. Existing Groups can be explicitly ungrouped through the current hierarchy command, which preserves supported composed transforms. Group-scoped Rule/Animation semantics continue to follow the existing fail-closed ungroup behavior.
9. `selectedLayerIds = []` is the no-layer-selection state. Clicking blank Canvas space clears layer selection and exposes component-level Inspector configuration; this does not require a fake Navigator node.

## UI polish

- remove the standalone `组` item from the Add Palette;
- remove the fixed Component / `新组件` pseudo-root row from Navigator;
- explain in Palette help that grouping happens from multi-selection on the Canvas toolbar;
- label the no-parent Inspector choice as `顶层`;
- make Navigator help explicit that it displays only real visual layers and that `parentId = null` is top-level;
- describe the empty Canvas selection state as `未选择图层`, not `组件根`;
- keep Navigator navigation-only: no new tree-side creation/reparent authority is introduced.

## Regression requirement

The existing empty-Group pointer regression remains valuable for legacy/package compatibility even though empty Group creation is no longer a primary Palette affordance. The browser fixture therefore creates Groups through the real `组合` command and, where an empty Group is required for hit testing, removes its children explicitly rather than relying on a dedicated empty-Group Palette button.

Browser fixtures must also clear internal selection through the real blank-Canvas interaction rather than clicking a synthetic Navigator root. This keeps automated proof aligned with the same selection path a user has after the pseudo-root is removed.

Acceptance requires:

- new component can contain multiple top-level layers without any Group;
- Navigator contains only real visual layers and no fixed component-root row;
- blank Canvas click clears internal layer selection and component-level Inspector remains reachable;
- Inspector represents `parentId = null` as `顶层`;
- no standalone Group creation affordance appears in the Palette;
- explicit multi-selection Group/Ungroup remains functional;
- existing persisted Group hierarchy still renders/selects correctly;
- empty legacy Group hit behavior remains browser-proven;
- save/reopen and existing component/work-package/standalone boundaries remain unchanged;
- no `ComponentVisualDefinition` version bump, Scene schema change, package resolver or second renderer/runtime authority is introduced.
