# UI B1 Editor Transaction + Shortcut Scope

Status: accepted for merge · 2026-09-11

Plan source: `docs/design/industrial-designer-rollout.md` → **B1 编辑事务与快捷键作用域**.

Implementation acceptance head: `a33e7ebd5d9c95a0a5cb4815ca6ef6d08e400c57` on PR #190. Any later PR-head commits in this tranche are documentation-only unless recorded otherwise.

## Result

B1 establishes reliable transaction boundaries before the shared Studio shell or Inspector redesign begins.

### SCADA Scene history

- `setScene()` staged form edits retain the first transaction-before snapshot.
- Same-event `setScene() -> commit()` resolves against synchronous staged state rather than waiting for a React rerender.
- One focused multi-keystroke edit becomes one undo entry.
- Escape restores the pending before snapshot.
- Ctrl/Cmd+Z, redo shortcuts and Canvas Space ignore text editing targets and IME composition.
- Canvas Space navigation no longer steals input text merely because the pointer remains over the canvas.

### Component document history

The previous Canvas-local `ComponentVisualDefinition` history is removed as an undo authority. History now belongs to the complete authored `ComponentLibraryEntry`.

The single ordered history covers:

```text
ComponentLibraryEntry
├─ definition
│  ├─ Attributes
│  ├─ Properties
│  ├─ Actions
│  ├─ Events
│  └─ Anchors
├─ visual layers
├─ visual rules
├─ animations
└─ component metadata/status
```

Existing reference reconciliation remains inside the same mutation path. Undo/redo therefore restores the reconciled document snapshot rather than moving the Canvas independently from the public contract.

Focused controlled fields coalesce focus→blur into one transaction. Blur-only writers such as contract-key inputs finalize at the microtask boundary so the child `onBlur` mutation is included before commit. Escape uses the same deferred boundary to cancel those blur writers rather than accidentally committing them.

## Browser acceptance

### SCADA Editor Transaction Browser Check

Workflow run: `34557604871` — success.

The Chromium proof covers:

1. add a real SCADA component;
2. type a multi-keystroke node name;
3. one Undo restores the complete previous name;
4. Redo restores the edit;
5. Ctrl/Cmd+Z inside the focused text input does not invoke Scene history;
6. Escape cancels a staged field edit;
7. Space remains text input while the pointer is still over the Konva canvas;
8. the redone document persists through the normal Scene repository save path.

### Component Editor Browser Checks

Workflow run: `34557604875` — success.

The new full-document smoke proves:

1. a visual layer edit and a Component definition edit occupy one ordered history;
2. Undo crosses from definition back to the earlier visual edit, and Redo restores both in order;
3. focused text Ctrl/Cmd+Z stays field-local;
4. Escape cancels a staged Component field transaction;
5. a blur-written Property key can be cancelled with Escape;
6. renaming that Property reconciles an existing Visual Rule `propertyKey`;
7. Undo restores both the old Property key and the Visual Rule reference;
8. Redo restores both the renamed key and reconciled reference;
9. the result persists through the normal component repository path.

The same workflow also reran the existing navigation, primitive, pointer/hit, managed-SVG drag, header, arrange, shared-toolbar and package-transfer browser regressions successfully.

### CI

Workflow run: `34557604870` — success.

- production build passed;
- runtime/model checks passed;
- lint passed with the repository's existing warning baseline;
- publication API checks passed.

## Preserved boundaries

B1 does not change:

- Scene v8 or Component/package persistence schemas;
- M9 Attribute / Property authority;
- renderer/runtime value authority;
- managed SVG target authority;
- package or standalone-runtime semantics;
- save/dirty revision UX;
- Preview mode command gating;
- multi-selection Inspector scope;
- Studio shell/navigation/visual tokens.

The latter four UI concerns continue in B2, B3, C and D respectively.

## Next gate

Proceed to **B2 保存状态与离开处理**:

- explicit current/saving/saved revision state;
- dirty/saving/saved/error feedback;
- save completion must not overwrite newer edits;
- return / route change / browser leave handling;
- save / discard / cancel behavior with failed-save recovery.
