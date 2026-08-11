import { Button as BaseButton } from '@base-ui/react/button'
import type { ButtonHTMLAttributes } from 'react'

export type StudioButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
export type StudioButtonSize = 'small' | 'normal'

export type StudioButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className'
> & {
  className?: string
  variant?: StudioButtonVariant
  size?: StudioButtonSize
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function Button({
  className,
  variant = 'secondary',
  size = 'normal',
  type = 'button',
  ...props
}: StudioButtonProps) {
  return (
    <BaseButton
      {...props}
      type={type}
      className={joinClassNames(
        'ui-button',
        `ui-button-${variant}`,
        size === 'small' && 'ui-button-small',
        className,
      )}
    />
  )
}
