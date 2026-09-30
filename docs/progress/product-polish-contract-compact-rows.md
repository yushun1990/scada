# Component Contract Compact Row Editing (静态属性 / 运行属性)

## Status

Implemented for review · 2026-09-30 · review revisions applied · 2026-09-30.

Base: `main@d7a5dd3`. Dogfooding polish under the current `PLAN.md`
product-polish phase. No new numbered milestone, no M10A boundary change.

## Problem

The Component Workbench 属性 tab edited the public Attribute and Property
contracts through per-entry accordion cards: every entry carried a
summary row (display title + key + kind + default) plus an expanding card
with Key / 标题 / 类型 / 默认值 grid, a multi-line enum-options textarea, a
multi-line description textarea and a delete row. The card form was heavy
for what is conceptually a flat field list, and the saved state showed a
separate display title next to the key instead of reading like the
inspector's ordinary attribute rows.

## Accepted interaction design

- Saved entries render exactly like ordinary inspector attribute rows:
  `名称 + 说明(可见小字) + 按类型的值控件 + [绑定徽标] + 图标编辑/删除`.
  The type is not displayed; an enum's value is a dropdown, a color is
  the color input, a boolean is a checkbox. The value control stays live:
  changing it in the saved row edits the contract default directly.
- 添加 / 编辑 opens one compact labeled two-column form
  (名称 / 类型 / 默认值 / 说明 / 枚举选项 / 允许 SCADA 数据绑定) with
  取消 / 保存. One 保存 commit is one definition change.
- The name is the field name: adding and renaming syncs `title` to the
  key, and the saved row shows the key (`alarm_color`), not a separate
  label. No schema change; `ComponentAttributeDefinition.title` remains
  required and keeps legacy authored titles untouched unless the entry is
  renamed.
- Enum options are configured through a structured editor aligned with
  the 选项 label on one line: each option row is one radio triplet —
  radio (marks the default) + `key` input + `value（空=key）` input —
  plus shared icon insert/delete buttons, all on a single row. Typing a
  key auto-syncs an empty value to the key (a bare option visibly shows
  value = key; a manually edited value is never overwritten); a filled
  value (number or any text key) makes the option indexed — no explicit
  mode switch. At least one row always exists (the 枚举 type seeds one;
  delete is disabled on the last row). Saved-row dropdowns show
  `标签 · 值` when the two differ and the label alone when they are
  equal. At save time the definition validation contract is enforced up
  front: at least one option, non-empty labels, no duplicate values
  (保存 stays disabled with the reason as its tooltip; fully blank rows
  are ignored). The marked row's value becomes the default; deleting
  the marked row moves the mark to the first row. 说明 edits in a
  two-row textarea at the tail of the form with its label aligned to
  the first text line; non-enum kinds keep a wide 默认值 field.
- 运行属性 keeps the M9A2 authority: only the Property editor offers
  允许 SCADA 数据绑定 (form checkbox, saved-row 绑定 badge); the
  Attribute editor has no bindable control.

## Review revisions · 2026-09-30

PR #220 review requested corrections across two rounds, all applied:

Round 1:

1. 编辑/删除 are icon buttons (`IconButton` + `EditIcon`/`TrashIcon`
   from the shared toolbar icon set) with title/aria labels, replacing
   the text buttons.
2. The enum options editor no longer round-trips a controlled value
   through parse→format on every keystroke — that rewrites user input
   and made the seeded `选项 1` impossible to delete.
3. Value-less enums are first-class; no index is required.
4. The saved row reads naturally and the description is visible.

Round 2 replaced the round-1 free-text option line entirely and
rebalanced the saved row:

5. Enum options are configured through a structured editor, not a
   comma/`=` constrained text line: per-option 标签+值 rows with
   individual delete buttons and a `+ 添加选项` row button. The value
   input left empty means key = label (无索引); filling it (number or
   any text key) makes the option indexed. A 标签 / 值（留空=标签）
   caption row identifies the two columns.
6. The saved row places the description inline between the name and the
   value control (ellipsis when long), removing the empty middle gap;
   the value control stays right-aligned with icon actions at the end.

Round 3 removed the explicit 枚举形式 tabs and polished the form:

7. There is no 无索引/带索引 mode switch — every option row always
   shows 标签 + 值 inputs; an empty 值 means key = label. Options whose
   value differs from the label display as `标签 · 值` in both the
   默认值 dropdown and the saved-row dropdown (identical values show
   the label only), so key and value are both visible.
8. 说明 is a two-row multi-line textarea.
9. Visual cleanup: caption row aligned to the option input columns,
   placeholder copy (请选择 / 暂无选项), and a divider above the
   取消/保存 actions.

Round 4 merged the default value into the option list:

10. For enum entries there is no separate 默认值 field: each option row
    starts with a dot marker that marks the default in place. Deleting
    the marked row moves the mark to the first row; at save the marked
    row's materialized value becomes the default (falling back to the
    first option).
