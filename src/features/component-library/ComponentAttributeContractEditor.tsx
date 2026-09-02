import { useState } from 'react'
import type {
  ComponentAttributeDefinition,
  ComponentDefinition,
  ComponentValueKind,
  ComponentValueOption,
} from '../../component-system/definition'
import {
  Button,
  Checkbox,
  Input,
  NumberInput,
  Pressable,
  Select,
  Textarea,
} from '../../ui'
import './component-property-contract.css'

type ComponentAttributeContractEditorProps = {
  definition: ComponentDefinition
  readOnly: boolean
  onChange: (definition: ComponentDefinition) => void
}

const VALUE_KIND_LABELS: Record<ComponentValueKind, string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  color: '颜色',
  select: '枚举',
}

const VALUE_KIND_OPTIONS = Object.entries(VALUE_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}))

function nextUniqueKey(prefix: string, keys: readonly string[]) {
  const keySet = new Set(keys)
  let index = 1
  while (keySet.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

function defaultValueForKind(kind: ComponentValueKind) {
  if (kind === 'number') return 0
  if (kind === 'boolean') return false
  if (kind === 'color') return '#2563eb'
  if (kind === 'select') return 'value1'
  return ''
}

function createAttribute(kind: ComponentValueKind = 'string'): ComponentAttributeDefinition {
  return {
    title: '新配置',
    kind,
    defaultValue: defaultValueForKind(kind),
    options: kind === 'select' ? [{ label: '选项 1', value: 'value1' }] : undefined,
  }
}

function convertAttributeKind(
  attribute: ComponentAttributeDefinition,
  kind: ComponentValueKind,
): ComponentAttributeDefinition {
  if (attribute.kind === kind) return attribute

  return {
    title: attribute.title,
    description: attribute.description,
    kind,
    defaultValue: defaultValueForKind(kind),
    options: kind === 'select' ? [{ label: '选项 1', value: 'value1' }] : undefined,
  }
}

function formatOptions(options: readonly ComponentValueOption[] | undefined) {
  return (options ?? []).map((option) => `${option.label}=${String(option.value)}`).join('\n')
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
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('=')
      const label = separator >= 0 ? line.slice(0, separator).trim() : line
      const rawValue = separator >= 0 ? line.slice(separator + 1) : line

      return {
        label: label || rawValue.trim(),
        value: parseOptionValue(rawValue),
      }
    })
}

function defaultLabel(attribute: ComponentAttributeDefinition) {
  if (attribute.kind === 'boolean') return attribute.defaultValue ? '开启' : '关闭'

  if (attribute.kind === 'select') {
    const selected = attribute.options?.find(
      (option) => option.value === attribute.defaultValue,
    )
    const label = selected?.label ?? String(attribute.defaultValue ?? '—')
    const count = attribute.options?.length ?? 0
    return count > 0 ? `${label} · ${count}项` : label
  }

  if (attribute.defaultValue === null || attribute.defaultValue === '') return '空'
  return String(attribute.defaultValue)
}

