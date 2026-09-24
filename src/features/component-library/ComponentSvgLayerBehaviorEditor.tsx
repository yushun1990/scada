import { useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type { ComponentDefinition } from '../../component-system/definition'
import { serializeManagedSvgDataUrl } from '../../component-system/managedSvg'
import {
  applyThemeToManagedSvgDocument,
  generateComponentSvgThemeBindings,
  hasManagedSvgThemeClasses,
  SVG_LAYER_BUILTIN_METHODS,
  type SvgThemePresetKey,
} from '../../component-system/managedSvgTheme'
import type { ComponentVisualDefinition, SvgVisualLayer } from '../../component-system/visual'
import { Button } from '../../ui'
import './component-svg-layer-behavior.css'

type ComponentSvgLayerBehaviorEditorProps = {
  layer: SvgVisualLayer
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  readOnly: boolean
  onUpdateLayer: (layer: SvgVisualLayer) => void
  onBindContract: (
    nextDefinition: ComponentDefinition,
    nextVisual: ComponentVisualDefinition,
  ) => void
}

export function ComponentSvgLayerBehaviorEditor({
  layer,
  definition,
  visual,
  readOnly,
  onUpdateLayer,
  onBindContract,
}: ComponentSvgLayerBehaviorEditorProps) {
  const [activeTestState, setActiveTestState] = useState<string | null>(null)
  const [bindSuccessMessage, setBindSuccessMessage] = useState<string | null>(null)

  const hasThemeClasses = layer.document ? hasManagedSvgThemeClasses(layer.document) : false

  // Check if component already has properties and rules bound to this layer
  const stateProperty = definition.properties.state || definition.properties.themeState
  const hasThemeRules = (visual.rules ?? []).some(
    (rule) => rule.layerId === layer.id && rule.target === 'svg.themeState',
  )
  const isBound = Boolean(stateProperty && hasThemeRules)

  function handleTestPreset(preset: SvgThemePresetKey) {
    if (!layer.document) return
    setActiveTestState(preset)
    const nextDoc = applyThemeToManagedSvgDocument(layer.document, preset)
    onUpdateLayer({
      ...layer,
      document: nextDoc,
      assetRef: serializeManagedSvgDataUrl(nextDoc),
    })
  }

  function handleBind() {
    const result = generateComponentSvgThemeBindings(layer.id, definition, visual)
    onBindContract(result.definition, result.visual)
    setBindSuccessMessage('绑定成功！组件已新增运行属性 state、7 个控制方法及 5 条状态视觉规则。')
    setTimeout(() => {
      setBindSuccessMessage(null)
    }, 4000)
  }

  return (
    <div className="component-svg-layer-behavior-panel">
      <CollapsibleInspectorGroup title="SVG 图层方法与行为" defaultOpen={true}>
        {!hasThemeClasses ? (
          <div className="svg-behavior-notice">
            <span className="svg-behavior-notice-icon">💡</span>
            <div className="svg-behavior-notice-content">
              <strong>未检测到语义主题类名 (scada-theme-*)</strong>
              <p>
                该 SVG 尚未提取分阶主题类名。请在「属性」面板打开「SVG 源码与图层」并点击「✨ 自动规范重构并提取 Class」，即可一键解锁图层方法与状态绑定。
              </p>
            </div>
          </div>
        ) : (
          <div className="svg-behavior-content">
            {/* 1. Layer Methods List */}
            <div className="svg-behavior-section">
              <div className="svg-behavior-section-header">
                <strong>图层内置方法</strong>
                <span className="svg-behavior-badge-count">
                  {SVG_LAYER_BUILTIN_METHODS.length} 个方法就绪
                </span>
              </div>
              <ul className="svg-layer-methods-list">
                {SVG_LAYER_BUILTIN_METHODS.map((method) => (
                  <li key={method.name} className="svg-layer-method-item">
                    <div className="svg-layer-method-signature">
                      <code>{method.name}({method.parameter ? `${method.parameter.name}: string` : ''})</code>
                      <span className="svg-layer-method-title">{method.title}</span>
                    </div>
                    <span className="svg-layer-method-desc">{method.description}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 2. Interactive Test Buttons */}
            <div className="svg-behavior-section">
              <div className="svg-behavior-section-header">
                <strong>即时调用调试 (当前画布图层)</strong>
                <small>点击直接调用对应方法并在画布即时验证</small>
              </div>
              <div className="svg-behavior-test-grid">
                <Button
                  variant={activeTestState === 'running' ? 'primary' : 'secondary'}
                  size="small"
                  disabled={readOnly}
                  onClick={() => handleTestPreset('running')}
                >
                  🟢 运行态 (绿)
                </Button>
                <Button
                  variant={activeTestState === 'alarm' ? 'primary' : 'secondary'}
                  size="small"
                  disabled={readOnly}
                  onClick={() => handleTestPreset('alarm')}
                >
                  🔴 报警态 (红)
                </Button>
                <Button
                  variant={activeTestState === 'warning' ? 'primary' : 'secondary'}
                  size="small"
                  disabled={readOnly}
                  onClick={() => handleTestPreset('warning')}
                >
                  🟡 预警态 (黄)
                </Button>
                <Button
                  variant={activeTestState === 'standby' ? 'primary' : 'secondary'}
                  size="small"
                  disabled={readOnly}
                  onClick={() => handleTestPreset('standby')}
                >
                  🔵 待机态 (蓝)
                </Button>
                <Button
                  variant={activeTestState === 'offline' ? 'primary' : 'secondary'}
                  size="small"
                  disabled={readOnly}
                  onClick={() => handleTestPreset('offline')}
                >
                  ⚪ 离线态 (灰)
                </Button>
                <Button
                  variant={activeTestState === 'default' ? 'primary' : 'secondary'}
                  size="small"
                  disabled={readOnly}
                  onClick={() => handleTestPreset('default')}
                >
                  🔄 默认原色
                </Button>
              </div>
            </div>

            {/* 3. One-Click Component Binding */}
            <div className="svg-behavior-section svg-behavior-bind-box">
              <div className="svg-behavior-section-header">
                <strong>组件定义与视觉规则绑定</strong>
                {isBound ? (
                  <span className="svg-behavior-status-badge bound">✓ 已绑定到组件</span>
                ) : (
                  <span className="svg-behavior-status-badge unbound">未绑定</span>
                )}
              </div>

              {bindSuccessMessage && (
                <div className="svg-behavior-success-banner" role="status">
                  {bindSuccessMessage}
                </div>
              )}

              {isBound ? (
                <div className="svg-behavior-bound-info">
                  <div className="svg-behavior-bound-row">
                    <span className="label">组件运行属性：</span>
                    <code>{stateProperty?.title || '运行状态'} ({definition.properties.state ? 'state' : 'themeState'})</code>
                  </div>
                  <div className="svg-behavior-bound-row">
                    <span className="label">组件公开方法：</span>
                    <span>7 个 Action 已同步注册到组件契约</span>
                  </div>
                  <div className="svg-behavior-bound-row">
                    <span className="label">关联视觉规则：</span>
                    <span>5 条状态规则（自动保持 18 阶连续光影）</span>
                  </div>
                  <div className="svg-behavior-bind-actions">
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={readOnly}
                      onClick={handleBind}
                    >
                      重新同步组件绑定
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="svg-behavior-unbound-prompt">
                  <p className="component-inspector-help">
                    无需手动配置！一键将上述图层方法自动映射为组件的公开 Action、运行状态属性（state）与 5 条高保真视觉规则。
                  </p>
                  <div className="svg-behavior-bind-actions">
                    <Button
                      variant="primary"
                      size="small"
                      disabled={readOnly}
                      onClick={handleBind}
                    >
                      ⚡ 一键绑定到组件运行状态与方法
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CollapsibleInspectorGroup>
    </div>
  )
}
