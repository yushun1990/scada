import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'
import { Layer, Line, Stage, Transformer } from 'react-konva'
import {
  COMPOSITE_VISUAL_LAYER_NODE_NAME,
  CompositeComponentVisualRenderer,
  compositeVisualLayerNodeId,
  getCompositeVisualLayerId,
} from '../../component-system/CompositeComponentVisualRenderer'
import {
  applyVisualAnimationOverlay,
  evaluateVisualAnimations,
} from '../../component-system/animations'
import type {
  ComponentAttributeValues,
  ComponentPropertyFallbackValues,
} from '../../component-system/definition'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import { resolveComponentVisualRules } from '../../component-system/visualRules'
import {
  CopyIcon,
  GridIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from '../../components/toolbar-icons'
import { NumberInput, ToolbarButton } from '../../ui'
import {
  applyComponentLayerSnap,
  COMPONENT_SNAP_GRID_SIZE,
  computeComponentLayerSnap,
  type ComponentSnapResult,
} from './component-canvas-snap'
import {
  cloneComponentLayerSubtrees,
  deleteComponentLayers,
} from './component-layer-hierarchy'
import {
  layerKindLabel,
  type ComponentLayerSelectionChange,
  type ComponentWorkbenchMode,
} from './ComponentVisualTreeEditor'
import './component-canvas-snap.css'

type ComponentVisualCanvasProps = {
  visual: ComponentVisualDefinition
  attributeValues: ComponentAttributeValues
  propertyValues: ComponentPropertyFallbackValues
  componentTitle: string
  designWidth: number
  designHeight: number
  selectedLayerIds: readonly string[]
  primaryLayerId: string | null
  mode: ComponentWorkbenchMode
  readOnly: boolean
  snapEnabled: boolean
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

type CanvasViewport = {
  width: number
  height: number
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
const WORKBENCH_ARTBOARD_FIT_GUTTER = 4
const COMPONENT_VISUAL_HISTORY_LIMIT = 100

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

function measureCanvasViewport(element: HTMLDivElement): CanvasViewport {
  const style = window.getComputedStyle(element)
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const verticalPadding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)

  return {
    width: Math.max(
      1,
      element.clientWidth - horizontalPadding - WORKBENCH_ARTBOARD_FIT_GUTTER,
    ),
    height: Math.max(
      1,
      element.clientHeight - verticalPadding - WORKBENCH_ARTBOARD_FIT_GUTTER,
    ),
  }
}

function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function cloneVisual(visual: ComponentVisualDefinition): ComponentVisualDefinition {
  return structuredClone(visual)
}

function cloneLayerTransform(
  visual: ComponentVisualDefinition,
  layerId: string,
) {
  const layer = visual.layers.find((candidate) => candidate.id === layerId)
  return layer ? { ...layer.transform } : null
}

export function ComponentVisualCanvas({
  visual,
  attributeValues,
  propertyValues,
  componentTitle,
  designWidth,
  designHeight,
  selectedLayerIds,
  primaryLayerId,
  mode,
  readOnly,
  snapEnabled,
  onSelectionChange,
  onChange,
}: ComponentVisualCanvasProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const verticalGuideRef = useRef<Konva.Line>(null)
  const horizontalGuideRef = useRef<Konva.Line>(null)
  const visualRef = useRef(visual)
  const undoStackRef = useRef<ComponentVisualDefinition[]>([])
  const redoStackRef = useRef<ComponentVisualDefinition[]>([])
  const applyingHistoryRef = useRef(false)
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport | null>(null)
  const [editToolbarHost, setEditToolbarHost] = useState<HTMLElement | null>(null)
  const [viewToolbarHost, setViewToolbarHost] = useState<HTMLElement | null>(null)
  const [gridVisible, setGridVisible] = useState(true)
  const [gridSize, setGridSize] = useState(COMPONENT_SNAP_GRID_SIZE)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [animationTimeMs, setAnimationTimeMs] = useState(0)
  const selectedLayer = visual.layers.find((layer) => layer.id === primaryLayerId) ?? null
  const selectedVisibleLayerIds = useMemo(
    () => selectedLayerIds.filter((layerId) =>
      visual.layers.some((layer) => layer.id === layerId && layer.visible),
    ),
    [selectedLayerIds, visual.layers],
  )
  const ruleResolvedVisual = mode === 'preview'
    ? resolveComponentVisualRules(visual, {
        attributes: attributeValues,
        properties: propertyValues,
      })
    : visual
  const renderedVisual = mode === 'preview'
    ? applyVisualAnimationOverlay(
        ruleResolvedVisual,
        evaluateVisualAnimations(ruleResolvedVisual, propertyValues, animationTimeMs),
      )
    : visual
  const visualDesignWidth = visual.designSize.width
  const visualDesignHeight = visual.designSize.height
  const maxArtboardScale = Math.min(
    WORKBENCH_ARTBOARD_MAX_WIDTH / Math.max(1, visualDesignWidth),
    WORKBENCH_ARTBOARD_MAX_HEIGHT / Math.max(1, visualDesignHeight),
  )
  const viewportArtboardScale = canvasViewport
    ? Math.min(
        canvasViewport.width / Math.max(1, visualDesignWidth),
        canvasViewport.height / Math.max(1, visualDesignHeight),
      )
    : Math.min(1, maxArtboardScale)
  const artboardScale = Math.max(
    0.01,
    Math.min(maxArtboardScale, viewportArtboardScale),
  )
  const artboardWidth = visualDesignWidth * artboardScale
  const artboardHeight = visualDesignHeight * artboardScale
  const isComposite = visual.mode === 'composite'
  const isEditable = isComposite && mode === 'editor' && !readOnly
  const showDesignGrid = isComposite && mode === 'editor' && gridVisible
  const canTransformSelection = selectedLayerIds.length === 1

  useEffect(() => {
    visualRef.current = visual
  }, [visual])

  useLayoutEffect(() => {
    const host = canvasHostRef.current
    if (!host) return

    const measure = () => setCanvasViewport(measureCanvasViewport(host))
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const editHost = document.querySelector<HTMLElement>('.component-canvas-toolbar .component-tool-edit')
    const viewHost = document.querySelector<HTMLElement>('.component-canvas-toolbar .component-tool-view')
    setEditToolbarHost(editHost)
    setViewToolbarHost(viewHost)
  }, [])

  useEffect(() => {
    if (mode !== 'preview' || visual.animations.length === 0) {
      setAnimationTimeMs(0)
      return
    }

    let frameId = 0
    let epochMs: number | null = null
    const tick = (nowMs: number) => {
      epochMs ??= nowMs
      setAnimationTimeMs(nowMs - epochMs)
      frameId = window.requestAnimationFrame(tick)
    }
    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [mode, visual.animations.length])

  useEffect(() => {
    const stage = stageRef.current
    const transformer = transformerRef.current
    if (!stage || !transformer || !isEditable) {
      transformer?.nodes([])
      transformer?.getLayer()?.batchDraw()
      return
    }

    const nodes = selectedVisibleLayerIds
      .map((layerId) => findLayerNode(stage, layerId))
      .filter((node): node is Konva.Group => Boolean(node))
    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [isEditable, renderedVisual, selectedVisibleLayerIds])

  function commitVisual(nextVisual: ComponentVisualDefinition) {
    if (applyingHistoryRef.current) {
      visualRef.current = nextVisual
      onChange(nextVisual)
      return
    }

    const current = visualRef.current
    undoStackRef.current = [...undoStackRef.current, cloneVisual(current)].slice(
      -COMPONENT_VISUAL_HISTORY_LIMIT,
    )
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
    visualRef.current = nextVisual
    onChange(nextVisual)
  }

  function undo() {
    const previous = undoStackRef.current.pop()
    if (!previous) return
    redoStackRef.current.push(cloneVisual(visualRef.current))
    applyingHistoryRef.current = true
    visualRef.current = previous
    onChange(previous)
    applyingHistoryRef.current = false
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
  }

  function redo() {
    const next = redoStackRef.current.pop()
    if (!next) return
    undoStackRef.current.push(cloneVisual(visualRef.current))
    applyingHistoryRef.current = true
    visualRef.current = next
    onChange(next)
    applyingHistoryRef.current = false
    setCanUndo(true)
    setCanRedo(redoStackRef.current.length > 0)
  }

  function updateLayerTransform(
    layerId: string,
    transform: ComponentVisualDefinition['layers'][number]['transform'],
  ) {
    commitVisual({
      ...visualRef.current,
      layers: visualRef.current.layers.map((layer) =>
        layer.id === layerId ? { ...layer, transform } : layer,
      ),
    })
  }

  function duplicateSelection() {
    if (!isEditable || selectedLayerIds.length === 0) return
    const result = cloneComponentLayerSubtrees(visualRef.current, selectedLayerIds)
    commitVisual(result.visual)
    onSelectionChange(result.clonedRootIds[result.clonedRootIds.length - 1] ?? null)
  }

  function deleteSelection() {
    if (!isEditable || selectedLayerIds.length === 0) return
    commitVisual(deleteComponentLayers(visualRef.current, selectedLayerIds))
    onSelectionChange(null)
  }

  useEffect(() => {
    if (!isEditable) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return
      const modifier = event.metaKey || event.ctrlKey

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelection()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEditable, selectedLayerIds])

  function clearSnapGuides() {
    verticalGuideRef.current?.visible(false)
    horizontalGuideRef.current?.visible(false)
    verticalGuideRef.current?.getLayer()?.batchDraw()
  }

  function showSnapGuides(result: ComponentSnapResult) {
    const vertical = result.guides.find((guide) => guide.axis === 'x')
    const horizontal = result.guides.find((guide) => guide.axis === 'y')

    if (vertical) {
      verticalGuideRef.current?.points([vertical.position, 0, vertical.position, visualDesignHeight])
      verticalGuideRef.current?.visible(true)
    } else {
      verticalGuideRef.current?.visible(false)
    }

    if (horizontal) {
      horizontalGuideRef.current?.points([0, horizontal.position, visualDesignWidth, horizontal.position])
      horizontalGuideRef.current?.visible(true)
    } else {
      horizontalGuideRef.current?.visible(false)
    }
    verticalGuideRef.current?.getLayer()?.batchDraw()
  }

  const editToolbar = editToolbarHost && createPortal(
    <>
      <ToolbarButton
        iconOnly
        title="撤销"
        aria-label="撤销"
        disabled={!isEditable || !canUndo}
        onClick={undo}
      >
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton
        iconOnly
        title="重做"
        aria-label="重做"
        disabled={!isEditable || !canRedo}
        onClick={redo}
      >
        <RedoIcon />
      </ToolbarButton>
      <ToolbarButton
        iconOnly
        title="复制"
        aria-label="复制"
        disabled={!isEditable || selectedLayerIds.length === 0}
        onClick={duplicateSelection}
      >
        <CopyIcon />
      </ToolbarButton>
      <ToolbarButton
        iconOnly
        title="删除"
        aria-label="删除"
        disabled={!isEditable || selectedLayerIds.length === 0}
        onClick={deleteSelection}
      >
        <TrashIcon />
      </ToolbarButton>
    </>,
    editToolbarHost,
  )

  const viewToolbar = viewToolbarHost && createPortal(
    <>
      <ToolbarButton
        iconOnly
        className={`icon-button toggle-button${gridVisible ? ' active' : ''}`}
        title={gridVisible ? '隐藏网格' : '显示网格'}
        aria-label="网格"
        aria-pressed={gridVisible}
        disabled={!isComposite || mode !== 'editor'}
        onClick={() => setGridVisible((current) => !current)}
      >
        <GridIcon />
      </ToolbarButton>
      <label className="canvas-toolbar-field" title="网格大小">
        <span>Grid</span>
        <NumberInput
          aria-label="网格大小"
          min="2"
          max="100"
          step="1"
          value={gridSize}
          disabled={!isComposite || mode !== 'editor'}
          onChange={(event) => {
            const next = Math.max(2, Math.min(100, Number(event.target.value) || 2))
            setGridSize(next)
          }}
        />
      </label>
    </>,
    viewToolbarHost,
  )

  return (
    <div className="component-canvas-shell">
      {editToolbar}
      {viewToolbar}
      <div className="component-canvas-host" ref={canvasHostRef}>
        <Stage
          ref={stageRef}
          width={canvasViewport?.width ?? 1}
          height={canvasViewport?.height ?? 1}
          onPointerDown={(event) => {
            if (!isEditable) return
            const target = event.target
            if (target === stageRef.current) {
              onSelectionChange(null)
              return
            }
            if (isInsideTransformer(target, transformerRef.current)) return
            const layerId = getCompositeVisualLayerId(target)
            if (layerId) onSelectionChange(layerId, event.evt.metaKey || event.evt.ctrlKey)
          }}
        >
          <Layer>
            <CompositeComponentVisualRenderer
              visual={renderedVisual}
              x={(canvasViewport?.width ?? artboardWidth) / 2 - artboardWidth / 2}
              y={(canvasViewport?.height ?? artboardHeight) / 2 - artboardHeight / 2}
              width={artboardWidth}
              height={artboardHeight}
              rotation={0}
              visible
              opacity={1}
              listening={isEditable}
            />
            {showDesignGrid && (
              <>
                {Array.from({ length: Math.floor(visualDesignWidth / gridSize) + 1 }, (_, index) => (
                  <Line
                    key={`grid-x-${index}`}
                    points={[
                      (canvasViewport?.width ?? artboardWidth) / 2 - artboardWidth / 2 + index * gridSize * artboardScale,
                      (canvasViewport?.height ?? artboardHeight) / 2 - artboardHeight / 2,
                      (canvasViewport?.width ?? artboardWidth) / 2 - artboardWidth / 2 + index * gridSize * artboardScale,
                      (canvasViewport?.height ?? artboardHeight) / 2 + artboardHeight / 2,
                    ]}
                    stroke="rgba(148, 163, 184, 0.22)"
                    strokeWidth={1}
                    listening={false}
                  />
                ))}
                {Array.from({ length: Math.floor(visualDesignHeight / gridSize) + 1 }, (_, index) => (
                  <Line
                    key={`grid-y-${index}`}
                    points={[
                      (canvasViewport?.width ?? artboardWidth) / 2 - artboardWidth / 2,
                      (canvasViewport?.height ?? artboardHeight) / 2 - artboardHeight / 2 + index * gridSize * artboardScale,
                      (canvasViewport?.width ?? artboardWidth) / 2 + artboardWidth / 2,
                      (canvasViewport?.height ?? artboardHeight) / 2 - artboardHeight / 2 + index * gridSize * artboardScale,
                    ]}
                    stroke="rgba(148, 163, 184, 0.22)"
                    strokeWidth={1}
                    listening={false}
                  />
                ))}
              </>
            )}
          </Layer>
          <Layer>
            <Line
              ref={verticalGuideRef}
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
              visible={false}
            />
            <Line
              ref={horizontalGuideRef}
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
              visible={false}
            />
            <Transformer
              ref={transformerRef}
              enabledAnchors={TRANSFORMER_ANCHORS}
              rotateEnabled
              flipEnabled={false}
              boundBoxFunc={(oldBox, nextBox) => {
                if (nextBox.width < 4 || nextBox.height < 4) return oldBox
                return nextBox
              }}
              onTransformEnd={() => {
                if (!primaryLayerId) return
                const node = findLayerNode(stageRef.current!, primaryLayerId)
                if (!node) return
                const previous = cloneLayerTransform(visualRef.current, primaryLayerId)
                if (!previous) return
                const next = {
                  ...previous,
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(1, node.width() * node.scaleX()),
                  height: Math.max(1, node.height() * node.scaleY()),
                  rotation: node.rotation(),
                  scaleX: 1,
                  scaleY: 1,
                }
                node.scale({ x: 1, y: 1 })
                updateLayerTransform(primaryLayerId, next)
              }}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
