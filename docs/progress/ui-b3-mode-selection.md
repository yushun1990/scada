# UI B3 Preview Mode + Selection Scope

Status: accepted for merge · 2026-09-11

Plan source: `docs/design/industrial-designer-rollout.md` → **B3 模式和选择范围**.

Accepted implementation head: `4f47827bc62e2a0e79d0c583c1af34798f398d72` on `fix/ui-b3-mode-selection`, based on accepted B2 main `37864e6287e90153cb269e8dcb87a2dbe725cbb7` and PR #192.

## Result

B3 closes the two P1 scope ambiguities left after B1/B2 without introducing another Scene/runtime authority.

### Preview design-mutation gate

SCADA Editor now derives one page-level `designEditingEnabled = mode === 'editor'` condition and uses it consistently at design command / callback boundaries.

Preview blocks authored Scene mutation through:

- global Undo/Redo shortcuts and toolbar commands;
- Palette insertion;
- duplicate/delete/group/ungroup;
- align/distribute;
- scene-size changes;
- Scene import;
- node and connection Inspector edits;
- Attribute / Property fallback edits and binding changes;
- node transform fields;
- event-behavior authoring;
- create/reconnect connection callbacks and renderer transform callbacks.

The existing renderer remains the pointer-interaction authority. Its Preview rules continue to disable dynamic-layer listening, Transformer editing, ports, drag, marquee, connection creation, and reconnection. The page gate is therefore a second safety boundary for commands/callbacks, not a second renderer or document authority.

Preview intentionally keeps non-authored view/session controls available, including grid visibility, snap preferences, pan/zoom, and runtime Action invocation. Temporary runtime values remain outside authored Scene fallbacks.

`ComponentPropertiesInspector` accepts a read-only presentation flag so Attributes, Property design values, and binding controls remain inspectable in Preview while being non-editable. This does not add binding or value authority.

### Multi-selection scope

When more than one Scene node is selected, the single `primaryNode` property form is no longer rendered alongside batch fields.

B3 keeps only the existing explicitly supported batch fields (currently visibility/lock state). It does not claim to provide the final mixed-value / tri-state PropertyRow experience; that remains D3 work.

This removes the dangerous state where the UI visually represented N selected objects while name/geometry/component-contract fields silently mutated only the last selected node.

## Browser and CI acceptance

Final direct-head `4f47827bc62e2a0e79d0c583c1af34798f398d72` passed every required gate:

- CI `34590425899` — success;
- Editor Transaction Browser Check `34590425870` — success;
- Editor Save Leave Browser Check `34590425881` — success;
- Component Editor Browser Checks `34590425884` — success;
- Editor Mode Selection Browser Check `34590425880` — success.

The dedicated B3 Chromium smoke proves:

1. a clean Scene stays clean through Preview command, shortcut, Inspector, and pointer mutation attempts;
2. view-only grid control remains usable without dirtying the Scene;
3. returning to Design exposes the same authored values and the persisted Scene is unchanged;
4. real Shift multi-selection shows only explicit batch scope, with no single-object name/identity form;
5. one supported batch mutation is one history entry and Undo returns to the saved baseline / clean save state;
6. Preview makes batch authoring controls read-only and global Undo remains blocked.

The fixture deliberately separates the two authored nodes before establishing the saved baseline so multi-selection evidence exercises two independently hittable Konva objects rather than overlapping geometry.

## Preserved boundaries

B3 does not change:

- Scene v8 or Component/package persistence schemas;
- B1 document-history / transaction authority;
- B2 saved-revision / leave authority;
- M9 Attribute / Property authority;
- renderer/runtime value authority;
- managed SVG target authority;
- Component Workbench authoring model;
- package or standalone-runtime semantics;
- C-batch StudioShell, visual tokens, or panel layout;
- D-batch final mixed-value / tri-state Inspector behavior.

## Next gate

Proceed to **C1 primitive/token visual system**, then **C2 shared StudioShell/layout**. Do not reopen B1-B3 or M6-M9 authorities merely to make the product look more like Ignition.
