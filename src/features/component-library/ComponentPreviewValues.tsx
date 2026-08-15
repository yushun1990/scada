import type {
  ComponentDefinition,
  ComponentProps,
  ComponentPropertyDefinition,
  ComponentScalarValue,
} from '../../component-system/definition'
import { Checkbox, Input, NumberInput, Select } from '../../ui'

function PreviewValueEditor({
  property,
  value,
  onChange,
}: {
  property: ComponentPropertyDefinition
  value: ComponentScalarValue
  onChange: (value: ComponentScalarValue) => void
}) {
  if (property.kind === 'boolean') {
    return (
      <Checkbox
        checked={Boolean(value)}
        label={Boolean(value) ? 'true' : 'false'}
        onCheckedChange={onChange}
      />
    )
  }

  if (property.kind === 'number') {
    return (
      <NumberInput
        value={typeof value === 'number' ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (property.kind === 'select') {
    return (
      <Select
        value={String(value ?? '')}
        ariaLabel={`${property.title} 预览值`}
        options={(property.options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onValueChange={(next) => {
          const option = property.options?.find((candidate) => String(candidate.value) === next)
          onChange(option?.value ?? next)
        }}
      />
    )
  }

  return (
    <Input
      type={property.kind === 'color' ? 'color' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function ComponentPreviewValues({
  definition,
  values,
  onChange,
}: {
  definition: ComponentDefinition
  values: ComponentProps
  onChange: (values: ComponentProps) => void
}) {
  const properties = Object.entries(definition.properties)

  if (properties.length === 0) {
    return <p className="component-inspector-help">尚未定义公开 Property，当前没有可模拟的预览值。</p>
  }

  return (
    <div className="component-preview-values">
      <p className="component-inspector-help">
        这些值只用于当前 Preview 会话，不修改组件默认值，也不会保存进 Component Package。
      </p>
      {properties.map(([key, property]) => (
        <label className="property-field" key={key}>
          <span>{property.title || key} <code>{key}</code></span>
          <PreviewValueEditor
            property={property}
            value={values[key] ?? property.defaultValue}
            onChange={(value) => onChange({ ...values, [key]: value })}
          />
        </label>
      ))}
    </div>
  )
}
