import { Button as BaseButton } from '@base-ui/react/button'
import type { ButtonHTMLAttributes } from 'react'

export type PressableProps = ButtonHTMLAttributes<HTMLButtonElement>

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
