import { Popover as BasePopover } from '@base-ui/react/popover'
import type { ComponentProps, PropsWithChildren } from 'react'

export const PopoverRoot = BasePopover.Root

type PopoverTriggerProps = Omit<
  ComponentProps<typeof BasePopover.Trigger>,
  'className'
> & { className?: string }

export function PopoverTrigger({ className = '', ...props }: PopoverTriggerProps) {
  return (
    <BasePopover.Trigger
      {...props}
      className={`ui-popover-trigger ${className}`.trim()}
    />
  )
}

type PopoverPopupProps = PropsWithChildren<{
  className?: string
  align?: ComponentProps<typeof BasePopover.Positioner>['align']
  side?: ComponentProps<typeof BasePopover.Positioner>['side']
  sideOffset?: ComponentProps<typeof BasePopover.Positioner>['sideOffset']
}>

export function PopoverPopup({
  children,
  className = '',
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
}: PopoverPopupProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        className="ui-popover-positioner"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <BasePopover.Popup className={`ui-popover-popup ${className}`.trim()}>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  )
}

type PopoverCloseProps = Omit<
  ComponentProps<typeof BasePopover.Close>,
  'className'
> & { className?: string }

export function PopoverClose({ className = '', ...props }: PopoverCloseProps) {
  return (
    <BasePopover.Close
      {...props}
      className={`ui-popover-close ${className}`.trim()}
    />
  )
}
