import { useState } from 'react'
import type {
  ComponentDefinition,
  ComponentPropertyDefinition,
  ComponentPropertyKind,
  ComponentPropertyOption,
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

type ComponentPropertyContractEditorProps = {
  definition: ComponentDefinition
  readOnly: boolean
  onChange: (definition: ComponentDefinition) => void
}

const PROPERTY_KIND_LABELS: Record<ComponentPropertyKind, string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  color: '颜色',
  select: '枚举',
}

const PROPERTY_KIND_OPTIONS = Object.entries(PROPERTY_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}))

function nextUniqueKey(prefix: string, keys: readonly string[]) {
  const keySet = new Set(keys)
  let index = 1
  while (keySet.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

function defaultValueForKind(kind: ComponentPropertyKind) {
  if (kind === 'number') return 0
  if (kind === 'boolean') return false
  if (kind === 'color') return '#2563eb'
  if (kind === 'select') return 'value1'
  return ''
}

function createProperty(kind: ComponentPropertyKind = 'string'): ComponentPropertyDefinition {
  return {
    title: '新属性',
    kind,
    defaultValue: defaultValueForKind(kind),
    bindable: false,
    options: kind === 'select' ? [{ label: '选项 1', value: 'value1' }] : undefined,
  }
}

function convertPropertyKind(
  property: ComponentPropertyDefinition,
  kind: ComponentPropertyKind,
): ComponentPropertyDefinition {
  if (property.kind === kind) return property

  return {
    title: property.title,
    description: property.description,
    bindable: property.bindable,
    kind,
    defaultValue: defaultValueForKind(kind),
    options: kind === 'select' ? [{ label: '选项 1', value: 'value1' }] : undefined,
  }
}

function formatOptions(options: readonly ComponentPropertyOption[] | undefined) {
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

function parseOptions(value: string): ComponentPropertyOption[] {
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

function propertyDefaultLabel(property: ComponentPropertyDefinition) {
  if (property.kind === 'boolean') return property.defaultValue ? '开启' : '关闭'

  if (property.kind === 'select') {
    const selected = property.options?.find((option) => option.value === property.defaultValue)
    const label = selected?.label ?? String(property.defaultValue ?? '—')
    const count = property.options?.length ?? 0
    return count > 0 ? `${label} · ${count}项` : label
  }

  if (property.defaultValue === null || property.defaultValue === '') return '空'
  return String(property.defaultValue)
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

function PropertyDefaultEditor({
  property,
  disabled,
  onChange,
}: {
  property: ComponentPropertyDefinition
  disabled: boolean
  onChange: (value: ComponentPropertyDefinition['defaultValue']) => void
}) {
  if (property.kind === 'boolean') {
    return (
      <Checkbox
        className="contract-checkbox"
        checked={Boolean(property.defaultValue)}
        disabled={disabled}
        label="默认开启"
        onCheckedChange={onChange}
      />
    )
  }

  if (property.kind === 'number') {
    return (
      <NumberInput
        value={typeof property.defaultValue === 'number' ? property.defaultValue : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (property.kind === 'color') {
    return (
      <Input
        type="color"
        value={typeof property.defaultValue === 'string' ? property.defaultValue : '#2563eb'}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (property.kind === 'select') {
    return (
      <Select
        value={String(property.defaultValue ?? '')}
        disabled={disabled}
        ariaLabel="Property 默认枚举值"
        options={(property.options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onValueChange={(value) => {
          const option = property.options?.find(
            (candidate) => String(candidate.value) === value,
          )
          onChange(option?.value ?? value)
        }}
      />
    )
  }

  return (
    <Input
      value={typeof property.defaultValue === 'string' ? property.defaultValue : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function ComponentPropertyContractEditor({
  definition,
  readOnly,
  onChange,
}: ComponentPropertyContractEditorProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  function updateProperty(key: string, property: ComponentPropertyDefinition) {
    onChange({
      ...definition,
      properties: { ...definition.properties, [key]: property },
    })
  }

  function renameProperty(oldKey: string, nextKey: string) {
    const normalized = nextKey.trim()
    if (!normalized || (normalized !== oldKey && definition.properties[normalized])) return

    const properties = Object.fromEntries(
      Object.entries(definition.properties).map(([key, property]) => [
        key === oldKey ? normalized : key,
        property,
      ]),
    ) as ComponentDefinition['properties']

    onChange({ ...definition, properties })
    setExpandedKey(normalized)
  }

  function removeProperty(key: string) {
    const properties = { ...definition.properties }
    delete properties[key]
    onChange({ ...definition, properties })
    setExpandedKey((current) => current === key ? null : current)
  }

  function addProperty() {
    const key = nextUniqueKey('property', Object.keys(definition.properties))
    onChange({
      ...definition,
      properties: { ...definition.properties, [key]: createProperty() },
    })
    setExpandedKey(key)
  }

  return (
    <div className="property-contract-list">
      {Object.entries(definition.properties).map(([key, property]) => {
        const expanded = expandedKey === key
        const detailId = `property-contract-detail-${encodeURIComponent(key)}`

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
                <strong>{property.title || key}</strong>
                <code>{key}</code>
              </span>
              <span className="property-contract-kind">{PROPERTY_KIND_LABELS[property.kind]}</span>
              <span className="property-contract-default" title={propertyDefaultLabel(property)}>
                {property.kind === 'color' && typeof property.defaultValue === 'string' && (
                  <span
                    className="property-contract-color"
                    style={{ backgroundColor: property.defaultValue }}
                    aria-hidden="true"
                  />
                )}
                <span>{propertyDefaultLabel(property)}</span>
              </span>
              {property.bindable && (
                <span className="property-contract-bindable" title="允许 SCADA 数据绑定">
                  绑定
                </span>
              )}
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
                      onCommit={(nextKey) => renameProperty(key, nextKey)}
                    />
                  </label>
                  <label>
                    <span>标题</span>
                    <Input
                      value={property.title}
                      disabled={readOnly}
                      onChange={(event) => updateProperty(key, {
                        ...property,
                        title: event.target.value,
                      })}
                    />
                  </label>
                  <label>
                    <span>类型</span>
                    <Select
                      value={property.kind}
                      disabled={readOnly}
                      ariaLabel={`${property.title || key} Property 类型`}
                      options={PROPERTY_KIND_OPTIONS}
                      onValueChange={(value) => updateProperty(
                        key,
                        convertPropertyKind(property, value as ComponentPropertyKind),
                      )}
                    />
                  </label>
                  <label>
                    <span>默认值</span>
                    <PropertyDefaultEditor
                      property={property}
                      disabled={readOnly}
                      onChange={(defaultValue) => updateProperty(key, {
                        ...property,
                        defaultValue,
                      })}
                    />
                  </label>
                </div>

                {property.kind === 'select' && (
                  <label className="contract-block-field">
                    <span>枚举选项（每行 `标题=值`，纯数字值保存为 number）</span>
                    <Textarea
                      rows={4}
                      value={formatOptions(property.options)}
                      disabled={readOnly}
                      onChange={(event) => {
                        const options = parseOptions(event.target.value)
                        const currentDefaultValid = options.some(
                          (option) => option.value === property.defaultValue,
                        )
                        updateProperty(key, {
                          ...property,
                          options,
                          defaultValue: currentDefaultValid
                            ? property.defaultValue
                            : options[0]?.value ?? '',
                        })
                      }}
                    />
                  </label>
                )}

                <div className="contract-inline-row property-contract-options">
                  <Checkbox
                    className="contract-checkbox"
                    checked={Boolean(property.bindable)}
                    disabled={readOnly}
                    label="允许 SCADA 数据绑定"
                    onCheckedChange={(checked) => updateProperty(key, {
                      ...property,
                      bindable: checked,
                    })}
                  />
                </div>

                <label className="contract-block-field">
                  <span>说明</span>
                  <Textarea
                    rows={2}
                    value={property.description ?? ''}
                    disabled={readOnly}
                    onChange={(event) => updateProperty(key, {
                      ...property,
                      description: event.target.value,
                    })}
                  />
                </label>

                {!readOnly && (
                  <div className="property-contract-detail-actions">
                    <Button variant="danger" size="small" onClick={() => removeProperty(key)}>
                      删除属性
                    </Button>
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}

      {Object.keys(definition.properties).length === 0 && (
        <div className="contract-empty property-contract-empty">尚未定义公开 Property。</div>
      )}

      {!readOnly && (
        <Button
          variant="secondary"
          size="small"
          className="contract-add-button property-contract-add"
          onClick={addProperty}
        >
          + 添加属性
        </Button>
      )}
    </div>
  )
}
