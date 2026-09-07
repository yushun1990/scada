# Component Root Hierarchy Product Polish

## Status

In progress · product dogfooding polish · 2026-09-07.

Base revision: `main@419b3a1d5d8ee87aecee5da3d1795a3bae016007`.

This is a post-UX1 product-polish correction under the current `PLAN.md` gate. It does not create a new numbered architecture milestone and does not reopen renderer/runtime/package authority.

## Dogfood finding

After UX1 moved creation to `Palette -> Canvas`, the Navigator still exposed an old mental model strongly enough that a top-level `Group 1` could look like a mandatory visual root:

```text
component root
└─ Group 1
   ├─ SVG
   ├─ Image
   ├─ Vector
   └─ Text
```

That is not the current persisted model. `ComponentVisualDefinition.layers` already allows multiple layers with `parentId = null`; a parent is required to be a Group only when a layer actually has a parent.

The product hierarchy is therefore frozen as:

```text
component root                    UI/public-contract root; not a VisualLayer
├─ top-level VisualLayer          parentId = null
├─ top-level VisualLayer          parentId = null
└─ Group                          only when the author explicitly groups layers
   ├─ child
   └─ child
```

## Authority decision

1. The component root is the only conceptual root shown by the Workbench.
2. The component root is not persisted as a `VisualLayer` and does not become a renderer/runtime target.
3. `parentId = null` means a visual layer is directly under the component root.
4. A `GroupVisualLayer` is an ordinary explicit visual container, not a required root wrapper.
5. New Palette primitives, text and imported resources continue to be created directly at top level unless a separately reviewed interaction explicitly groups/reparents them.
6. Direct creation of an empty Group from the Palette is removed. Group creation is an arrange operation: select two or more same-parent layers and use the existing Canvas `组合` command.
7. Existing persisted Groups remain valid and visible. There is no silent migration that unwraps a historical or intentional Group because provenance cannot be inferred safely from `id`, name or shape alone.
8. Existing Groups can be explicitly ungrouped through the current hierarchy command, which preserves supported composed transforms. Group-scoped Rule/Animation semantics continue to follow the existing fail-closed ungroup behavior.

## UI polish

- remove the standalone `组` item from the Add Palette;
- explain in Palette help that grouping happens from multi-selection on the Canvas toolbar;
- label the no-parent Inspector choice as `组件根（顶层）` instead of the implementation-facing `Visual Root`;
- make Navigator help explicit that top-level layers attach directly to the component root and Group is optional explicit structure;
- keep Navigator navigation-only: no new tree-side creation/reparent authority is introduced.

## Regression requirement

The existing empty-Group pointer regression remains valuable for legacy/package compatibility even though empty Group creation is no longer a primary Palette affordance. The browser fixture should therefore create Groups through the real `组合` command and, where an empty Group is required for hit testing, remove its children explicitly rather than relying on a dedicated empty-Group Palette button.

Acceptance requires:

- new component can contain multiple top-level layers without any Group;
- no standalone Group creation affordance appears in the Palette;
- explicit multi-selection Group/Ungroup remains functional;
- existing persisted Group hierarchy still renders/selects correctly;
- empty legacy Group hit behavior remains browser-proven;
- save/reopen and existing component/work-package/standalone boundaries remain unchanged;
- no `ComponentVisualDefinition` version bump, Scene schema change, package resolver or second renderer/runtime authority is introduced.
