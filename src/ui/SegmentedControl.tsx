import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import type { ReactNode } from 'react'

export type SegmentedControlItem<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  value: T
  items: Array<SegmentedControlItem<T>>
  onValueChange: (value: T) => void
  ariaLabel: string
  iconOnly?: boolean
  expandActive?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  items,
  onValueChange,
  ariaLabel,
  iconOnly = false,
  expandActive = false,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      className={`ui-segmented-control ${className}`.trim()}
      onValueChange={(nextValues) => {
        const nextValue = nextValues[0]
        if (nextValue) {
          onValueChange(nextValue as T)
        }
      }}
    >
      {items.map((item) => {
        const isActive = item.value === value
        const itemClassName = [
          'ui-segmented-item',
          isActive ? 'is-active' : '',
          expandActive ? (isActive ? 'is-expanded' : 'is-collapsed') : '',
        ].filter(Boolean).join(' ')

        return (
          <Toggle
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={itemClassName}
            aria-label={item.label}
            title={item.label}
          >
            {item.icon && <span className="ui-segmented-item-icon">{item.icon}</span>}
            {!iconOnly && <span className="ui-segmented-item-label">{item.label}</span>}
          </Toggle>
        )
      })}
    </ToggleGroup>
  )
}
