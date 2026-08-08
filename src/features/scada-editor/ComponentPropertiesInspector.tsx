import type {
  ComponentDefinition,
  ComponentPropertyDefinition,
  ComponentScalarValue,
} from '../../component-system/definition'

type ComponentPropertiesInspectorProps = {
  definition: ComponentDefinition
  values: Readonly<Record<string, ComponentScalarValue>>
  onChange: (
    key: string,
    value: ComponentScalarValue,
    commitImmediately: boolean,
  ) => void
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
  onCommit: ComponentPropertiesInspectorProps['onCommit'],
) {
  if (property.kind === 'boolean') {
    return (
      <label key={key} className="checkbox-field property-toggle">
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
      <label key={key} className="property-field">
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
      <label key={key} className="property-field">
        <span>{property.title}</span>
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => {
            const nextValue = Number(event.target.value)

            if (Number.isFinite(nextValue)) {
              onChange(key, nextValue, false)
            }
          }}
          onBlur={onCommit}
        />
        {property.description && <small>{property.description}</small>}
      </label>
    )
  }

  if (property.kind === 'color') {
    return (
      <label key={key} className="property-field">
        <span>{property.title}</span>
        <input
          className="color-input"
          type="color"
          value={typeof value === 'string' ? value : '#000000'}
          onChange={(event) => onChange(key, event.target.value, false)}
          onBlur={onCommit}
        />
        {property.description && <small>{property.description}</small>}
      </label>
    )
  }

  return (
    <label key={key} className="property-field">
      <span>{property.title}</span>
      <input
        value={valueForTextInput(value)}
        onChange={(event) => onChange(key, event.target.value, false)}
        onBlur={onCommit}
      />
      {property.description && <small>{property.description}</small>}
    </label>
  )
}

export function ComponentPropertiesInspector({
  definition,
  values,
  onChange,
  onCommit,
}: ComponentPropertiesInspectorProps) {
  const properties = Object.entries(definition.properties)

  if (properties.length === 0) {
    return null
  }

  return (
    <fieldset className="inspector-group">
      <legend>组件属性</legend>
      {properties.map(([key, property]) =>
        renderPropertyInput(
          key,
          property,
          values[key] ?? property.defaultValue,
          onChange,
          onCommit,
        ),
      )}
    </fieldset>
  )
}
