import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import { Layer, Stage, Transformer } from 'react-konva'
import {
  COMPOSITE_VISUAL_LAYER_NODE_NAME,
  CompositeComponentVisualRenderer,
  compositeVisualLayerNodeId,
  getCompositeVisualLayerId,
} from '../../component-system/CompositeComponentVisualRenderer'
import type { ComponentProps } from '../../component-system/definition'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import { resolveComponentVisualRules } from '../../component-system/visualRules'
import {
  layerKindLabel,
  type ComponentWorkbenchMode,
} from './ComponentVisualTreeEditor'

type ComponentVisualCanvasProps = {
  visual: ComponentVisualDefinition
  propertyValues: ComponentProps
  componentTitle: string
  designWidth: number
  designHeight: number
  selectedLayerId: string | null
  mode: ComponentWorkbenchMode
  readOnly: boolean
  onSelectionChange: (layerId: string | null) => void
  onChange: (visual: ComponentVisualDefinition) => void
}

const TRANSFORMER_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

const WORKBENCH_ARTBOARD_MAX_WIDTH = 720
const WORKBENCH_ARTBOARD_MAX_HEIGHT = 520

function isInsideTransformer(
  target: Konva.Node,
  transformer: Konva.Transformer | null,
) {
  let current: Konva.Node | null = target

  while (current) {
    if (current === transformer) {
      return true
    }

    current = current.getParent()
  }

  return false
}

function findLayerNode(stage: Konva.Stage, layerId: string) {
  const expectedId = compositeVisualLayerNodeId(layerId)

  return stage
    .find(`.${COMPOSITE_VISUAL_LAYER_NODE_NAME}`)
    .find((node) => node.id() === expectedId) as Konva.Group | undefined
}

export function ComponentVisualCanvas({
  visual,
  propertyValues,
  componentTitle,
  designWidth,
  designHeight,
  selectedLayerId,
  mode,
  readOnly,
  onSelectionChange,
  onChange,
}: ComponentVisualCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const selectedLayer = visual.layers.find((layer) => layer.id === selectedLayerId) ?? null
  const renderedVisual = mode === 'preview'
    ? resolveComponentVisualRules(visual, propertyValues)
    : visual
  const visualDesignWidth = visual.designSize.width
  const visualDesignHeight = visual.designSize.height
  const artboardScale = Math.min(
    WORKBENCH_ARTBOARD_MAX_WIDTH / Math.max(1, visualDesignWidth),
    WORKBENCH_ARTBOARD_MAX_HEIGHT / Math.max(1, visualDesignHeight),
  )
  const artboardWidth = visualDesignWidth * artboardScale
  const artboardHeight = visualDesignHeight * artboardScale
  const isComposite = visual.mode === 'composite'
  const isEditable = isComposite && mode === 'editor' && !readOnly

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current

    if (!transformer || !stage) {
      return
    }

    const selectedNode =
      isEditable && selectedLayerId && selectedLayer?.visible
        ? findLayerNode(stage, selectedLayerId)
        : undefined

    transformer.nodes(selectedNode ? [selectedNode] : [])
    transformer.getLayer()?.batchDraw()
  }, [isEditable, selectedLayer, selectedLayerId, visual.layers])

  function commitLayerTransform(node: Konva.Node) {
    if (!isEditable) {
      return
    }

    const layerId = getCompositeVisualLayerId(node)
    const layer = layerId
      ? visual.layers.find((candidate) => candidate.id === layerId)
      : null

    if (!layerId || !layer) {
      return
    }

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    if (
      !Number.isFinite(node.x()) ||
      !Number.isFinite(node.y()) ||
      !Number.isFinite(node.rotation()) ||
      !Number.isFinite(scaleX) ||
      !Number.isFinite(scaleY) ||
      Math.abs(scaleX) < 0.001 ||
      Math.abs(scaleY) < 0.001
    ) {
      return
    }

    onChange({
      ...visual,
      layers: visual.layers.map((candidate) =>
        candidate.id === layerId
          ? {
              ...candidate,
              transform: {
                ...candidate.transform,
                x: node.x(),
                y: node.y(),
                rotation: node.rotation(),
                scaleX,
                scaleY,
              },
            }
          : candidate,
      ),
    })
  }

  function handlePointerTarget(target: Konva.Node) {
    if (!isEditable || isInsideTransformer(target, transformerRef.current)) {
      return
    }

    onSelectionChange(getCompositeVisualLayerId(target))
  }

  function commitSelectedTransform() {
    const transformer = transformerRef.current
    const node = transformer?.nodes()[0]

    if (node) {
      commitLayerTransform(node)
    }
  }

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
            <Stage
              ref={stageRef}
              width={artboardWidth}
              height={artboardHeight}
              listening={isEditable}
              onMouseDown={(event) => handlePointerTarget(event.target)}
              onTouchStart={(event) => handlePointerTarget(event.target)}
              onDragEnd={(event) => commitLayerTransform(event.target)}
            >
              <Layer listening={isEditable}>
                <CompositeComponentVisualRenderer
                  visual={renderedVisual}
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  rotation={0}
                  visible
                  opacity={1}
                  listening={isEditable}
                  draggableLayerId={isEditable ? selectedLayerId : null}
                  frontLayerId={isEditable ? selectedLayerId : null}
                />
                <Transformer
                  ref={transformerRef}
                  visible={isEditable && Boolean(selectedLayer?.visible)}
                  enabledAnchors={TRANSFORMER_ANCHORS}
                  rotateEnabled
                  flipEnabled={false}
                  keepRatio={false}
                  anchorSize={7}
                  rotateAnchorOffset={22}
                  borderStroke="#2563eb"
                  anchorStroke="#2563eb"
                  anchorFill="#ffffff"
                  borderStrokeWidth={1}
                  anchorStrokeWidth={1}
                  boundBoxFunc={(oldBox, newBox) =>
                    Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4
                      ? oldBox
                      : newBox
                  }
                  onTransformEnd={commitSelectedTransform}
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
          <span>设计空间 {visualDesignWidth} × {visualDesignHeight}</span>
          <span>实例默认 {designWidth} × {designHeight}</span>
          <span>{visual.layers.length} 个图层</span>
          {(visual.rules?.length ?? 0) > 0 && <span>{visual.rules?.length} 条规则</span>}
        </span>
      </div>
    </>
  )
}
