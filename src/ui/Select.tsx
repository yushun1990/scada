import { Select as BaseSelect } from '@base-ui/react/select'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectProps = {
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Select({
  value,
  options,
  onValueChange,
  ariaLabel,
  placeholder = '请选择',
  disabled = false,
  className = '',
}: SelectProps) {
  return (
    <BaseSelect.Root
      value={value}
      disabled={disabled}
      items={options}
      onValueChange={(nextValue) => {
        if (typeof nextValue === 'string') {
          onValueChange(nextValue)
        }
      }}
    >
      <BaseSelect.Trigger
        className={`ui-select-trigger ${className}`.trim()}
        aria-label={ariaLabel}
      >
        <BaseSelect.Value className="ui-select-value" placeholder={placeholder} />
        <BaseSelect.Icon className="ui-select-icon">⌄</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="ui-select-positioner" sideOffset={4}>
          <BaseSelect.Popup className="ui-select-popup">
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="ui-select-item"
              >
                <BaseSelect.ItemIndicator className="ui-select-item-indicator">✓</BaseSelect.ItemIndicator>
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
