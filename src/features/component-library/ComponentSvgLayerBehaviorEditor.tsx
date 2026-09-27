import { useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type { ComponentDefinition } from '../../component-system/definition'
import {
  generateComponentSvgThemeBindings,
  hasManagedSvgThemeClasses,
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

/**
 * Runtime wiring for SVG theme behavior: one declarative Property plus five
 * private visual rules. Interactive previews live in the layer-method panel
 * above; this editor only binds the runtime contract.
 */
export function ComponentSvgLayerBehaviorEditor({
  layer,
  definition,
  visual,
  readOnly,
  onBindContract,
}: ComponentSvgLayerBehaviorEditorProps) {
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
      <CollapsibleInspectorGroup title="SVG 声明式主题行为" defaultOpen={false}>
        {!hasThemeClasses ? (
          <div className="svg-behavior-notice">
            <span className="svg-behavior-notice-icon">💡</span>
            <div className="svg-behavior-notice-content">
              <strong>未检测到语义主题类名 (scada-theme-*)</strong>
              <p>
                该 SVG 尚未包含分阶主题类名。请在 SVG 组的标记工作台中完成主题 Class 标注后，再绑定运行 Property 与私有视觉规则。
              </p>
            </div>
          </div>
        ) : (
          <div className="svg-behavior-content">
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