function ContractKeyInput({
  value,
  disabled,
  onCommit,
}: {
  value: string
  disabled: boolean
  onCommit: (value: string) => void
}) {
  return (
    <Input
      key={value}
      defaultValue={value}
      disabled={disabled}
      onBlur={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function AttributeDefaultEditor({
  attribute,
  disabled,
  onChange,
}: {
  attribute: ComponentAttributeDefinition
  disabled: boolean
  onChange: (value: ComponentAttributeDefinition['defaultValue']) => void
}) {
  if (attribute.kind === 'boolean') {
    return (
      <Checkbox
        className="contract-checkbox"
        checked={Boolean(attribute.defaultValue)}
        disabled={disabled}
        label="默认开启"
        onCheckedChange={onChange}
      />
    )
  }

  if (attribute.kind === 'number') {
    return (
      <NumberInput
        value={typeof attribute.defaultValue === 'number' ? attribute.defaultValue : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (attribute.kind === 'color') {
    return (
      <Input
        type="color"
        value={typeof attribute.defaultValue === 'string' ? attribute.defaultValue : '#2563eb'}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (attribute.kind === 'select') {
    return (
      <Select
        value={String(attribute.defaultValue ?? '')}
        disabled={disabled}
        ariaLabel="Attribute 默认枚举值"
        options={(attribute.options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onValueChange={(value) => {
          const option = attribute.options?.find(
            (candidate) => String(candidate.value) === value,
          )
          onChange(option?.value ?? value)
        }}
      />
    )
  }

  return (
    <Input
      value={typeof attribute.defaultValue === 'string' ? attribute.defaultValue : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function ComponentAttributeContractEditor({
  definition,
  readOnly,
  onChange,
}: ComponentAttributeContractEditorProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  function updateAttribute(key: string, attribute: ComponentAttributeDefinition) {
    onChange({
      ...definition,
      attributes: { ...definition.attributes, [key]: attribute },
    })
  }

  function renameAttribute(oldKey: string, nextKey: string) {
    const normalized = nextKey.trim()
    if (!normalized || (normalized !== oldKey && definition.attributes[normalized])) return

    const attributes = Object.fromEntries(
      Object.entries(definition.attributes).map(([key, attribute]) => [
        key === oldKey ? normalized : key,
        attribute,
      ]),
    ) as ComponentDefinition['attributes']

    onChange({ ...definition, attributes })
    setExpandedKey(normalized)
  }

  function removeAttribute(key: string) {
    const attributes = { ...definition.attributes }
    delete attributes[key]
    onChange({ ...definition, attributes })
    setExpandedKey((current) => current === key ? null : current)
  }

  function addAttribute() {
    const key = nextUniqueKey('attribute', Object.keys(definition.attributes))
    onChange({
      ...definition,
      attributes: { ...definition.attributes, [key]: createAttribute() },
    })
    setExpandedKey(key)
  }

  return (
    <div className="property-contract-list">
      {Object.entries(definition.attributes).map(([key, attribute]) => {
        const expanded = expandedKey === key
        const detailId = `attribute-contract-detail-${encodeURIComponent(key)}`

        return (
          <article
            className={`property-contract-item${expanded ? ' is-open' : ''}`}
            key={key}
          >
            <Pressable
              className="property-contract-summary"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setExpandedKey(expanded ? null : key)}
            >
              <span className="property-contract-identity">
                <strong>{attribute.title || key}</strong>
                <code>{key}</code>
              </span>
              <span className="property-contract-kind">{VALUE_KIND_LABELS[attribute.kind]}</span>
              <span className="property-contract-default" title={defaultLabel(attribute)}>
                {attribute.kind === 'color' && typeof attribute.defaultValue === 'string' && (
                  <span
                    className="property-contract-color"
                    style={{ backgroundColor: attribute.defaultValue }}
                    aria-hidden="true"
                  />
                )}
                <span>{defaultLabel(attribute)}</span>
              </span>
              <span className="property-contract-chevron" aria-hidden="true">›</span>
            </Pressable>

            {expanded && (
              <div className="property-contract-detail" id={detailId}>
                <div className="contract-grid">
                  <label>
                    <span>Key</span>
                    <ContractKeyInput
                      value={key}
                      disabled={readOnly}
                      onCommit={(nextKey) => renameAttribute(key, nextKey)}
                    />
                  </label>
                  <label>
                    <span>标题</span>
                    <Input
                      value={attribute.title}
                      disabled={readOnly}
                      onChange={(event) => updateAttribute(key, {
                        ...attribute,
                        title: event.target.value,
                      })}
                    />
                  </label>
                  <label>
                    <span>类型</span>
                    <Select
                      value={attribute.kind}
                      disabled={readOnly}
                      ariaLabel={`${attribute.title || key} Attribute 类型`}
                      options={VALUE_KIND_OPTIONS}
                      onValueChange={(value) => updateAttribute(
                        key,
                        convertAttributeKind(attribute, value as ComponentValueKind),
                      )}
                    />
                  </label>
                  <label>
                    <span>默认值</span>
                    <AttributeDefaultEditor
                      attribute={attribute}
                      disabled={readOnly}
                      onChange={(defaultValue) => updateAttribute(key, {
                        ...attribute,
                        defaultValue,
                      })}
                    />
                  </label>
                </div>

                {attribute.kind === 'select' && (
                  <label className="contract-block-field">
                    <span>枚举选项（每行 `标题=值`，纯数字值保存为 number）</span>
                    <Textarea
                      rows={4}
                      value={formatOptions(attribute.options)}
                      disabled={readOnly}
                      onChange={(event) => {
                        const options = parseOptions(event.target.value)
                        const currentDefaultValid = options.some(
                          (option) => option.value === attribute.defaultValue,
                        )
                        updateAttribute(key, {
                          ...attribute,
                          options,
                          defaultValue: currentDefaultValid
                            ? attribute.defaultValue
                            : options[0]?.value ?? '',
                        })
                      }}
                    />
                  </label>
                )}

                <label className="contract-block-field">
                  <span>说明</span>
                  <Textarea
                    rows={2}
                    value={attribute.description ?? ''}
                    disabled={readOnly}
                    onChange={(event) => updateAttribute(key, {
                      ...attribute,
                      description: event.target.value,
                    })}
                  />
                </label>

                {!readOnly && (
                  <div className="contract-inline-row">
                    <Button variant="ghost" size="small" onClick={() => removeAttribute(key)}>
                      删除配置
                    </Button>
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}

      {Object.keys(definition.attributes).length === 0 && (
        <div className="contract-empty">尚未定义公开 Attribute。</div>
      )}

      {!readOnly && (
        <Button variant="secondary" size="small" className="contract-add-button" onClick={addAttribute}>
          + 添加配置
        </Button>
      )}
    </div>
  )
}
