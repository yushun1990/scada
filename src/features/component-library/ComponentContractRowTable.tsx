import { useState } from 'react'
import type {
  ComponentScalarValue,
  ComponentValueKind,
  ComponentValueOption,
} from '../../component-system/definition'
import {
  Button,
  Checkbox,
  Input,
  NumberInput,
  Select,
} from '../../ui'
import { ColorPickerInput } from './ColorPickerInput'
import './component-contract-rows.css'

/**
 * Public-contract row shape shared by the Attribute and Property contract
 * editors. Saved entries render like inspector attribute rows
 * (名称 + 按类型的值控件 + 编辑/删除); adding or editing opens one compact
 * labeled form (名称 / 类型 / 默认值 / 说明 / 枚举选项) committed by 保存.
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

const OPTION_LIST_PLACEHOLDER = '关闭=closed, 打开=open'
const OPTION_LIST_HINT = '每项格式：标题=值；多项用逗号分隔；纯数字值保存为 number'

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
  if (kind === 'select') return 'value1'
  return ''
}

function defaultContractOptionsForKind(kind: ComponentValueKind) {
  return kind === 'select' ? [{ label: '选项 1', value: 'value1' }] : undefined
}

export function createContractRowEntry(
  key: string,
  kind: ComponentValueKind = 'string',
): ContractRowEntry {
  return {
    title: key,
    kind,
    defaultValue: defaultContractValueForKind(kind),
    options: defaultContractOptionsForKind(kind),
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
    options: defaultContractOptionsForKind(kind),
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

function formatOptions(options: readonly ComponentValueOption[] | undefined) {
  return (options ?? []).map((option) => `${option.label}=${String(option.value)}`).join(', ')
}

function parseOptionValue(value: string): string | number {
  const trimmed = value.trim()

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) return numeric
  }

  return trimmed
}

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

function applyOptionsText<T extends ContractRowEntry>(entry: T, text: string): T {
  const options = parseOptions(text)
  const currentDefaultValid = options.some((option) => option.value === entry.defaultValue)

  return {
    ...entry,
    options,
    defaultValue: currentDefaultValid ? entry.defaultValue : options[0]?.value ?? '',
  }
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
  const draftKeyInvalid = Boolean(
    draft && (!draftKey || (draftKey !== draft.originalKey && entries[draftKey])),
  )

  function updateEntry(key: string, entry: T) {
    onEntriesChange({ ...entries, [key]: entry })
  }

  function startCreate() {
    const key = nextContractKey(keyPrefix, Object.keys(entries))
    setDraft({ originalKey: null, draftKey: key, entry: createEntry(key) })
  }

  function startEdit(key: string) {
    setDraft({ originalKey: key, draftKey: key, entry: entries[key] })
  }

  function saveDraft() {
    if (!draft || draftKeyInvalid) return

    const key = draftKey
    const entry = { ...draft.entry, title: key } as T

    if (draft.originalKey === null) {
      onEntriesChange({ ...entries, [key]: entry })
    } else if (draft.originalKey === key) {
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
              draftKeyInvalid={draftKeyInvalid}
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
              <span className="contract-row-name" title={entry.description || key}>
                {key}
              </span>
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
                  <Button
                    variant="ghost"
                    size="small"
                    className="contract-row-action"
                    onClick={() => startEdit(key)}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    className="contract-row-action contract-row-action-danger"
                    onClick={() => onEntriesChange(
                      Object.fromEntries(
                        Object.entries(entries).filter(([current]) => current !== key),
                      ),
                    )}
                  >
                    删除
                  </Button>
                </span>
              )}
            </div>
          </div>
        )
      })}

      {draft?.originalKey === null && (
        <ContractRowForm
          draft={draft}
          draftKeyInvalid={draftKeyInvalid}
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
  draftKeyInvalid,
  entryLabel,
  bindableOption,
  onDraftChange,
  onCancel,
  onSave,
}: {
  draft: ContractRowDraft<T>
  draftKeyInvalid: boolean
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
          })}
        />
      </label>

      <label>
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
            value={formatOptions(entry.options)}
            placeholder={OPTION_LIST_PLACEHOLDER}
            title={OPTION_LIST_HINT}
            onChange={(event) => onDraftChange({
              ...draft,
              entry: applyOptionsText(entry, event.target.value),
            })}
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
          disabled={draftKeyInvalid}
          title={draftKeyInvalid ? '名称不能为空，且不能与现有条目重复' : undefined}
        >
          保存
        </Button>
      </div>
    </form>
  )
}
