import { useState, type ReactNode } from 'react'
import { Pressable } from '../ui'

type CollapsibleInspectorGroupProps = {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}

export function CollapsibleInspectorGroup({
  title,
  children,
  defaultOpen = true,
  className = '',
}: CollapsibleInspectorGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const classes = [
    'inspector-group',
    'inspector-collapsible',
    open ? 'is-open' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <section className={classes}>
      <Pressable
        className="inspector-group-header"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="inspector-group-chevron" aria-hidden="true">›</span>
        <span className="inspector-group-title">{title}</span>
      </Pressable>

      {open && <div className="inspector-group-content">{children}</div>}
    </section>
  )
}
