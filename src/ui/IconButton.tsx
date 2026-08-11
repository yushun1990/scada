import { Button, type StudioButtonProps } from './Button'

type IconButtonProps = Omit<StudioButtonProps, 'children'> & {
  'aria-label': string
  children: React.ReactNode
}

export function IconButton({ className = '', ...props }: IconButtonProps) {
  return (
    <Button
      {...props}
      variant={props.variant ?? 'ghost'}
      className={`ui-icon-button ${className}`.trim()}
    />
  )
}
