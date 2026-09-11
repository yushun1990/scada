import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ComponentProps, PropsWithChildren } from 'react'

export const DialogRoot = BaseDialog.Root

type DialogTriggerProps = Omit<
  ComponentProps<typeof BaseDialog.Trigger>,
  'className'
> & { className?: string }

export function DialogTrigger({ className = '', ...props }: DialogTriggerProps) {
  return (
    <BaseDialog.Trigger
      {...props}
      className={`ui-dialog-trigger ${className}`.trim()}
    />
  )
}

type DialogContentProps = PropsWithChildren<{ className?: string }>

export function DialogContent({ children, className = '' }: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="ui-dialog-backdrop" />
      <BaseDialog.Viewport className="ui-dialog-viewport">
        <BaseDialog.Popup className={`ui-dialog-popup ${className}`.trim()}>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  )
}

type DialogTitleProps = Omit<ComponentProps<typeof BaseDialog.Title>, 'className'> & {
  className?: string
}

export function DialogTitle({ className = '', ...props }: DialogTitleProps) {
  return (
    <BaseDialog.Title
      {...props}
      className={`ui-dialog-title ${className}`.trim()}
    />
  )
}

type DialogDescriptionProps = Omit<
  ComponentProps<typeof BaseDialog.Description>,
  'className'
> & { className?: string }

export function DialogDescription({
  className = '',
  ...props
}: DialogDescriptionProps) {
  return (
    <BaseDialog.Description
      {...props}
      className={`ui-dialog-description ${className}`.trim()}
    />
  )
}

type DialogCloseProps = Omit<ComponentProps<typeof BaseDialog.Close>, 'className'> & {
  className?: string
}

export function DialogClose({ className = '', ...props }: DialogCloseProps) {
  return (
    <BaseDialog.Close
      {...props}
      className={`ui-dialog-close ${className}`.trim()}
    />
  )
}
