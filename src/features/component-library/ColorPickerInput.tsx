import { useState } from 'react'
import {
  Input,
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
  Pressable,
} from '../../ui'

export type ColorPickerInputProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
  clearValue?: string
}

function resolveColorPickerValue(value: string) {
  const normalized = value.trim().toLowerCase()

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized
  }

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split('').map((digit) => `${digit}${digit}`).join('')}`
  }

  return '#000000'
}

const PRESET_PALETTE = [
  '#ffffff', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#334155', '#000000',
  '#f87171', '#fb923c', '#fbbf24', '#4ade80', '#38bdf8', '#3b82f6', '#818cf8', '#f472b6',
  '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0284c7', '#1769aa', '#4f46e5', '#db2777',
]

export function ColorPickerInput({
  value,
  onChange,
  disabled = false,
  placeholder = 'transparent',
  ariaLabel,
  className = '',
  clearValue = 'transparent',
}: ColorPickerInputProps) {
  const [open, setOpen] = useState(false)
  const normalized = value.trim().toLowerCase()
  const isTransparent = !normalized || normalized === 'transparent'

  return (
    <div className={`component-color-input-row ${className}`.trim()}>
      <PopoverRoot open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          title={ariaLabel ? `${ariaLabel} 色卡` : '选择颜色'}
          aria-label={ariaLabel ? `${ariaLabel} 色卡` : '颜色色卡'}
          className="component-color-swatch-trigger"
        >
          <span
            className={`component-color-swatch-box${isTransparent ? ' is-transparent' : ''}`}
            style={{ backgroundColor: isTransparent ? undefined : resolveColorPickerValue(value) }}
          />
        </PopoverTrigger>

        <PopoverPopup className="component-color-picker-popover" align="start" side="bottom">
          <div className="component-color-palette-content">
            <Pressable
              className={`component-color-transparent-option${isTransparent ? ' active' : ''}`}
              onClick={() => {
                onChange(clearValue)
                setOpen(false)
              }}
            >
              <span className="component-color-swatch-box is-transparent option-preview" />
              <span className="component-color-transparent-text">透明 (transparent)</span>
              {isTransparent && <span className="component-color-active-mark">✓</span>}
            </Pressable>

            <div className="component-color-palette-section-title">预设颜色</div>
            <div className="component-color-palette-grid">
              {PRESET_PALETTE.map((preset) => {
                const isSelected = normalized === preset
                return (
                  <Pressable
                    key={preset}
                    className={`component-color-palette-item${isSelected ? ' active' : ''}`}
                    style={{ backgroundColor: preset }}
                    title={preset}
                    aria-label={`选择颜色 ${preset}`}
                    onClick={() => {
                      onChange(preset)
                      setOpen(false)
                    }}
                  />
                )
              })}
            </div>

            <div className="component-color-palette-section-title">自定义颜色</div>
            <div className="component-color-custom-row">
              <Input
                type="color"
                value={resolveColorPickerValue(value)}
                aria-label="自定义拾色器"
                onChange={(event) => {
                  onChange(event.target.value)
                }}
              />
              <span className="component-color-custom-hint">点击色板自选任意颜色</span>
            </div>
          </div>
        </PopoverPopup>
      </PopoverRoot>

      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
