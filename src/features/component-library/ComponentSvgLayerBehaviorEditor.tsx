import { useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type { ComponentDefinition } from '../../component-system/definition'
import { serializeManagedSvgDataUrl } from '../../component-system/managedSvg'
import {
  applyThemeToManagedSvgDocument,
  generateComponentSvgThemeBindings,
  hasManagedSvgThemeClasses,
  SVG_THEME_BINDING_STATES,
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

  const themeRules = (visual.rules ?? []).filter(
    (rule) => rule.layerId === layer.id && rule.target === 'svg.themeState',
  )
  const themePropertyKey = themeRules[0]?.propertyKey
  const stateProperty = themePropertyKey
    ? definition.properties[themePropertyKey]
    : undefined
  const isBound = Boolean(stateProperty && themeRules.length > 0)

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
    setBindSuccessMessage(
      result.removedLegacyActionKeys.length > 0
        ? `绑定成功！已建立 1 个运行 Property 与 5 条私有状态视觉规则，并清理旧版自动生成的 Action：${result.removedLegacyActionKeys.join('、')}。`
        : '绑定成功！已建立 1 个运行 Property 与 5 条私有状态视觉规则；未生成公开 Action。',
    )
    setTimeout(() => {
      setBindSuccessMessage(null)
    }, 4000)
  }

  return (
    <div className="component-svg-layer-behavior-panel">
      <CollapsibleInspectorGroup title="SVG 声明式主题行为" defaultOpen={true}>
        {!hasThemeClasses ? (
          <div className="svg-behavior-notice">
            <span className="svg-behavior-notice-icon">💡</span>
            <div className="svg-behavior-notice-content">
              <strong>未检测到语义主题类名 (scada-theme-*)</strong>
              <p>
                该 SVG 尚未包含分阶主题类名。请在「属性」面板完成主题 Class 标注后，再绑定运行 Property 与私有视觉规则。
              </p>
            </div>
          </div>
        ) : (
          <div className="svg-behavior-content">
            {/* 1. Declarative states */}
            <div className="svg-behavior-section">
              <div className="svg-behavior-section-header">
                <strong>可绑定主题状态</strong>
                <span className="svg-behavior-badge-count">
                  {SVG_THEME_BINDING_STATES.length} 个声明式状态
                </span>
              </div>
              <ul className="svg-layer-methods-list">
                {SVG_THEME_BINDING_STATES.map((binding) => (
                  <li key={binding.state} className="svg-layer-method-item">
                    <div className="svg-layer-method-signature">
                      <code>{binding.state}</code>
                      <span className="svg-layer-method-title">{binding.label}</span>
                    </div>
                    <span className="svg-layer-method-desc">{binding.description}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 2. Authored base-preview buttons */}
            <div className="svg-behavior-section">
              <div className="svg-behavior-section-header">
                <strong>主题外观预览（当前画布图层）</strong>
                <small>预览并写入当前图层外观，不调用 Action</small>
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

            {/* 3. One-click declarative binding */}
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
                    <code>{stateProperty?.title || '运行状态'} ({themePropertyKey})</code>
                  </div>
                  <div className="svg-behavior-bound-row">
                    <span className="label">公开执行能力：</span>
                    <span>不生成 Action/Event；运行时仅求值声明式规则</span>
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
                    一键创建可绑定的运行状态 Property 与 5 条组件私有视觉规则。该操作不会创建公开 Action/Event，也不会引入脚本执行权限。
                  </p>
                  <div className="svg-behavior-bind-actions">
                    <Button
                      variant="primary"
                      size="small"
                      disabled={readOnly}
                      onClick={handleBind}
                    >
                      一键绑定声明式运行状态
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
