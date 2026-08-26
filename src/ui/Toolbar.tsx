import { Toolbar as BaseToolbar } from '@base-ui/react/toolbar'
import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Button, type StudioButtonSize, type StudioButtonVariant } from './Button'

const StudioToolbarContext = createContext(false)

export function Toolbar({ children, ...props }: React.ComponentProps<typeof BaseToolbar.Root>) {
  return (
    <StudioToolbarContext.Provider value>
      <BaseToolbar.Root {...props}>{children}</BaseToolbar.Root>
    </StudioToolbarContext.Provider>
  )
}

export const ToolbarGroup = BaseToolbar.Group
export const ToolbarSeparator = BaseToolbar.Separator

type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: StudioButtonVariant
  size?: StudioButtonSize
  iconOnly?: boolean
  children?: ReactNode
}

export function ToolbarButton({
  className = '',
  variant = 'ghost',
  size = 'normal',
  iconOnly = false,
  type = 'button',
  ...props
}: ToolbarButtonProps) {
  const isInsideToolbar = useContext(StudioToolbarContext)
  const buttonClassName = [
    'ui-button',
    `ui-button-${variant}`,
    size === 'small' ? 'ui-button-small' : '',
    iconOnly ? 'ui-icon-button' : '',
    className,
  ].filter(Boolean).join(' ')

  if (!isInsideToolbar) {
    return (
      <Button
        {...props}
        type={type}
        variant={variant}
        size={size}
        className={[
          iconOnly ? 'ui-icon-button' : '',
          className,
        ].filter(Boolean).join(' ')}
      />
    )
  }

  return (
    <BaseToolbar.Button
      {...props}
      type={type}
      className={buttonClassName}
    />
  )
}
