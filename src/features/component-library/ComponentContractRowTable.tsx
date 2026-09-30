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
  Select,
} from '../../ui'
import { EditIcon, TrashIcon } from '../../components/toolbar-icons'
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

const OPTION_LIST_PLACEHOLDER = 'run, stop, alarm 或 run=1, stop=2'
const OPTION_LIST_HINT =
  '选项用逗号分隔；每项可写 标签=值，或只写标签（值=标签）；纯数字值保存为 number；枚举至少需要一个选项且值不能重复'

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

/**
 * 枚举选项解析：逗号分隔；每项 `标题=值` 或只写标签（值=标签）。
 * 与 definition validation 一致：至少一项、标签非空、值不重复。
 */
function parseOptions(value: string): ComponentValueOption[] {
  return value
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=')
      const label = separator >= 0 ? part.slice(0, separator).trim() : part
      const rawValue = separator >= 0 ? part.slice(separator + 1) : part

      return {
        label: label || rawValue.trim(),
        value: parseOptionValue(rawValue),
      }
    })
}

function formatOptions(options: readonly ComponentValueOption[] | undefined) {
  return (options ?? [])
    .map((option) =>
      String(option.value) === option.label
        ? option.label
        : `${option.label}=${String(option.value)}`,
    )
    .join(', ')
}

function selectOptionsIssue(optionsText: string): string | null {
  const parsed = parseOptions(optionsText)
  if (parsed.length === 0) return '枚举至少需要一个选项'

  const seen = new Set<string>()
  for (const option of parsed) {
    if (!option.label.trim()) return '枚举选项的标题不能为空'
    const identity = `${typeof option.value}:${String(option.value)}`
    if (seen.has(identity)) return `枚举选项值重复：${String(option.value)}`
    seen.add(identity)
  }
  return null
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
  /** 枚举选项以草稿文本编辑，仅在默认值下拉和保存时解析，避免输入被回写重写 */
  optionsText: string
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
          ? selectOptionsIssue(draft.optionsText)
          : null

  function updateEntry(key: string, entry: T) {
    onEntriesChange({ ...entries, [key]: entry })
  }

  function startCreate() {
    const key = nextContractKey(keyPrefix, Object.keys(entries))
    setDraft({ originalKey: null, draftKey: key, entry: createEntry(key), optionsText: '' })
  }

  function startEdit(key: string) {
    setDraft({
      originalKey: key,
      draftKey: key,
      entry: entries[key],
      optionsText: formatOptions(entries[key].options),
    })
  }

  function saveDraft() {
    if (!draft || saveBlockedReason) return

    const key = draftKey
    const options = draft.entry.kind === 'select'
      ? parseOptions(draft.optionsText)
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
    ? { ...entry, options: parseOptions(draft.optionsText) }
    : entry

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
            optionsText: '',
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
        <label className="contract-row-form-wide">
          <span>选项</span>
          <Input
            className="contract-row-options-input"
            value={draft.optionsText}
            placeholder={OPTION_LIST_PLACEHOLDER}
            title={OPTION_LIST_HINT}
            aria-label={`${entryLabel} 枚举选项`}
            spellCheck={false}
            onChange={(event) => onDraftChange({ ...draft, optionsText: event.target.value })}
          />
        </label>
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
