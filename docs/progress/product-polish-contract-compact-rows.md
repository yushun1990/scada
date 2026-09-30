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
- Enum options are configured through a structured editor: an 枚举形式
  segmented control — 无索引 (label-only rows; value = label, e.g.
  `run, stop, alarm`) or 带索引 (one 标签+值 row per option, e.g.
  `run=1`; the value may be a number or any text key) — plus per-option
  rows with individual delete buttons and a `+ 添加选项` button. Editing
  an existing entry auto-detects the form. The 默认值 dropdown follows
  the rows live. At save time the definition validation contract is
  enforced up front: at least one option, non-empty labels and values,
  no duplicate values (保存 stays disabled with the reason as its
  tooltip; fully blank rows are ignored). Changing options keeps the
  default when it is still valid, otherwise it falls back to the first
  option.
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
   comma/`=` constrained text line: an 枚举形式 segmented control
   (无索引 = label-only rows, 值=标签; 带索引 = one 标签+值 row per
   option, the value may be a number or any text key), per-option rows
   with individual delete buttons, and a `+ 添加选项` row button.
   Switching 无索引→带索引 pre-fills each value with its label; editing
   an existing entry auto-detects the form (all values equal labels →
   无索引). Fully blank rows are ignored on save.
6. The saved row places the description inline between the name and the
   value control (ellipsis when long), removing the empty middle gap;
   the value control stays right-aligned with icon actions at the end.

## Changes

- `src/features/component-library/ComponentContractRowTable.tsx` (new) —
  the one shared row-table module: saved-row rendering with the typed
  default-value editor, the draft-based add/edit form, key generation,
  kind conversion with default/options reset, comma option parsing,
  record rename with title sync, bindable-column hook, and save
  validation (non-empty, unique key). Editing state is local; commits go
  through one `onEntriesChange` callback.
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
  - enum authoring: `mode` + 枚举 with options added one by one
    (无索引 rows for `run/stop/alarm`), the 默认值 dropdown following
    the rows live; switching to 带索引 revealed per-row 值 inputs
    pre-filled from labels and `run=1, stop=2, alarm=3` round-tripped
    with the form auto-detected as 带索引 on re-edit; switching back to
    无索引 kept the labels; per-row delete removed options; an invalid
    default fell back to the first option;
  - save gating: duplicate values disable 保存 with 枚举选项值重复：…,
    blank indexed values with 枚举选项的值不能为空, no options with
    枚举至少需要一个选项;
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
