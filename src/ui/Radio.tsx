import { Radio as BaseRadio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import type { ReactNode } from 'react'

export type RadioGroupProps<T extends string | number> = {
  value: T
  ariaLabel: string
  className?: string
  onValueChange: (value: T) => void
  children: ReactNode
}

export function RadioGroup<T extends string | number>({
  value,
  ariaLabel,
  className = '',
  onValueChange,
  children,
}: RadioGroupProps<T>) {
  return (
    <BaseRadioGroup
      aria-label={ariaLabel}
      value={value}
      className={`ui-radio-group ${className}`.trim()}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
    >
      {children}
    </BaseRadioGroup>
  )
}

export type RadioItemProps = {
  value: string | number
  ariaLabel: string
  className?: string
  disabled?: boolean
}

export function RadioItem({
  value,
  ariaLabel,
  className = '',
  disabled = false,
}: RadioItemProps) {
  return (
    <BaseRadio.Root
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`ui-radio ${className}`.trim()}
    >
      <BaseRadio.Indicator className="ui-radio-indicator" keepMounted />
    </BaseRadio.Root>
  )
}
