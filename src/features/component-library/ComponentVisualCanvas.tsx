import type { ComponentVisualDefinition } from '../../component-system/visual'
import {
  layerKindLabel,
  type ComponentWorkbenchMode,
} from './ComponentVisualTreeEditor'

type ComponentVisualCanvasProps = {
  visual: ComponentVisualDefinition
  componentTitle: string
  designWidth: number
  designHeight: number
  selectedLayerId: string | null
  mode: ComponentWorkbenchMode
}

export function ComponentVisualCanvas({
  visual,
  componentTitle,
  designWidth,
  designHeight,
  selectedLayerId,
  mode,
}: ComponentVisualCanvasProps) {
  const selectedLayer = visual.layers.find((layer) => layer.id === selectedLayerId) ?? null
  const artboardScale = Math.min(
    1,
    520 / Math.max(1, designWidth),
    380 / Math.max(1, designHeight),
  )

  return (
    <>
      <div className={`component-canvas-stage ${mode}`}>
        <div
          className="component-artboard"
          style={{
            width: `${designWidth * artboardScale}px`,
            height: `${designHeight * artboardScale}px`,
          }}
        >
          <div className="component-artboard-placeholder">
            <strong>{componentTitle}</strong>
            <span>{visual.mode === 'native' ? 'Native Renderer' : 'Composite Visual'}</span>
            {mode === 'preview' ? (
              <small>预览模式已锁定编辑。</small>
            ) : selectedLayer ? (
              <small>当前图层：{selectedLayer.name} · {layerKindLabel(selectedLayer.kind)}</small>
            ) : (
              <small>当前选择：组件根。左侧选择内部图层后可在右侧编辑它。</small>
            )}
          </div>
        </div>
      </div>

      <div className="canvas-status component-canvas-status">
        <span className="canvas-status-group">
          <span className="status-mode">{mode === 'preview' ? '预览' : '设计'}</span>
          <span className="status-selection">
            {selectedLayer ? (
              <>
                <strong>{selectedLayer.name}</strong>
                <code>{layerKindLabel(selectedLayer.kind)}</code>
                <span>
                  {Math.round(selectedLayer.transform.width)} ×{' '}
                  {Math.round(selectedLayer.transform.height)}
                </span>
                <span className="status-hint">
                  @ {Math.round(selectedLayer.transform.x)}, {Math.round(selectedLayer.transform.y)}
                </span>
              </>
            ) : (
              <>
                <strong>组件根</strong>
                <code>{visual.mode === 'native' ? 'Native Visual' : 'Composite Visual'}</code>
                <span className="status-hint">未选择内部图层</span>
              </>
            )}
          </span>
        </span>
        <span className="canvas-status-group scene-status-summary">
          <strong>{componentTitle}</strong>
          <span>{designWidth} × {designHeight}</span>
          <span>{visual.layers.length} 个图层</span>
        </span>
      </div>
    </>
  )
}
