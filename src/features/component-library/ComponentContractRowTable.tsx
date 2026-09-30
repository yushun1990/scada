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
  RadioGroup,
  RadioItem,
  Select,
  Textarea,
} from '../../ui'
import { EditIcon, MinusIcon, PlusIcon, TrashIcon } from '../../components/toolbar-icons'
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
  return (options ?? []).map((option) => ({
    label: option.label,
    value: String(option.value),
  }))
}

/** 完全空白的行在保存时静默忽略 */
function meaningfulEnumRows(rows: readonly ContractEnumOptionDraft[]) {
  return rows.filter((row) => row.label.trim() || row.value.trim())
}

function materializeEnumRows(rows: readonly ContractEnumOptionDraft[]): ComponentValueOption[] {
  return meaningfulEnumRows(rows).map((row) => {
    const label = row.label.trim()
    const rawValue = row.value.trim() || label
    return { label, value: parseOptionValue(rawValue) }
  })
}

/** 与 definition validation 一致：至少一项、标签/值非空、值不重复 */
function enumOptionsIssue(rows: readonly ContractEnumOptionDraft[]): string | null {
  const meaningful = meaningfulEnumRows(rows)
  if (meaningful.length === 0) return '枚举至少需要一个选项'

  for (const row of meaningful) {
    if (!row.label.trim()) return '枚举选项的标签不能为空'
  }

  const seen = new Set<string>()
  for (const option of materializeEnumRows(rows)) {
    const identity = `${typeof option.value}:${String(option.value)}`
    if (seen.has(identity)) return `枚举选项值重复：${String(option.value)}`
    seen.add(identity)
  }
  return null
}

/** 下拉框同时展示标签与值；key=标签（无索引）时只展示标签 */
function formatEnumOptionLabel(option: ComponentValueOption) {
  return String(option.value) === option.label
    ? option.label
    : `${option.label} · ${String(option.value)}`
}

