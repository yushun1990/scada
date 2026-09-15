import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentPropsWithRef } from 'react'

export type PressableProps = ComponentPropsWithRef<'button'>

export function Pressable({
  className = '',
  type = 'button',
  ...props
}: PressableProps) {
  return (
    <BaseButton
      {...props}
      type={type}
      className={`ui-pressable ${className}`.trim()}
    />
  )
}
