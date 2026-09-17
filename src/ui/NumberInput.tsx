import { forwardRef, useEffect, useRef, useState, type FocusEvent } from 'react'
import { Input, type InputProps } from './Input'

export type NumberInputProps = Omit<InputProps, 'type' | 'value'> & {
  value?: number | string
}

function formatNumberValue(value: number | string | undefined) {
  return value === undefined ? '' : String(value)
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, onFocus, onBlur, ...props },
  ref,
) {
  const [draftValue, setDraftValue] = useState(() => formatNumberValue(value))
  const editingRef = useRef(false)

  useEffect(() => {
    if (!editingRef.current) {
      setDraftValue(formatNumberValue(value))
    }
  }, [value])

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    editingRef.current = true

    if (draftValue === '0') {
      event.currentTarget.select()
    }

    onFocus?.(event)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    editingRef.current = false
    setDraftValue(formatNumberValue(value))
    onBlur?.(event)
  }

  return (
    <Input
      ref={ref}
      {...props}
      type="number"
      value={draftValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => {
        const nextValue = event.target.value
        setDraftValue(nextValue)

        if (nextValue === '') {
          return
        }

        const numericValue = Number(nextValue)

        if (Number.isFinite(numericValue)) {
          onChange?.(event)
        }
      }}
    />
  )
})
