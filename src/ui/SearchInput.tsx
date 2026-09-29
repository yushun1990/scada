import { forwardRef } from 'react'
import { IconButton } from './IconButton'
import { Input, type InputProps } from './Input'

export type SearchInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (next: string) => void
  clearLabel?: string
}

/** Text filter input with an Escape-clear keybinding and a trailing clear button. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onValueChange,
    clearLabel = '清除查找',
    onKeyDown,
    ...rest
  },
  ref,
) {
  return (
    <div className="ui-search-input">
      <Input
        ref={ref}
        {...rest}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onValueChange('')
          }
          onKeyDown?.(event)
        }}
      />
      {value && (
        <IconButton
          aria-label={clearLabel}
          size="small"
          onClick={() => onValueChange('')}
        >
          ×
        </IconButton>
      )}
    </div>
  )
})
