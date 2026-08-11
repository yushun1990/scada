import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentPropertyDefinition,
  type ComponentScalarValue,
} from '../../component-system/definition'
import type { PreviewRuntimeValueSourceDefinition } from '../../runtime'
import type { DataBinding } from '../../scene/model'
import { Checkbox, Input, NumberInput, Select } from '../../ui'

type ComponentPropertiesInspectorProps = {
  definition: ComponentDefinition
  values: Readonly<Record<string, ComponentScalarValue>>
  bindings: readonly DataBinding[]
  runtimeSources: readonly PreviewRuntimeValueSourceDefinition[]
  onChange: (
    key: string,
    value: ComponentScalarValue,
    commitImmediately: boolean,
  ) => void
  onBindingChange: (key: string, runtimeKey: string | null) => void
  onCommit: () => void
}

function valueForTextInput(value: ComponentScalarValue) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}

function renderPropertyInput(
  key: string,
  property: ComponentPropertyDefinition,
  value: ComponentScalarValue,
  onChange: ComponentPropertiesInspectorProps['onChange'],
) {
  if (property.kind === 'boolean') {
    return (
      <Checkbox
        className="checkbox-field property-toggle"
        checked={value === true}
        label={property.title}
        onCheckedChange={(checked) => onChange(key, checked, true)}
      />
    )
  }

  if (property.kind === 'select') {
    return (
      <label className="property-field">
        <span>{property.title}</span>
        <Select
          value={valueForTextInput(value)}
          ariaLabel={property.title}
          options={(property.options ?? []).map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          onValueChange={(nextValue) => {
            const option = property.options?.find(
              (candidate) => String(candidate.value) === nextValue,
            )

            if (option) {
              onChange(key, option.value, true)
            }
          }}
        />
        {property.description && <small>{property.description}</small>}
      </label>
    )
  }

  if (property.kind === 'number') {
    return (
      <label className="property-field">
        <span>{property.title}</span>
        <NumberInput
          key={`${key}:${String(value)}`}
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(event) => {
            const nextValue = Number(event.currentTarget.value)

            if (event.currentTarget.value !== '' && Number.isFinite(nextValue)) {
              onChange(key, nextValue, true)
            }
          }}
        />
        {property.description && <small>{property.description}</small>}
      </label>
    )
  }

  if (property.kind === 'color') {
    return (
      <label className="property-field">
        <span>{property.title}</span>
        <Input
          key={`${key}:${String(value)}`}
          className="color-input"
          type="color"
          defaultValue={typeof value === 'string' ? value : '#000000'}
          onBlur={(event) => onChange(key, event.currentTarget.value, true)}
        />
        {property.description && <small>{property.description}</small>}
      </label>
    )
  }

  return (
    <label className="property-field">
      <span>{property.title}</span>
      <Input
        key={`${key}:${String(value)}`}
        defaultValue={valueForTextInput(value)}
        onBlur={(event) => onChange(key, event.currentTarget.value, true)}
      />
      {property.description && <small>{property.description}</small>}
    </label>
  )
}

function getCompatibleRuntimeSources(
  property: ComponentPropertyDefinition,
  runtimeSources: readonly PreviewRuntimeValueSourceDefinition[],
) {
  return runtimeSources.filter(
    (source) =>
      source.values.length > 0 &&
      source.values.every((value) => isComponentPropertyValue(property, value)),
  )
}

export function ComponentPropertiesInspector({
  definition,
  values,
  bindings,
  runtimeSources,
  onChange,
  onBindingChange,
}: ComponentPropertiesInspectorProps) {
  const properties = Object.entries(definition.properties)

  if (properties.length === 0) {
    return null
  }

  return (
    <CollapsibleInspectorGroup title="组件属性">
      {properties.map(([key, property]) => {
        const binding = bindings.find((candidate) => candidate.property === key)
        const compatibleSources = property.bindable
          ? getCompatibleRuntimeSources(property, runtimeSources)
          : []
        const knownBinding = binding
          ? compatibleSources.some(
              (source) => source.key === binding.source.key,
            )
          : false
        const bindingOptions = [
          { value: '', label: '未绑定 · 使用设计值' },
          ...(binding && !knownBinding
            ? [{ value: binding.source.key, label: binding.source.key }]
            : []),
          ...compatibleSources.map((source) => ({
            value: source.key,
            label: source.title,
          })),
        ]

        return (
          <div key={key}>
            {renderPropertyInput(
              key,
              property,
              values[key] ?? property.defaultValue,
              onChange,
            )}

            {property.bindable && (
              <label className="property-field">
                <span>数据绑定</span>
                <Select
                  value={binding?.source.key ?? ''}
                  ariaLabel={`${property.title} 数据绑定`}
                  options={bindingOptions}
                  onValueChange={(nextValue) => onBindingChange(key, nextValue || null)}
                />
              </label>
            )}
          </div>
        )
      })}
    </CollapsibleInspectorGroup>
  )
}
