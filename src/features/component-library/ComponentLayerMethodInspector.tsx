import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type {
  ComponentActionParameterDefinition,
  ComponentDefinition,
} from '../../component-system/definition'
import {
  hasManagedSvgThemeClasses,
  SVG_LAYER_BUILTIN_METHODS,
} from '../../component-system/managedSvgTheme'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  SvgVisualLayer,
} from '../../component-system/visual'
import './component-layer-methods.css'

type ComponentLayerMethodInspectorProps = {
  layer?: ComponentVisualLayer | null
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  readOnly: boolean
  onUpdateVisual?: (visual: ComponentVisualDefinition) => void
  onUpdateLayer?: (layer: ComponentVisualLayer) => void
  onUpdateDefinition: (definition: ComponentDefinition) => void
}

type DisplayedCapability = Readonly<{
  key: string
  name: string
  title: string
  description: string
  parameters: readonly ComponentActionParameterDefinition[]
  source: 'svg-declarative' | 'public-contract'
}>

function formatParameters(
  parameters: readonly ComponentActionParameterDefinition[],
) {
  return parameters.map((parameter) => parameter.name).join(', ')
}

/**
 * Show selected-layer capabilities without creating or executing authored
 * source code.
 *
 * Public Action signatures remain editable on the component definition page,
 * but portable user components intentionally have no accepted executable
 * implementation contract. SVG theme entries describe host-owned declarative
 * presentation capabilities; they are not script bodies.
 */
export function ComponentLayerMethodInspector(
  props: ComponentLayerMethodInspectorProps,
) {
  const { definition, layer, readOnly } = props
  const svgLayer = layer?.kind === 'svg' ? layer as SvgVisualLayer : null
  const hasThemeCapabilities = svgLayer?.document
    ? hasManagedSvgThemeClasses(svgLayer.document)
    : false

  const capabilities: DisplayedCapability[] = []

  if (hasThemeCapabilities) {
    for (const method of SVG_LAYER_BUILTIN_METHODS) {
      const parameters: readonly ComponentActionParameterDefinition[] =
        method.parameter
          ? [
              {
                name: method.parameter.name,
                title: method.parameter.title,
                kind: method.parameter.kind,
                options: method.parameter.options,
              },
            ]
          : []
      capabilities.push({
        key: `svg:${method.name}`,
        name: method.name,
        title: method.title,
        description: method.description,
        parameters,
        source: 'svg-declarative',
      })
    }
  }

  for (const [name, action] of Object.entries(definition.actions)) {
    capabilities.push({
      key: `action:${name}`,
      name,
      title: action.title,
      description: action.description ?? '',
      parameters: action.parameters ?? [],
      source: 'public-contract',
    })
  }

  return (
    <div
      className="component-layer-methods-inspector"
      data-portable-action-execution="disabled"
    >
      <CollapsibleInspectorGroup
        title="方法 (Actions)"
        defaultOpen={true}
        className="component-methods-inspector-group"
      >
        <div className="component-methods-header-bar">
          <strong>可用方法</strong>
          <span className="component-methods-count-hint">
            共 {capabilities.length} 个声明能力
          </span>
        </div>

        <div className="component-methods-status-banner" role="status">
          当前仅展示方法签名。可移植用户组件尚无已接受的 Action
          执行契约，因此这里不会保存或运行 JavaScript 源码
          {readOnly ? '；预览模式保持只读。' : '。'}
        </div>

        <div className="component-methods-list">
          {capabilities.map((capability) => {
            const parameterList = formatParameters(capability.parameters)
            const signature = `${capability.name}(${parameterList})`
            return (
              <div key={capability.key} className="component-method-card">
                <div className="component-method-main">
                  <span className="component-method-pill">
                    {capability.source === 'public-contract' ? 'API' : 'SVG'}
                  </span>
                  <strong className="component-method-name">
                    {capability.name}
                  </strong>
                  <span className="component-method-params">
                    {capability.title}
                  </span>
                </div>

                {capability.description && (
                  <div className="component-method-description">
                    <span className="component-method-desc-text">
                      {capability.description}
                    </span>
                  </div>
                )}

                <div className="component-method-action-row">
                  <code className="component-method-signature">
                    {signature}
                  </code>
                  <span className="component-methods-count-hint">
                    {capability.source === 'public-contract'
                      ? '公开声明 · 不可执行'
                      : '声明式视觉能力'}
                  </span>
                </div>
              </div>
            )
          })}

          {capabilities.length === 0 && (
            <div className="component-methods-count-hint">
              当前节点没有可展示的方法签名。
            </div>
          )}
        </div>
      </CollapsibleInspectorGroup>
    </div>
  )
}
