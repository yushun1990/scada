import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'

export type SegmentedControlItem<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  value: T
  items: Array<SegmentedControlItem<T>>
  onValueChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  items,
  onValueChange,
  ariaLabel,
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
      {items.map((item) => (
        <Toggle
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={`ui-segmented-item${item.value === value ? ' is-active' : ''}`}
          aria-label={item.label}
        >
          {item.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
