import { useEffect, useRef, useState } from 'react'
import { IconButton, Input } from '../../ui'
import { CheckIcon, CloseIcon } from '../../components/toolbar-icons'

export type LayerNameInputProps = {
  value: string
  disabled?: boolean
  existingNames: readonly string[]
  onCommit: (nextName: string) => void
  onCancel?: () => void
  autoFocus?: boolean
  className?: string
}

export function LayerNameInput({
  value,
  disabled = false,
  existingNames,
  onCommit,
  onCancel,
  autoFocus = true,
  className = '',
}: LayerNameInputProps) {
  const [text, setText] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(value)
    setError(null)
  }, [value])

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [autoFocus])

  function handleCommit() {
    if (disabled) return
    const trimmed = text.trim()
    if (!trimmed) {
      setError('图层名称不能为空')
      return
    }
    if (trimmed === value) {
      setError(null)
      onCancel?.()
      return
    }
    if (existingNames.includes(trimmed)) {
      setError(`已存在同名图层 "${trimmed}"`)
      return
    }
    setError(null)
    onCommit(trimmed)
  }

  function handleCancel() {
    setText(value)
    setError(null)
    onCancel?.()
  }

  return (
    <div className={`component-layer-name-editor ${error ? 'has-error' : ''} ${className}`.trim()}>
      <div className="component-layer-name-editor-row">
        <Input
          ref={inputRef}
          value={text}
          disabled={disabled}
          aria-label="图层名称"
          placeholder="输入图层名称"
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleCommit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              handleCancel()
            }
          }}
          onBlur={() => {
            const trimmed = text.trim()
            if (!trimmed || existingNames.includes(trimmed)) {
              handleCommit()
              return
            }
            if (trimmed === value) {
              onCancel?.()
              return
            }
            handleCommit()
          }}
        />
        <IconButton
          size="small"
          variant="ghost"
          aria-label="确认重命名"
          title="确认 (Enter)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleCommit}
          className="component-layer-confirm-btn"
        >
          <CheckIcon />
        </IconButton>
        <IconButton
          size="small"
          variant="ghost"
          aria-label="取消重命名"
          title="取消 (Esc)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleCancel}
          className="component-layer-cancel-btn"
        >
          <CloseIcon />
        </IconButton>
      </div>
      {error && (
        <span className="component-layer-name-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
