import { useState } from 'react'
import type {
  ComponentScalarValue,
  ComponentValueKind,
  ComponentValueOption,
} from '../../component-system/definition'
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  NumberInput,
  SegmentedControl,
  Select,
} from '../../ui'
import { CloseIcon, EditIcon, TrashIcon } from '../../components/toolbar-icons'
import { ColorPickerInput } from './ColorPickerInput'
import './component-contract-rows.css'

/**
 * Public-contract row shape shared by the Attribute and Property contract
 * editors. Saved entries render like inspector attribute rows
 * (名称 + 说明 + 按类型的值控件 + 图标编辑/删除); adding or editing opens
 * one compact labeled form (名称 / 类型 / 默认值 / 说明 / 枚举选项) committed
 * by 保存.
 */
export type ContractRowEntry = {
  title: string
  kind: ComponentValueKind
  defaultValue: ComponentScalarValue
  description?: string
  options?: readonly ComponentValueOption[]
}

type ContractEnumMode = 'bare' | 'indexed'
type ContractEnumOptionDraft = { label: string; value: string }

const CONTRACT_VALUE_KIND_LABELS: Record<ComponentValueKind, string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  color: '颜色',
  select: '枚举',
}

const CONTRACT_VALUE_KIND_OPTIONS = Object.entries(CONTRACT_VALUE_KIND_LABELS).map(
  ([value, label]) => ({ value, label }),
)

const CONTRACT_ENUM_MODE_ITEMS: Array<{ value: ContractEnumMode; label: string }> = [
  { value: 'bare', label: '无索引' },
  { value: 'indexed', label: '带索引' },
]

function nextContractKey(prefix: string, keys: readonly string[]) {
  const keySet = new Set(keys)
  let index = 1
  while (keySet.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

function defaultContractValueForKind(kind: ComponentValueKind): ComponentScalarValue {
  if (kind === 'number') return 0
  if (kind === 'boolean') return false
  if (kind === 'color') return '#2563eb'
  return ''
}

export function createContractRowEntry(
  key: string,
  kind: ComponentValueKind = 'string',
): ContractRowEntry {
  return {
    title: key,
    kind,
    defaultValue: defaultContractValueForKind(kind),
    options: kind === 'select' ? [] : undefined,
  }
}

function convertContractRowKind<T extends ContractRowEntry>(
  entry: T,
  kind: ComponentValueKind,
): T {
  if (entry.kind === kind) return entry

  return {
    ...entry,
    kind,
    defaultValue: defaultContractValueForKind(kind),
    options: kind === 'select' ? [] : undefined,
  }
}

function renameContractRecord<T extends { title: string }>(
  record: Readonly<Record<string, T>>,
  oldKey: string,
  nextKey: string,
  entry: T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([key, current]): [string, T] => [
      key === oldKey ? nextKey : key,
      key === oldKey ? entry : current,
    ]),
  )
}

function parseOptionValue(value: string): string | number {
  const trimmed = value.trim()

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) return numeric
  }

  return trimmed
}

function enumRowsFromEntry(options: readonly ComponentValueOption[] | undefined) {
  const rows = (options ?? []).map((option) => ({
    label: option.label,
    value: String(option.value),
  }))
  const bare = rows.length > 0 && rows.every((row) => row.value === row.label)
  return { mode: (bare ? 'bare' : 'indexed') as ContractEnumMode, rows }
}

/** 完全空白的行在保存时静默忽略 */
function meaningfulEnumRows(rows: readonly ContractEnumOptionDraft[]) {
  return rows.filter((row) => row.label.trim() || row.value.trim())
}

function materializeEnumRows(
  mode: ContractEnumMode,
  rows: readonly ContractEnumOptionDraft[],
): ComponentValueOption[] {
  return meaningfulEnumRows(rows).map((row) => {
    const label = row.label.trim()
    const rawValue = mode === 'bare' ? label : row.value.trim()
    return { label, value: parseOptionValue(rawValue) }
  })
}

/** 与 definition validation 一致：至少一项、标签/值非空、值不重复 */
function enumOptionsIssue(
  mode: ContractEnumMode,
  rows: readonly ContractEnumOptionDraft[],
): string | null {
  const meaningful = meaningfulEnumRows(rows)
  if (meaningful.length === 0) return '枚举至少需要一个选项'

  for (const row of meaningful) {
    if (!row.label.trim()) return '枚举选项的标签不能为空'
    if (mode === 'indexed' && !row.value.trim()) return '枚举选项的值不能为空'
  }

  const seen = new Set<string>()
  for (const option of materializeEnumRows(mode, rows)) {
    const identity = `${typeof option.value}:${String(option.value)}`
    if (seen.has(identity)) return `枚举选项值重复：${String(option.value)}`
    seen.add(identity)
  }
  return null
}