11. The 标签/值 caption row is gone — the two inputs identify
    themselves through placeholders (`key` and `value（空=key）`).
12. Selecting the 枚举 type seeds one empty option row (an enum always
    has at least one). Each row ends with insert/delete buttons instead
    of a trailing global add button.
13. 说明 moved to the tail of the form (after the option list and the
    bindable checkbox). Non-enum kinds keep 默认值 as a wide field.

Round 5 refined the option row into a labelled radio triplet:

14. The 选项 label sits on the same line as the option list (46px label
    column like every other form field); the explanatory suffix
    （行首圆点标记默认值） is gone.
15. The default marker is a real radio button: a new `RadioGroup` /
    `RadioItem` primitive over Base UI Radio renders one triplet per
    row — radio + key + value + insert/delete — kept on a single line.
    The insert/delete buttons are shared icon buttons
    (`PlusIcon`/`MinusIcon` added to the toolbar icon set) matching the
    editor's icon language.
16. Typing a key auto-syncs an empty (or still-synced) value to the key
    content, so a bare option visibly shows value = key; a manually
    edited value is never overwritten.
17. The 说明 label aligns with the first line of its textarea instead
    of centering against the whole control.

## Changes

- `src/features/component-library/ComponentContractRowTable.tsx` (new) —
  the one shared row-table module: saved-row rendering with the typed
  default-value editor, the draft-based add/edit form, key generation,
  kind conversion with default/options reset, comma option parsing,
  record rename with title sync, bindable-column hook, and save
  validation (non-empty, unique key). Editing state is local; commits go
  through one `onEntriesChange` callback.
- `src/ui/Radio.tsx` (new) — `RadioGroup` / `RadioItem` primitives over
  Base UI Radio with `.ui-radio` styles in `ui-primitives.css`, used for
  marking the default enum option.
- `src/components/toolbar-icons.tsx` — `PlusIcon` / `MinusIcon` added to
  the shared icon set for per-row insert/delete.
- `src/features/component-library/component-contract-rows.css` (new) —
  compact token-based styles for the saved row and the form.
- `src/features/component-library/ComponentAttributeContractEditor.tsx`
  and `ComponentPropertyContractEditor.tsx` — rewritten as thin wrappers
  over the shared module (the Property wrapper adds `bindable` defaults
  and the bindable column hook).
- Deleted `component-property-contract.css` and removed the now-dead
  `.property-contract-*` accordion rules from `component-editor.css` and
  `ui-primitives.css` (`.contract-grid`, `.contract-empty`,
  `.contract-add-button` base styles live elsewhere and are unchanged).

No schema, codec, package, runtime, persistence or renderer change.
`ComponentPreviewValues`, the SCADA Inspector and package codecs keep
consuming the same `attributes` / `properties` records.

## Verification

- `npm run build` — passes (tsc -b + vite build).
- `npm run lint` — passes: oxlint 0 errors (27 pre-existing repo-wide
  warnings, 0 in the changed files); UI primitive audit, C1 token
  authority and StudioShell authority checks pass.
- Browser proof (local dev server, in-app Chromium,
  `#/components/component-smart-storage-tank`):
  - existing `level` / `alarmThreshold` properties render as saved rows
    (name + number input + 绑定 badge + icon actions), no type shown;
  - 添加配置 opens the labeled form focused on a generated
    `attributeN` name; `alarm_color` + 类型=颜色 + 说明=报警色常量
    saved into a one-line row with the color control;
  - enum authoring: `work_mode` + 枚举 seeded one option row; `+`
    inserted a row below the first; keys/values filled as `运行` (value
    empty) and `待机`/`2`; marking the second row (○→●) and saving made
    it the default (`待机 · 2` in the saved-row dropdown); re-editing
    round-tripped the marker position and both rows verbatim; deleting
    the marked row moved the mark to the first row; the last remaining
    row's `−` stayed disabled with 至少保留一个选项; the multi-line
    说明 textarea round-tripped;
  - save gating: duplicate values disable 保存 with 枚举选项值重复：…,
    no meaningful options with 枚举至少需要一个选项;
  - adding a Property with 允许 SCADA 数据绑定 produced the 绑定 badge;
    delete removed it; header 保存 + reload persisted the enum attribute
    and its selected default exactly;
  - built-in read-only view (状态指示灯) shows saved rows only — no
    edit/delete/add controls;
  - screenshots of both states (saved rows with visible descriptions and
    icon buttons, open form) confirm the compact layout with no
    misalignment or overflow. Test data was removed and the component
    re-saved afterwards.

## Remaining risks

- The one-line option editor cannot express labels containing commas
  (the previous per-line textarea could). Values with commas remain
  unsupported in both formats.
- Renaming an entry overwrites a legacy authored `title` with the new
  key. This is the accepted "name is the field name" behavior; entries
  that are never renamed keep their stored titles.

## Next eligible work item

Same product-polish backlog: D2/D3 and E/F work packages from the
industrial Designer UI rollout remain outstanding; no follow-up is
implied by this note.
