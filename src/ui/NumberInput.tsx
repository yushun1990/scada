import { forwardRef } from 'react'
import { Input, type InputProps } from './Input'

export type NumberInputProps = Omit<InputProps, 'type'>

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  props,
  ref,
) {
  return <Input ref={ref} {...props} type="number" />
})
