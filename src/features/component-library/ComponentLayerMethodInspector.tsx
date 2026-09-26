import type { ComponentDefinition } from '../../component-system/definition'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  SvgVisualLayer,
} from '../../component-system/visual'
import { ComponentSvgLayerBehaviorEditor } from './ComponentSvgLayerBehaviorEditor'
import './component-layer-methods.css'

type ComponentLayerMethodInspectorProps = {
  layer?: ComponentVisualLayer | null
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  readOnly: boolean
  onUpdateLayer: (layer: ComponentVisualLayer) => void
  onBindContract: (
    definition: ComponentDefinition,
    visual: ComponentVisualDefinition,
  ) => void
}

/**
 * Expose only host-owned declarative layer behavior for portable components.
 * Public Action/Event declarations are intentionally not projected into a
 * callable layer surface because portable packages have no accepted execution
 * or emission contract.
 */
export function ComponentLayerMethodInspector({
  layer,
  definition,
  visual,
  readOnly,
  onUpdateLayer,
  onBindContract,
}: ComponentLayerMethodInspectorProps) {
  if (!layer || layer.kind !== 'svg') {
    return (
      <div
        className="component-layer-methods-inspector"
        data-portable-action-execution="disabled"
      >
        <div className="component-methods-status-banner" role="status">
          当前图层没有可配置的声明式行为。可移植用户组件不会在图层检查器中创建或执行 Action/Event。
        </div>
      </div>
    )
  }

  return (
    <div
      className="component-layer-methods-inspector"
      data-portable-action-execution="disabled"
    >
      <ComponentSvgLayerBehaviorEditor
        layer={layer as SvgVisualLayer}
        definition={definition}
        visual={visual}
        readOnly={readOnly}
        onUpdateLayer={(nextLayer) => onUpdateLayer(nextLayer)}
        onBindContract={onBindContract}
      />
    </div>
  )
}
