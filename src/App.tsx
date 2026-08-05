import { useState, type CSSProperties } from 'react'
import pumpSvg from './assets/water-pump'

type Palette = {
  id: string
  name: string
  light: string
  dark: string
}

const palettes: Palette[] = [
  { id: 'gray', name: '灰色', light: '#cbd5e1', dark: '#64748b' },
  { id: 'green', name: '绿色', light: '#86efac', dark: '#16a34a' },
  { id: 'blue', name: '蓝色', light: '#7dd3fc', dark: '#0284c7' },
  { id: 'orange', name: '橙色', light: '#fdba74', dark: '#ea580c' },
  { id: 'red', name: '红色', light: '#fca5a5', dark: '#dc2626' },
]

type PumpColorStyle = CSSProperties & {
  '--pump-color1': string
  '--pump-color2': string
}

function App() {
  const [activePaletteId, setActivePaletteId] = useState(palettes[0].id)
  const activePalette =
    palettes.find((palette) => palette.id === activePaletteId) ?? palettes[0]

  const pumpStyle: PumpColorStyle = {
    '--pump-color1': activePalette.light,
    '--pump-color2': activePalette.dark,
  }

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div>
          <strong>SCADA Editor Lab</strong>
          <span>SVG 颜色绑定实验</span>
        </div>
        <div className="document-name">water-pump.svg</div>
      </header>

      <main className="editor-main">
        <aside className="component-panel">
          <div className="panel-title">组件</div>
          <button className="component-item active" type="button">
            <span className="component-icon">P</span>
            <span>
              <strong>水泵</strong>
              <small>SVG Component</small>
            </span>
          </button>
        </aside>

        <section className="canvas-area" aria-label="SCADA 编辑画布">
          <div className="canvas-toolbar">
            <span>画布</span>
            <span>100%</span>
          </div>

          <div className="canvas-grid">
            <div className="selection-box" style={pumpStyle}>
              <span className="selection-label">pump-01</span>
              <span className="resize-handle top-left" />
              <span className="resize-handle top-right" />
              <span className="resize-handle bottom-left" />
              <span className="resize-handle bottom-right" />
              <div
                className="pump-svg"
                role="img"
                aria-label={`当前水泵颜色：${activePalette.name}`}
                dangerouslySetInnerHTML={{ __html: pumpSvg }}
              />
            </div>
          </div>
        </section>

        <aside className="property-panel">
          <div className="panel-title">颜色切换</div>
          <p className="panel-description">
            点击按钮，同时修改 SVG 中的浅色标签和深色标签。
          </p>

          <div className="palette-list">
            {palettes.map((palette) => (
              <button
                className={`palette-button${palette.id === activePaletteId ? ' active' : ''}`}
                key={palette.id}
                type="button"
                aria-pressed={palette.id === activePaletteId}
                onClick={() => setActivePaletteId(palette.id)}
              >
                <span className="palette-preview" aria-hidden="true">
                  <i style={{ backgroundColor: palette.light }} />
                  <i style={{ backgroundColor: palette.dark }} />
                </span>
                <span>{palette.name}</span>
              </button>
            ))}
          </div>

          <div className="binding-list">
            <div>
              <span className="binding-color" style={{ backgroundColor: activePalette.light }} />
              <span>
                <code>pump-color1</code>
                <small>{activePalette.light}</small>
              </span>
            </div>
            <div>
              <span className="binding-color" style={{ backgroundColor: activePalette.dark }} />
              <span>
                <code>pump-color2</code>
                <small>{activePalette.dark}</small>
              </span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
