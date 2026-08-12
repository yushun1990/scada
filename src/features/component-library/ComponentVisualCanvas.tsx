import { Layer, Stage } from 'react-konva'
import { CompositeComponentVisualRenderer } from '../../component-system/CompositeComponentVisualRenderer'
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
  const artboardWidth = designWidth * artboardScale
  const artboardHeight = designHeight * artboardScale
  const isComposite = visual.mode === 'composite'

  return (
    <>
      <div className={`component-canvas-stage ${mode}`}>
        <div
          className="component-artboard"
          style={{
            width: `${artboardWidth}px`,
            height: `${artboardHeight}px`,
          }}
        >
          {isComposite ? (
            <Stage width={artboardWidth} height={artboardHeight} listening={false}>
              <Layer listening={false}>
                <CompositeComponentVisualRenderer
                  visual={visual}
                  designWidth={designWidth}
                  designHeight={designHeight}
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  rotation={0}
                  visible
                  opacity={1}
                  listening={false}
                />
              </Layer>
            </Stage>
          ) : (
            <div className="component-artboard-placeholder">
              <strong>{componentTitle}</strong>
              <span>Native Renderer</span>
              <small>内置组件继续使用可信 Native Renderer，不反向解析其内部图层。</small>
            </div>
          )}
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
