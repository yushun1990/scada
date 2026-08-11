import { Separator as BaseSeparator } from '@base-ui/react/separator'

type SeparatorProps = {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Separator({
  orientation = 'horizontal',
  className = '',
}: SeparatorProps) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={`ui-separator ui-separator-${orientation} ${className}`.trim()}
    />
  )
}
