# UI B3 Preview Mode + Selection Scope

Status: acceptance candidate · 2026-09-11

Plan source: `docs/design/industrial-designer-rollout.md` → **B3 模式和选择范围**.

Implementation candidate branch: `fix/ui-b3-mode-selection`, based on accepted B2 main `37864e6287e90153cb269e8dcb87a2dbe725cbb7` and PR #192. This record becomes accepted only after the final direct-head CI, B1 transaction, B2 save/leave, Component Editor, and B3 mode/selection browser gates are green.

## Result candidate

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

## Evidence collected before final closeout

On implementation head `cdd60c0b528122c490cbad9c753742886aaff2d3`, before adding the dedicated B3 smoke, all inherited gates were green:

- CI `34589550960` — success;
- Editor Transaction Browser Check `34589550983` — success;
- Editor Save Leave Browser Check `34589551061` — success;
- Component Editor Browser Checks `34589551018` — success.

The dedicated `Editor Mode Selection Browser Check` was then added. Its first browser pass proved the complete single-selection Preview section (disabled design commands, read-only Inspector, ignored history shortcut, renderer drag rejection, clean save state, unchanged persisted Scene) before the fixture reached multi-selection. Fixture-only failures were traced to overlapping test nodes and corrected by moving the added node to a non-overlapping position before the saved baseline.

Final acceptance requires the full dedicated smoke to prove:

1. a clean Scene stays clean through Preview command, shortcut, Inspector, and pointer attempts;
2. view-only grid control remains usable without dirtying the Scene;
3. returning to Design shows the same authored values and persisted Scene;
4. real Shift multi-selection shows only batch scope, with no single-object name/identity form;
5. one supported batch mutation is one history entry and Undo returns to the saved baseline;
6. Preview makes batch authoring controls read-only and global Undo remains blocked.

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

## Next gate after acceptance

After B3 is accepted and merged, proceed to **C1 primitive/token visual system**, then **C2 shared StudioShell/layout**. Do not reopen B1-B3 or M6-M9 authorities merely to make the product look more like Ignition.
