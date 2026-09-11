import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

type SplitPaneOrientation = 'horizontal' | 'vertical'

type SplitPaneProps = {
  first: ReactNode
  second: ReactNode
  size: number
  minSize: number
  maxSize: number
  onSizeChange: (size: number) => void
  orientation?: SplitPaneOrientation
  step?: number
  ariaLabel: string
  className?: string
}

type DragState = {
  pointerId: number
  startClient: number
  startSize: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function SplitPane({
  first,
  second,
  size,
  minSize,
  maxSize,
  onSizeChange,
  orientation = 'horizontal',
  step = 8,
  ariaLabel,
  className = '',
}: SplitPaneProps) {
  const dragRef = useRef<DragState | null>(null)
  const horizontal = orientation === 'horizontal'
  const boundedSize = clamp(size, minSize, maxSize)

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startClient: horizontal ? event.clientX : event.clientY,
      startSize: boundedSize,
    }
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const client = horizontal ? event.clientX : event.clientY
    onSizeChange(clamp(drag.startSize + client - drag.startClient, minSize, maxSize))
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const negativeKey = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const positiveKey = horizontal ? 'ArrowRight' : 'ArrowDown'
    let nextSize: number | null = null

    if (event.key === negativeKey) nextSize = boundedSize - step
    if (event.key === positiveKey) nextSize = boundedSize + step
    if (event.key === 'Home') nextSize = minSize
    if (event.key === 'End') nextSize = maxSize

    if (nextSize === null) return
    event.preventDefault()
    onSizeChange(clamp(nextSize, minSize, maxSize))
  }

  const style = horizontal
    ? { gridTemplateColumns: `${boundedSize}px var(--ui-space-splitter) minmax(0, 1fr)` }
    : { gridTemplateRows: `${boundedSize}px var(--ui-space-splitter) minmax(0, 1fr)` }

  return (
    <div
      className={`ui-split-pane ui-split-pane-${orientation} ${className}`.trim()}
      style={style}
    >
      <div className="ui-split-pane-region">{first}</div>
      <div
        className="ui-split-pane-separator"
        role="separator"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={Math.round(boundedSize)}
        onPointerDown={beginDrag}
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={handleKeyDown}
      />
      <div className="ui-split-pane-region">{second}</div>
    </div>
  )
}