/** 选项行内标记的默认值；被标记行为空或不在有效选项中时回退第一项 */
function markedOptionDefault(
  enumOptions: readonly ContractEnumOptionDraft[],
  defaultOptionIndex: number,
  options: readonly ComponentValueOption[],
): ComponentScalarValue {
  const marked = enumOptions[defaultOptionIndex]
  const markedValue = marked ? marked.value.trim() || marked.label.trim() : ''
  if (markedValue) {
    const value = parseOptionValue(markedValue)
    if (options.some((option) => option.value === value)) return value
  }
  return options[0]?.value ?? ''
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
    const options = entry.options ?? []
    return (
      <Select
        value={String(entry.defaultValue ?? '')}
        disabled={disabled}
        ariaLabel={`${entryLabel} 默认枚举值`}
        placeholder={options.length > 0 ? '请选择' : '暂无选项'}
        options={options.map((option) => ({
          value: String(option.value),
          label: formatEnumOptionLabel(option),
        }))}
        onValueChange={(value) => {
          const option = options.find(
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
  /** 枚举选项逐项编辑；值留空代表 key=标签（无索引） */
  enumOptions: ContractEnumOptionDraft[]
  /** 选项行内标记为默认值的行 */
  defaultOptionIndex: number
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
  /** 运行属性保存行的“绑定”徽标;表单不再提供 bindable 编辑 */
  isBindable?: (entry: T) => boolean
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
  isBindable,
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
          ? enumOptionsIssue(draft.enumOptions)
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
      enumOptions: [],
      defaultOptionIndex: 0,
    })
  }

  function startEdit(key: string) {
    const options = entries[key].options ?? []
    const defaultIndex = options.findIndex(
      (option) => option.value === entries[key].defaultValue,
    )
    setDraft({
      originalKey: key,
      draftKey: key,
      entry: entries[key],
      enumOptions: enumRowsFromEntry(options),
      defaultOptionIndex: defaultIndex >= 0 ? defaultIndex : 0,
    })
  }

  function saveDraft() {
    if (!draft || saveBlockedReason) return

    const key = draftKey
    const options = draft.entry.kind === 'select'
      ? materializeEnumRows(draft.enumOptions)
      : draft.entry.options
    const entry = {
      ...draft.entry,
      title: key,
      options,
      defaultValue: draft.entry.kind === 'select'
        ? markedOptionDefault(draft.enumOptions, draft.defaultOptionIndex, options ?? [])
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
              onDraftChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={saveDraft}
            />
          )
        }

        return (
          <div className="contract-row-item" key={key}>
            <div className="contract-row-display">
              <span className="contract-row-name">{key}</span>
              <div className="contract-row-value">
                <ContractRowValueEditor
                  entry={entry}
                  entryLabel={entryLabel}
                  disabled={readOnly}
                  onChange={(defaultValue) => updateEntry(key, { ...entry, defaultValue })}
                />
              </div>
              {entry.description && (
                <span className="contract-row-description">{entry.description}</span>
              )}
              {isBindable?.(entry) && (
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
  onDraftChange,
  onCancel,
  onSave,
}: {
  draft: ContractRowDraft<T>
  saveBlockedReason: string | null
  entryLabel: string
  onDraftChange: (draft: ContractRowDraft<T>) => void
  onCancel: () => void
  onSave: () => void
}) {
  const entry = draft.entry

  function updateEnumOption(index: number, patch: Partial<ContractEnumOptionDraft>) {
    onDraftChange({
      ...draft,
      enumOptions: draft.enumOptions.map((option, currentIndex) => {
        if (currentIndex !== index) return option
        const next = { ...option, ...patch }
        // 填写 key 时，空 value（或仍等于旧 key 的同步态）自动跟随 key
        if (patch.label !== undefined && (option.value === '' || option.value === option.label)) {
          next.value = patch.label
        }
        return next
      }),
    })
  }

  function insertEnumOptionAfter(index: number) {
    const next = [...draft.enumOptions]
    next.splice(index + 1, 0, { label: '', value: '' })
    onDraftChange({ ...draft, enumOptions: next })
  }

  function removeEnumOption(index: number) {
    if (draft.enumOptions.length <= 1) return
    onDraftChange({
      ...draft,
      enumOptions: draft.enumOptions.filter((_, currentIndex) => currentIndex !== index),
      defaultOptionIndex: draft.defaultOptionIndex === index
        ? 0
        : draft.defaultOptionIndex > index
          ? draft.defaultOptionIndex - 1
          : draft.defaultOptionIndex,
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
            enumOptions: value === 'select' ? [{ label: '', value: '' }] : [],
            defaultOptionIndex: 0,
          })}
        />
      </label>

      {entry.kind !== 'select' && (
        <label className="contract-row-form-wide">
          <span>默认值</span>
          <ContractRowValueEditor
            entry={entry}
            entryLabel={entryLabel}
            disabled={false}
            onChange={(defaultValue) => onDraftChange({
              ...draft,
              entry: { ...entry, defaultValue },
            })}
          />
        </label>
      )}

      {entry.kind === 'select' && (
        <div className="contract-row-form-wide contract-row-enum-field">
          <span className="contract-row-enum-label">选项</span>
          <div className="contract-row-enum-rows">
            <RadioGroup
              value={draft.defaultOptionIndex}
              ariaLabel="默认枚举选项"
              onValueChange={(index) => onDraftChange({ ...draft, defaultOptionIndex: index })}
            >
              {draft.enumOptions.map((option, index) => (
                <div className="contract-row-enum-row" key={index}>
                  <RadioItem
                    value={index}
                    ariaLabel={`设为默认值：${option.label || `选项 ${index + 1}`}`}
                  />
                  <Input
                    value={option.label}
                    placeholder="key"
                    aria-label={`枚举选项 ${index + 1} key`}
                    spellCheck={false}
                    onChange={(event) => updateEnumOption(index, { label: event.target.value })}
                  />
                  <Input
                    className="contract-row-enum-value"
                    value={option.value}
                    placeholder="value（空=key）"
                    aria-label={`枚举选项 ${index + 1} value`}
                    spellCheck={false}
                    onChange={(event) => updateEnumOption(index, { value: event.target.value })}
                  />
                  <IconButton
                    className="contract-row-enum-op"
                    title="在下方插入选项"
                    aria-label={`在选项 ${index + 1} 下方插入选项`}
                    onClick={() => insertEnumOptionAfter(index)}
                  >
                    <PlusIcon />
                  </IconButton>
                  <IconButton
                    className="contract-row-enum-op contract-row-enum-op-minus"
                    title={draft.enumOptions.length <= 1 ? '至少保留一个选项' : '删除此选项'}
                    aria-label={`删除选项 ${index + 1}`}
                    disabled={draft.enumOptions.length <= 1}
                    onClick={() => removeEnumOption(index)}
                  >
                    <MinusIcon />
                  </IconButton>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      )}

      <label className="contract-row-form-wide contract-row-form-description">
        <span>说明</span>
        <Textarea
          rows={2}
          value={entry.description ?? ''}
          placeholder="说明"
          onChange={(event) => onDraftChange({
            ...draft,
            entry: { ...entry, description: event.target.value },
          })}
        />
      </label>

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
