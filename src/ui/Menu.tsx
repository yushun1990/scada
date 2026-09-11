import { Menu as BaseMenu } from '@base-ui/react/menu'
import type { ComponentProps, PropsWithChildren } from 'react'

export const MenuRoot = BaseMenu.Root

type MenuTriggerProps = Omit<
  ComponentProps<typeof BaseMenu.Trigger>,
  'className'
> & { className?: string }

export function MenuTrigger({ className = '', ...props }: MenuTriggerProps) {
  return (
    <BaseMenu.Trigger
      {...props}
      className={`ui-menu-trigger ${className}`.trim()}
    />
  )
}

type MenuPopupProps = PropsWithChildren<{
  className?: string
  align?: ComponentProps<typeof BaseMenu.Positioner>['align']
  side?: ComponentProps<typeof BaseMenu.Positioner>['side']
  sideOffset?: ComponentProps<typeof BaseMenu.Positioner>['sideOffset']
}>

export function MenuPopup({
  children,
  className = '',
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
}: MenuPopupProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        className="ui-menu-positioner"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <BaseMenu.Popup className={`ui-menu-popup ${className}`.trim()}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

type MenuItemProps = Omit<ComponentProps<typeof BaseMenu.Item>, 'className'> & {
  className?: string
  destructive?: boolean
}

export function MenuItem({
  className = '',
  destructive = false,
  ...props
}: MenuItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      className={`ui-menu-item${destructive ? ' ui-menu-item-danger' : ''} ${className}`.trim()}
    />
  )
}

type MenuSeparatorProps = Omit<
  ComponentProps<typeof BaseMenu.Separator>,
  'className'
> & { className?: string }

export function MenuSeparator({ className = '', ...props }: MenuSeparatorProps) {
  return (
    <BaseMenu.Separator
      {...props}
      className={`ui-menu-separator ${className}`.trim()}
    />
  )
}
