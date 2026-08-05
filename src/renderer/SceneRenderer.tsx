import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Layer, Rect, Stage, Transformer } from 'react-konva'
import {
  PUMP_MIN_HEIGHT,
  PUMP_MIN_WIDTH,
} from '../components/PumpNode'
import type { NodeTransform, SceneDocument } from '../scene/model'
import { SceneNodeRenderer } from './SceneNodeRenderer'

export type RendererMode = 'editor' | 'preview'

export type SceneRendererProps = {
  scene: SceneDocument
  mode: RendererMode
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onTransformNode: (nodeId: string, transform: NodeTransform) => void
}

const CORNER_ANCHORS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

export function SceneRenderer({
  scene,
  mode,
  selectedNodeId,
  onSelectNode,
  onTransformNode,
}: SceneRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Group>())
  const [viewport, setViewport] = useState({ width: 960, height: 640 })

  const selectedNode =
    scene.nodes.find((node) => node.id === selectedNodeId) ?? null

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return
      }

      setViewport({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      })
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const transformer = transformerRef.current

    if (!transformer) {
      return
    }

    const selectedNodeRef = selectedNodeId
      ? nodeRefs.current.get(selectedNodeId)
      : undefined

    transformer.nodes(
      mode === 'editor' && selectedNodeRef ? [selectedNodeRef] : [],
    )
    transformer.getLayer()?.batchDraw()
  }, [mode, selectedNodeId, scene.nodes])

  return (
    <div ref={containerRef} className="konva-host">
      <Stage
        width={viewport.width}
        height={viewport.height}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            onSelectNode(null)
          }
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) {
            onSelectNode(null)
          }
        }}
      >
        <Layer listening={false}>
          <Rect
            width={viewport.width}
            height={viewport.height}
            fill={scene.background}
          />
        </Layer>

        <Layer>
          {scene.nodes.map((node) => (
            <SceneNodeRenderer
              key={node.id}
              ref={(instance) => {
                if (instance) {
                  nodeRefs.current.set(node.id, instance)
                } else {
                  nodeRefs.current.delete(node.id)
                }
              }}
              node={node}
              editable={mode === 'editor'}
              onSelect={() => {
                if (mode === 'editor') {
                  onSelectNode(node.id)
                }
              }}
              onTransformChange={(transform) => {
                onTransformNode(node.id, transform)
              }}
            />
          ))}

          <Transformer
            ref={transformerRef}
            enabledAnchors={[...CORNER_ANCHORS]}
            rotateEnabled
            flipEnabled={false}
            keepRatio
            shiftBehavior="none"
            borderStroke="#38bdf8"
            borderStrokeWidth={1.5}
            anchorFill="#38bdf8"
            anchorStroke="#e0f7ff"
            anchorSize={9}
            rotateAnchorOffset={24}
            boundBoxFunc={(oldBox, newBox) => {
              if (
                Math.abs(newBox.width) < PUMP_MIN_WIDTH ||
                Math.abs(newBox.height) < PUMP_MIN_HEIGHT
              ) {
                return oldBox
              }

              return newBox
            }}
          />
        </Layer>
      </Stage>

      <div className="canvas-status">
        <span>{mode === 'editor' ? '编辑模式' : '预览模式'}</span>
        {selectedNode ? (
          <code>
            {Math.round(selectedNode.transform.width)} ×{' '}
            {Math.round(selectedNode.transform.height)} /{' '}
            {Math.round(selectedNode.transform.rotation)}°
          </code>
        ) : (
          <code>{scene.nodes.length} nodes</code>
        )}
      </div>
    </div>
  )
}
