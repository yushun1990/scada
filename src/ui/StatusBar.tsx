import type { HTMLAttributes } from 'react'

export type StatusBarProps = HTMLAttributes<HTMLDivElement>

export function StatusBar({ className = '', ...props }: StatusBarProps) {
  return (
    <div
      {...props}
      className={`ui-status-bar ${className}`.trim()}
    />
  )
}
