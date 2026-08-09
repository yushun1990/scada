import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentPropertyDefinition,
  type ComponentScalarValue,
} from '../../component-system/definition'
import type { PreviewRuntimeValueSourceDefinition } from '../../runtime'
import type { DataBinding } from '../../scene/model'

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
      <label className="checkbox-field property-toggle">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(key, event.target.checked, true)}
        />
        <span>{property.title}</span>
      </label>
    )
  }

  if (property.kind === 'select') {
    return (
      <label className="property-field">
        <span>{property.title}</span>
        <select
          value={valueForTextInput(value)}
          onChange={(event) => {
            const option = property.options?.find(
              (candidate) => String(candidate.value) === event.target.value,
            )

            if (option) {
              onChange(key, option.value, true)
            }
          }}
        >
          {(property.options ?? []).map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        {property.description && <small>{property.description}</small>}
      </label>
    )
  }

  if (property.kind === 'number') {
    return (
      <label className="property-field">
        <span>{property.title}</span>
        <input
          key={`${key}:${String(value)}`}
          type="number"
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
        <input
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
      <input
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
    <fieldset className="inspector-group">
      <legend>组件属性</legend>
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
                <select
                  value={binding?.source.key ?? ''}
                  onChange={(event) =>
                    onBindingChange(key, event.target.value || null)
                  }
                >
                  <option value="">未绑定 · 使用设计值</option>
                  {binding && !knownBinding && (
                    <option value={binding.source.key}>
                      {binding.source.key}
                    </option>
                  )}
                  {compatibleSources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
