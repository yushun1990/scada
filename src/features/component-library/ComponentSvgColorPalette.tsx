import { Button, Input } from '../../ui'

export type DetectedClassInfo = {
  name: string
  count: number
  initialColor: string
  uniqueFills?: string[]
}

type ComponentSvgColorPaletteProps = {
  detectedClasses: DetectedClassInfo[]
  classStyleOverrides: Record<string, string>
  showClassStyleBar: boolean
  masterColor: string
  onToggleShow: () => void
  onApplyPreset: (preset: 'running' | 'alarm' | 'warning' | 'offline' | 'standby') => void
  onMasterColorChange: (color: string) => void
  onResetClassStyles: () => void
  onBakeClassStylesToCode: () => void
  onClassColorChange: (className: string, color: string) => void
  onHoverClass: (className: string | null) => void
}

export function ComponentSvgColorPalette({
  detectedClasses,
  classStyleOverrides,
  showClassStyleBar,
  masterColor,
  onToggleShow,
  onApplyPreset,
  onMasterColorChange,
  onResetClassStyles,
  onBakeClassStylesToCode,
  onClassColorChange,
  onHoverClass,
}: ComponentSvgColorPaletteProps) {
  if (detectedClasses.length === 0) return null

  return (
    <div className={`component-svg-class-styles-bar${showClassStyleBar ? ' is-expanded' : ' is-collapsed'}`}>
      <div className="component-svg-class-bar-header">
        <div className="component-svg-class-bar-title-wrap">
          <Button
            size="small"
            variant="ghost"
            className="component-svg-class-bar-toggle-btn"
            onClick={onToggleShow}
            title={showClassStyleBar ? '折叠配色控制台' : '展开配色控制台'}
          >
            {showClassStyleBar ? '▼' : '▶'}
          </Button>
          <span className="component-svg-class-bar-title">🎨 智能动态语义调色板</span>
          <span className="component-svg-class-bar-count">({detectedClasses.length} 个分类)</span>
        </div>
        <div className="component-svg-class-bar-actions">
          <Button
            size="small"
            variant="secondary"
            className="component-svg-preset-btn"
            onClick={() => onApplyPreset('running')}
            title="模拟运行状态（运行绿）"
          >
            🟢 运行态
          </Button>
          <Button
            size="small"
            variant="secondary"
            className="component-svg-preset-btn"
            onClick={() => onApplyPreset('alarm')}
            title="模拟告警状态（告警红）"
          >
            🔴 告警态
          </Button>
          <Button
            size="small"
            variant="secondary"
            className="component-svg-preset-btn"
            onClick={() => onApplyPreset('warning')}
            title="模拟预警状态（预警黄）"
          >
            🟡 预警态
          </Button>
          <Button
            size="small"
            variant="secondary"
            className="component-svg-preset-btn"
            onClick={() => onApplyPreset('offline')}
            title="模拟停机状态（离线灰）"
          >
            ⚪ 停机态
          </Button>
          <Button
            size="small"
            variant="secondary"
            className="component-svg-preset-btn"
            onClick={() => onApplyPreset('standby')}
            title="模拟备机状态（待机蓝）"
          >
            🔵 备机态
          </Button>
          <div className="component-svg-master-color-wrap" title="选择任意主色调，智能保留各图层明暗阶梯分层">
            <span className="component-svg-master-color-text">自由调色:</span>
            <Input
              type="color"
              className="component-svg-class-color-input"
              value={masterColor}
              onChange={(e) => onMasterColorChange(e.target.value)}
            />
          </div>
          {Object.keys(classStyleOverrides).length > 0 && (
            <Button
              size="small"
              variant="ghost"
              className="component-svg-preset-btn"
              onClick={onResetClassStyles}
              title="清除模拟样式，恢复默认原始颜色"
            >
              🔄 还原
            </Button>
          )}
          {Object.keys(classStyleOverrides).length > 0 && (
            <Button
              size="small"
              variant="secondary"
              className="component-svg-preset-btn is-bake"
              onClick={onBakeClassStylesToCode}
              title="将当前模拟的样式真正写入左侧 SVG 源码中"
            >
              💾 写入源码
            </Button>
          )}
        </div>
      </div>
      <div className="component-svg-class-items-list">
        {detectedClasses.map((cls) => {
          const currentColor = classStyleOverrides[cls.name] || cls.initialColor || '#34d399'
          const isOverridden = Boolean(classStyleOverrides[cls.name])
          return (
            <div
              key={cls.name}
              className={`component-svg-class-item-chip${isOverridden ? ' is-overridden' : ''}`}
              onMouseEnter={() => onHoverClass(cls.name)}
              onMouseLeave={() => onHoverClass(null)}
              title={`悬浮高亮预览图元，点击选择框调整 .${cls.name} 颜色`}
            >
              <span className="component-svg-class-chip-pill">.{cls.name}</span>
              <span className="component-svg-class-chip-count">{cls.count}</span>
              <div className="component-svg-class-color-wrap">
                <Input
                  type="color"
                  className="component-svg-class-color-input"
                  value={currentColor}
                  onChange={(e) => onClassColorChange(cls.name, e.target.value)}
                  title={`点击选择 .${cls.name} 颜色`}
                />
                <span className="component-svg-class-color-hex">{currentColor}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
