import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Layer, Rect, Stage, Transformer } from 'react-konva'
import { PumpNode } from '../components/PumpNode'
import type { PumpState } from '../assets/pump'

export type EditorMode = 'editor' | 'preview'

type PumpTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

type PumpStageProps = {
  mode: EditorMode
  pumpState: PumpState
  resetToken: number
}

const INITIAL_TRANSFORM: PumpTransform = {
  x: 220,
  y: 48,
  width: 256,
  height: 360,
  rotation: 0,
}

export function PumpStage({ mode, pumpState, resetToken }: PumpStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pumpRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [viewport, setViewport] = useState({ width: 960, height: 640 })
  const [selected, setSelected] = useState(true)
  const [transform, setTransform] = useState<PumpTransform>(INITIAL_TRANSFORM)

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
    setTransform(INITIAL_TRANSFORM)
    setSelected(true)
  }, [resetToken])

  useEffect(() => {
    const transformer = transformerRef.current
    const pump = pumpRef.current

    if (!transformer) {
      return
    }

    transformer.nodes(mode === 'editor' && selected && pump ? [pump] : [])
    transformer.getLayer()?.batchDraw()
  }, [mode, selected, transform])

  return (
    <div ref={containerRef} className="konva-host">
      <Stage
        width={viewport.width}
        height={viewport.height}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            setSelected(false)
          }
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) {
            setSelected(false)
          }
        }}
      >
        <Layer listening={false}>
          <Rect
            width={viewport.width}
            height={viewport.height}
            fill="#0b1119"
          />
        </Layer>

        <Layer>
          <PumpNode
            ref={pumpRef}
            state={pumpState}
            {...transform}
            draggable={mode === 'editor'}
            onSelect={() => {
              if (mode === 'editor') {
                setSelected(true)
              }
            }}
            onDragEnd={(x, y) => {
              setTransform((current) => ({ ...current, x, y }))
            }}
            onTransformEnd={(nextTransform) => {
              setTransform(nextTransform)
            }}
          />

          <Transformer
            ref={transformerRef}
            rotateEnabled
            flipEnabled={false}
            keepRatio
            borderStroke="#38bdf8"
            borderStrokeWidth={1.5}
            anchorFill="#38bdf8"
            anchorStroke="#e0f7ff"
            anchorSize={9}
            rotateAnchorOffset={24}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 96 || newBox.height < 128) {
                return oldBox
              }

              return newBox
            }}
          />
        </Layer>
      </Stage>

      <div className="canvas-status">
        <span>{mode === 'editor' ? '编辑模式' : '预览模式'}</span>
        <code>
          {Math.round(transform.width)} × {Math.round(transform.height)} /{' '}
          {Math.round(transform.rotation)}°
        </code>
      </div>
    </div>
  )
}
