# UI B2 Save Revision + Leave Protection

Status: acceptance candidate · 2026-09-11

Plan source: `docs/design/industrial-designer-rollout.md` → **B2 保存状态与离开处理**.

Implementation candidate head: `eed48b9a03a0f6cc03e7d4eeaff637386df99d9f` on PR #191. This record becomes accepted only after the final direct-head CI, B1 transaction, B2 save/leave, and Component Editor browser regressions are green.

## Result

B2 establishes document-save lifecycle authority without reopening B1 history or persistence/runtime authorities.

### Save revision authority

- Both SCADA Editor and Component Editor distinguish `saved`, `dirty`, `saving`, and `error` states.
- A save captures the current authored document object and its monotonic in-memory revision.
- Successful async completion marks only that captured revision as saved; it never replaces the current in-memory document with an older save result.
- Editing while a save is in flight therefore remains dirty and is shown as `保存中 · 有新修改`.
- A failed save leaves the authored document intact and can be retried.
- Persisted clean documents disable Save instead of producing redundant writes.
- For a new Component document, an older completed save cannot remount/overwrite newer edits. The editor stays on `#/components/new` while newer edits remain dirty; the route changes to the persisted component id only after the latest document is successfully saved.

### Leave lifecycle

One active editor guard now owns unsaved-leave coordination for:

- explicit Workspace return;
- internal hash-route navigation;
- browser Back navigation;
- browser refresh/close through `beforeunload`.

The authored document remains the B1 history authority. Navigation/save lifecycle state is outside document history.

The leave dialog provides:

- **保存并继续** — waits for an existing save if needed and performs one follow-up save when newer edits remain dirty;
- **放弃修改** — leaves without persisting current dirty edits, but does not race an already-running uncancellable persistence request;
- **取消** — restores/keeps the current editor and document.

Guarded browser Back restores the accepted editor location without destroying the attempted history target, so Cancel followed by Back can request the same leave again.

## Browser acceptance evidence collected before final closeout

### Editor Save Leave Browser Check

Workflow run `34588462985` on `414f67585ac4cdabedc26e94e519d77244a3f23a` — success.

Chromium proves:

1. SCADA dirty detection from a persisted baseline;
2. a delayed real IndexedDB save persists only its captured snapshot;
3. edits made during that save stay in memory and dirty;
4. the following save persists the newest edit;
5. injected IndexedDB write failure enters error state without rolling the document back;
6. retry succeeds;
7. Workspace Cancel preserves the edit;
8. Workspace Save-and-continue persists and leaves;
9. browser Back is guarded, Cancel keeps editing, repeated Back remains guardable, and Discard leaves;
10. `beforeunload` blocks dirty documents and does not block clean documents;
11. Component new-document stale-save overwrite/remount is closed;
12. Component save failure retains the current document and retry succeeds;
13. Component and SCADA share the same leave semantics.

### Preserved B1 transaction authority

Editor Transaction Browser Check run `34588463038` on `414f67585ac4cdabedc26e94e519d77244a3f23a` — success.

This confirms the B2 lifecycle did not regress SCADA form transactions, Undo/Redo, Escape cancellation, or input/Canvas shortcut scope.

### CI

CI run `34588463084` on `414f67585ac4cdabedc26e94e519d77244a3f23a` — success.

- production build passed;
- runtime/model checks passed;
- lint passed;
- publication API checks passed.

The final candidate additionally updates existing Component browser fixtures to respect the new clean-save and guarded-leave semantics instead of bypassing them. Final closeout records the direct-head workflow ids once those regressions are green.

## Preserved boundaries

B2 does not change:

- Scene v8 or Component/package persistence schemas;
- M9 Attribute / Property authority;
- renderer/runtime value authority;
- managed SVG target authority;
- package or standalone-runtime semantics;
- B1 document-history authority;
- B3 Preview-mode command gating or multi-selection scope;
- C-batch StudioShell, visual tokens, or docking/layout work.

## Next gate after acceptance

Proceed to **B3 模式和选择范围** only after PR #191 is accepted and merged:

- centralize command enabled/disabled conditions needed by the current editors;
- make SCADA Preview a complete design-mutation gate across buttons, shortcuts, and callbacks;
- ensure leaving Preview does not write temporary/current runtime values into design data;
- while multiple Scene nodes are selected, remove single-object editing surfaces and expose only explicitly supported batch fields;
- defer the full mixed-value / tri-state Inspector experience to D.
