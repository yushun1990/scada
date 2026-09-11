import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'

export type CheckboxProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  readOnly?: boolean
  indeterminate?: boolean
  invalid?: boolean
  className?: string
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  readOnly = false,
  indeterminate = false,
  invalid = false,
  className = '',
}: CheckboxProps) {
  return (
    <label className={`ui-checkbox-field ${className}`.trim()}>
      <BaseCheckbox.Root
        checked={checked}
        disabled={disabled}
        readOnly={readOnly}
        indeterminate={indeterminate}
        aria-invalid={invalid || undefined}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked)}
        className="ui-checkbox"
      >
        <BaseCheckbox.Indicator className="ui-checkbox-indicator" keepMounted>
          {indeterminate ? '−' : '✓'}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  )
}