function previewEnumOptions(
  mode: ContractEnumMode,
  rows: readonly ContractEnumOptionDraft[],
): ComponentValueOption[] {
  return meaningfulEnumRows(rows)
    .filter((row) => row.label.trim())
    .map((row) => {
      const label = row.label.trim()
      const rawValue = mode === 'bare' ? label : row.value.trim() || label
      return { label, value: parseOptionValue(rawValue) }
    })
}

function resolveDefaultValue(
  defaultValue: ComponentScalarValue,
  options: readonly ComponentValueOption[],
): ComponentScalarValue {
  const valid = options.some((option) => option.value === defaultValue)
  return valid ? defaultValue : options[0]?.value ?? ''
}

function ContractRowValueEditor({
  entry,
  entryLabel,
  disabled,
  onChange,
}: {
  entry: ContractRowEntry
  entryLabel: string
  disabled: boolean
  onChange: (value: ContractRowEntry['defaultValue']) => void
}) {
  if (entry.kind === 'boolean') {
    return (
      <Checkbox
        className="contract-row-toggle"
        checked={Boolean(entry.defaultValue)}
        disabled={disabled}
        label="开启"
        onCheckedChange={onChange}
      />
    )
  }

  if (entry.kind === 'number') {
    return (
      <NumberInput
        value={typeof entry.defaultValue === 'number' ? entry.defaultValue : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (entry.kind === 'color') {
    return (
      <ColorPickerInput
        value={typeof entry.defaultValue === 'string' ? entry.defaultValue : '#2563eb'}
        disabled={disabled}
        ariaLabel={`${entryLabel} 默认颜色值`}
        placeholder="transparent"
        clearValue="transparent"
        onChange={(val) => onChange(val)}
      />
    )
  }

  if (entry.kind === 'select') {
    return (
      <Select
        value={String(entry.defaultValue ?? '')}
        disabled={disabled}
        ariaLabel={`${entryLabel} 默认枚举值`}
        placeholder="—"
        options={(entry.options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onValueChange={(value) => {
          const option = entry.options?.find(
            (candidate) => String(candidate.value) === value,
          )
          onChange(option?.value ?? value)
        }}
      />
    )
  }

  return (
    <Input
      value={typeof entry.defaultValue === 'string' ? entry.defaultValue : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

type ContractRowDraft<T extends ContractRowEntry> = {
  originalKey: string | null
  draftKey: string
  entry: T
  /** 枚举选项逐项编辑；无索引=值=标签，带索引=每项 标签+值 */
  enumMode: ContractEnumMode
  enumOptions: ContractEnumOptionDraft[]
}

type ContractRowTableProps<T extends ContractRowEntry> = {
  entryLabel: string
  keyPrefix: string
  entries: Readonly<Record<string, T>>
  readOnly: boolean
  createEntry: (key: string) => T
  onEntriesChange: (entries: Record<string, T>) => void
  addLabel: string
  emptyLabel?: string
  bindableOption?: {
    isBindable: (entry: T) => boolean
    setBindable: (entry: T, bindable: boolean) => T
  }
}

export function ContractRowTable<T extends ContractRowEntry>({
  entryLabel,
  keyPrefix,
  entries,
  readOnly,
  createEntry,
  onEntriesChange,
  addLabel,
  emptyLabel,
  bindableOption,
}: ContractRowTableProps<T>) {
  const [draft, setDraft] = useState<ContractRowDraft<T> | null>(null)

  const records = Object.entries(entries)
  const draftKey = draft?.draftKey.trim() ?? ''
  const saveBlockedReason = !draft
    ? null
    : !draftKey
      ? '名称不能为空'
      : draftKey !== draft.originalKey && entries[draftKey]
        ? '名称与现有条目重复'
        : draft.entry.kind === 'select'
          ? enumOptionsIssue(draft.enumMode, draft.enumOptions)
          : null

  function updateEntry(key: string, entry: T) {
    onEntriesChange({ ...entries, [key]: entry })
  }

  function startCreate() {
    const key = nextContractKey(keyPrefix, Object.keys(entries))
    setDraft({
      originalKey: null,
      draftKey: key,
      entry: createEntry(key),
      enumMode: 'bare',
      enumOptions: [],
    })
  }

  function startEdit(key: string) {
    const { mode, rows } = enumRowsFromEntry(entries[key].options)
    setDraft({
      originalKey: key,
      draftKey: key,
      entry: entries[key],
      enumMode: mode,
      enumOptions: rows,
    })
  }

  function saveDraft() {
    if (!draft || saveBlockedReason) return

    const key = draftKey
    const options = draft.entry.kind === 'select'
      ? materializeEnumRows(draft.enumMode, draft.enumOptions)
      : draft.entry.options
    const entry = {
      ...draft.entry,
      title: key,
      options,
      defaultValue: draft.entry.kind === 'select'
        ? resolveDefaultValue(draft.entry.defaultValue, options ?? [])
        : draft.entry.defaultValue,
    } as T

    if (draft.originalKey === null || draft.originalKey === key) {
      onEntriesChange({ ...entries, [key]: entry })
    } else {
      onEntriesChange(renameContractRecord(entries, draft.originalKey, key, entry))
    }

    setDraft(null)
  }

  return (
    <div className={`contract-row-list${records.length > 0 || draft ? ' has-items' : ''}`}>
      {records.map(([key, entry]) => {
        if (draft?.originalKey === key) {
          return (
            <ContractRowForm
              key={key}
              draft={draft}
              saveBlockedReason={saveBlockedReason}
              entryLabel={entryLabel}
              bindableOption={bindableOption}
              onDraftChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={saveDraft}
            />
          )
        }

        return (
          <div className="contract-row-item" key={key}>
            <div className="contract-row-display">
              <div className="contract-row-info">
                <span className="contract-row-name">{key}</span>
                {entry.description && (
                  <span className="contract-row-description">{entry.description}</span>
                )}
              </div>
              <div className="contract-row-value">
                <ContractRowValueEditor
                  entry={entry}
                  entryLabel={entryLabel}
                  disabled={readOnly}
                  onChange={(defaultValue) => updateEntry(key, { ...entry, defaultValue })}
                />
              </div>
              {bindableOption?.isBindable(entry) && (
                <span className="contract-row-badge" title="允许 SCADA 数据绑定">绑定</span>
              )}
              {!readOnly && (
                <span className="contract-row-actions">
                  <IconButton
                    className="contract-row-action"
                    title={`编辑 ${key}`}
                    aria-label={`编辑 ${key}`}
                    onClick={() => startEdit(key)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    className="contract-row-action contract-row-action-danger"
                    title={`删除 ${key}`}
                    aria-label={`删除 ${key}`}
                    onClick={() => onEntriesChange(
                      Object.fromEntries(
                        Object.entries(entries).filter(([current]) => current !== key),
                      ),
                    )}
                  >
                    <TrashIcon />
                  </IconButton>
                </span>
              )}
            </div>
          </div>
        )
      })}

      {draft?.originalKey === null && (
        <ContractRowForm
          draft={draft}
          saveBlockedReason={saveBlockedReason}
          entryLabel={entryLabel}
          bindableOption={bindableOption}
          onDraftChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}

      {records.length === 0 && !draft && emptyLabel && (
        <div className="contract-row-empty">{emptyLabel}</div>
      )}

      {!readOnly && draft?.originalKey !== null && (
        <Button
          variant="soft"
          size="small"
          className="contract-add-button contract-row-add"
          onClick={startCreate}
        >
          {addLabel}
        </Button>
      )}
    </div>
  )
}

function ContractRowForm<T extends ContractRowEntry>({
  draft,
  saveBlockedReason,
  entryLabel,
  bindableOption,
  onDraftChange,
  onCancel,
  onSave,
}: {
  draft: ContractRowDraft<T>
  saveBlockedReason: string | null
  entryLabel: string
  bindableOption?: {
    isBindable: (entry: T) => boolean
    setBindable: (entry: T, bindable: boolean) => T
  }
  onDraftChange: (draft: ContractRowDraft<T>) => void
  onCancel: () => void
  onSave: () => void
}) {
  const entry = draft.entry
  const formEntry = entry.kind === 'select'
    ? { ...entry, options: previewEnumOptions(draft.enumMode, draft.enumOptions) }
    : entry

  function updateEnumOption(index: number, patch: Partial<ContractEnumOptionDraft>) {
    onDraftChange({
      ...draft,
      enumOptions: draft.enumOptions.map((option, currentIndex) =>
        currentIndex === index ? { ...option, ...patch } : option,
      ),
    })
  }

  function switchEnumMode(mode: ContractEnumMode) {
    if (mode === draft.enumMode) return
    onDraftChange({
      ...draft,
      enumMode: mode,
      enumOptions: mode === 'indexed'
        ? draft.enumOptions.map((option) => ({
          label: option.label,
          value: option.value.trim() || option.label.trim(),
        }))
        : draft.enumOptions,
    })
  }

  return (
    <form className="contract-row-form" onSubmit={(event) => { event.preventDefault(); onSave() }}>
      <label>
        <span>名称</span>
        <Input
          className="contract-row-name-input"
          value={draft.draftKey}
          autoFocus
          spellCheck={false}
          aria-label={`${entryLabel} 名称`}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onDraftChange({ ...draft, draftKey: event.target.value })}
        />
      </label>

      <label>
        <span>类型</span>
        <Select
          value={entry.kind}
          ariaLabel={`${entryLabel} 类型`}
          options={CONTRACT_VALUE_KIND_OPTIONS}
          onValueChange={(value) => onDraftChange({
            ...draft,
            entry: convertContractRowKind(entry, value as ComponentValueKind),
            enumMode: 'bare',
            enumOptions: [],
          })}
        />
      </label>

      <label>
        <span>默认值</span>
        <ContractRowValueEditor
          entry={formEntry}
          entryLabel={entryLabel}
          disabled={false}
          onChange={(defaultValue) => onDraftChange({
            ...draft,
            entry: { ...entry, defaultValue },
          })}
        />
      </label>

      <label>
        <span>说明</span>
        <Input
          value={entry.description ?? ''}
          placeholder="说明"
          onChange={(event) => onDraftChange({
            ...draft,
            entry: { ...entry, description: event.target.value },
          })}
        />
      </label>

      {entry.kind === 'select' && (
        <div className="contract-row-form-wide contract-row-enum-editor">
          <div className="contract-row-enum-mode">
            <span className="contract-row-enum-mode-label">枚举形式</span>
            <SegmentedControl
              value={draft.enumMode}
              ariaLabel="枚举形式"
              items={CONTRACT_ENUM_MODE_ITEMS}
              onValueChange={switchEnumMode}
            />
            <span className="contract-row-enum-mode-hint">
              {draft.enumMode === 'bare'
                ? '仅填标签，值=标签'
                : '每项填 标签+值，值可为数字或任意文本'}
            </span>
          </div>

          <div className="contract-row-enum-rows">
            {draft.enumOptions.map((option, index) => (
              <div className="contract-row-enum-row" key={index}>
                <Input
                  value={option.label}
                  placeholder="标签"
                  aria-label={`枚举选项 ${index + 1} 标签`}
                  spellCheck={false}
                  onChange={(event) => updateEnumOption(index, { label: event.target.value })}
                />
                {draft.enumMode === 'indexed' && (
                  <Input
                    className="contract-row-enum-value"
                    value={option.value}
                    placeholder="值"
                    aria-label={`枚举选项 ${index + 1} 值`}
                    spellCheck={false}
                    onChange={(event) => updateEnumOption(index, { value: event.target.value })}
                  />
                )}
                <IconButton
                  className="contract-row-enum-remove"
                  title={`删除选项 ${index + 1}`}
                  aria-label={`删除选项 ${index + 1}`}
                  onClick={() => onDraftChange({
                    ...draft,
                    enumOptions: draft.enumOptions.filter((_, currentIndex) => currentIndex !== index),
                  })}
                >
                  <CloseIcon />
                </IconButton>
              </div>
            ))}

            <Button
              variant="ghost"
              size="small"
              className="contract-row-enum-add"
              onClick={() => onDraftChange({
                ...draft,
                enumOptions: [...draft.enumOptions, { label: '', value: '' }],
              })}
            >
              + 添加选项
            </Button>
          </div>
        </div>
      )}

      {bindableOption && (
        <Checkbox
          className="contract-row-form-wide contract-row-form-bindable"
          checked={bindableOption.isBindable(entry)}
          label="允许 SCADA 数据绑定"
          onCheckedChange={(checked) => onDraftChange({
            ...draft,
            entry: bindableOption.setBindable(entry, checked),
          })}
        />
      )}

      <div className="contract-row-form-actions">
        <Button variant="ghost" size="small" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="accent"
          size="small"
          type="submit"
          disabled={Boolean(saveBlockedReason)}
          title={saveBlockedReason ?? undefined}
        >
          保存
        </Button>
      </div>
    </form>
  )
}
