import { Tabs as BaseTabs } from '@base-ui/react/tabs'

export type StudioTabItem<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

type StudioTabsProps<T extends string> = {
  value: T
  items: Array<StudioTabItem<T>>
  onValueChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function Tabs<T extends string>({
  value,
  items,
  onValueChange,
  ariaLabel,
  className = '',
}: StudioTabsProps<T>) {
  return (
    <BaseTabs.Root
      value={value}
      className={`ui-tabs ${className}`.trim()}
      onValueChange={(nextValue) => {
        if (typeof nextValue === 'string') {
          onValueChange(nextValue as T)
        }
      }}
    >
      <BaseTabs.List className="ui-tabs-list" aria-label={ariaLabel}>
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="ui-tab"
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
    </BaseTabs.Root>
  )
}
