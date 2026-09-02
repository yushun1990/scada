import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  isComponentPropertyValue,
  type ComponentAttributeDefinition,
  type ComponentDefinition,
  type ComponentPropertyDefinition,
  type ComponentScalarValue,
} from '../../component-system/definition'
import type { PreviewRuntimeValueSourceDefinition } from '../../runtime'
import type { DataBinding } from '../../scene/model'
import { Checkbox, Input, NumberInput, Select } from '../../ui'

type ComponentPropertiesInspectorProps = {
  definition: ComponentDefinition
  attributes: Readonly<Record<string, ComponentScalarValue>>
  propertyFallbacks: Readonly<Record<string, ComponentScalarValue>>
  bindings: readonly DataBinding[]
  runtimeSources: readonly PreviewRuntimeValueSourceDefinition[]
  onAttributeChange: (
    key: string,
    value: ComponentScalarValue,
    commitImmediately: boolean,
  ) => void
  onPropertyChange: (
    key: string,
    value: ComponentScalarValue,
    commitImmediately: boolean,
  ) => void
  onBindingChange: (key: string, runtimeKey: string | null) => void
}

function valueForTextInput(value: ComponentScalarValue) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}

type EditableScalarDefinition = ComponentAttributeDefinition | ComponentPropertyDefinition

type ScalarChangeHandler = ComponentPropertiesInspectorProps['onAttributeChange']

function renderScalarInput(
  key: string,
  definition: EditableScalarDefinition,
  value: ComponentScalarValue,
  onChange: ScalarChangeHandler,
  ariaPrefix: string,
) {
  if (definition.kind === 'boolean') {
    return (
      <Checkbox
        className="checkbox-field property-toggle"
        checked={value === true}
        label={definition.title}
        onCheckedChange={(checked) => onChange(key, checked, true)}
      />
    )
  }

  if (definition.kind === 'select') {
    return (
      <label className="property-field">
        <span>{definition.title}</span>
        <Select
          value={valueForTextInput(value)}
          ariaLabel={`${ariaPrefix} ${definition.title}`}
          options={(definition.options ?? []).map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          onValueChange={(nextValue) => {
            const option = definition.options?.find(
              (candidate) => String(candidate.value) === nextValue,
            )

            if (option) {
              onChange(key, option.value, true)
            }
          }}
        />
        {definition.description && <small>{definition.description}</small>}
      </label>
    )
  }

  if (definition.kind === 'number') {
    return (
      <label className="property-field">
        <span>{definition.title}</span>
        <NumberInput
          key={`${ariaPrefix}:${key}:${String(value)}`}
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(event) => {
            const nextValue = Number(event.currentTarget.value)

            if (event.currentTarget.value !== '' && Number.isFinite(nextValue)) {
              onChange(key, nextValue, true)
            }
          }}
        />
        {definition.description && <small>{definition.description}</small>}
      </label>
    )
  }

  if (definition.kind === 'color') {
    return (
      <label className="property-field">
        <span>{definition.title}</span>
        <Input
          key={`${ariaPrefix}:${key}:${String(value)}`}
          className="color-input"
          type="color"
          defaultValue={typeof value === 'string' ? value : '#000000'}
          onBlur={(event) => onChange(key, event.currentTarget.value, true)}
        />
        {definition.description && <small>{definition.description}</small>}
      </label>
    )
  }

  return (
    <label className="property-field">
      <span>{definition.title}</span>
      <Input
        key={`${ariaPrefix}:${key}:${String(value)}`}
        defaultValue={valueForTextInput(value)}
        onBlur={(event) => onChange(key, event.currentTarget.value, true)}
      />
      {definition.description && <small>{definition.description}</small>}
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
  attributes,
  propertyFallbacks,
  bindings,
  runtimeSources,
  onAttributeChange,
  onPropertyChange,
  onBindingChange,
}: ComponentPropertiesInspectorProps) {
  const attributeEntries = Object.entries(definition.attributes)
  const propertyEntries = Object.entries(definition.properties)

  if (attributeEntries.length === 0 && propertyEntries.length === 0) {
    return null
  }

  return (
    <>
      {attributeEntries.length > 0 && (
        <CollapsibleInspectorGroup title="组件配置 · Attributes">
          <p className="component-inspector-help">
            静态 authored 配置，只保存到 Scene Attributes；运行时数据绑定不会写入这里。
          </p>
          {attributeEntries.map(([key, attribute]) => (
            <div key={key}>
              {renderScalarInput(
                key,
                attribute,
                attributes[key] ?? attribute.defaultValue,
                onAttributeChange,
                'Attribute',
              )}
            </div>
          ))}
        </CollapsibleInspectorGroup>
      )}

      {propertyEntries.length > 0 && (
        <CollapsibleInspectorGroup title="运行属性 · Properties">
          <p className="component-inspector-help">
            运行时语义值与数据绑定目标；未绑定时使用这里保存的设计 fallback。
          </p>
          {propertyEntries.map(([key, property]) => {
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
                {renderScalarInput(
                  key,
                  property,
                  propertyFallbacks[key] ?? property.defaultValue,
                  onPropertyChange,
                  'Property',
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
      )}
    </>
  )
}
