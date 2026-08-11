import { Toolbar as BaseToolbar } from '@base-ui/react/toolbar'
import type { ButtonHTMLAttributes } from 'react'
import type { StudioButtonSize, StudioButtonVariant } from './Button'

export const Toolbar = BaseToolbar.Root
export const ToolbarGroup = BaseToolbar.Group
export const ToolbarSeparator = BaseToolbar.Separator

type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: StudioButtonVariant
  size?: StudioButtonSize
  iconOnly?: boolean
}

export function ToolbarButton({
  className = '',
  variant = 'ghost',
  size = 'normal',
  iconOnly = false,
  type = 'button',
  ...props
}: ToolbarButtonProps) {
  return (
    <BaseToolbar.Button
      {...props}
      type={type}
      className={[
        'ui-button',
        `ui-button-${variant}`,
        size === 'small' ? 'ui-button-small' : '',
        iconOnly ? 'ui-icon-button' : '',
        className,
      ].filter(Boolean).join(' ')}
    />
  )
}
