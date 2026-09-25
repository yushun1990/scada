import { useMemo, useState } from 'react'
import type Konva from 'konva'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import {
  resolveVisualVectorStyle,
  type VectorVisualLayer,
} from '../../component-system/visual'

export const LINE_OVERLAY_NODE_NAME = 'line-interaction-overlay'

export function isInsideLineOverlay(target: Konva.Node | null) {
  let current: Konva.Node | null = target
  while (current) {
    if (current.hasName(LINE_OVERLAY_NODE_NAME)) return true
    current = current.getParent()
  }
  return false
}

export function getLineEndpoints(transform: VectorVisualLayer['transform']) {
  const { x, y, width, height, rotation, scaleX, scaleY } = transform
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const halfH = height / 2

  const p1 = {
    x: x - sin * halfH * scaleY,
    y: y + cos * halfH * scaleY,
  }

  const p2 = {
    x: x + cos * width * scaleX - sin * halfH * scaleY,
    y: y + sin * width * scaleX + cos * halfH * scaleY,
  }

  return { p1, p2 }
}

export function getLineDesignVertices(layer: VectorVisualLayer): { x: number; y: number }[] {
  if (layer.points && layer.points.length >= 4) {
    const { x, y, rotation, scaleX, scaleY } = layer.transform
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const result: { x: number; y: number }[] = []
    for (let i = 0; i < layer.points.length; i += 2) {
      const lx = layer.points[i] * scaleX
      const ly = layer.points[i + 1] * scaleY
      result.push({
        x: x + lx * cos - ly * sin,
        y: y + lx * sin + ly * cos,
      })
    }
    return result
  }
  const { p1, p2 } = getLineEndpoints(layer.transform)
  return [p1, p2]
}

export function normalizePolylineLayer(
  layer: VectorVisualLayer,
  vertices: { x: number; y: number }[],
): VectorVisualLayer {
  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const strokeWidth = layer.style?.strokeWidth ?? 2
  const width = Math.max(8, maxX - minX)
  const height = Math.max(8, maxY - minY, strokeWidth * 2)

  const points: number[] = []
  for (const v of vertices) {
    points.push(Math.round((v.x - minX) * 100) / 100, Math.round((v.y - minY) * 100) / 100)
  }

  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    points,
  }
}

export function convertTwoVerticesToLineLayer(
  layer: VectorVisualLayer,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): VectorVisualLayer {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const newWidth = Math.max(4, Math.hypot(dx, dy))
  const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const newRad = (newRotation * Math.PI) / 180
  const strokeWidth = layer.style?.strokeWidth ?? 2
  const halfH = Math.max(4, strokeWidth)
  const newX = p1.x + Math.sin(newRad) * halfH
  const newY = p1.y - Math.cos(newRad) * halfH

  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.round(newX * 100) / 100,
      y: Math.round(newY * 100) / 100,
      width: Math.round(newWidth * 100) / 100,
      height: halfH * 2,
      rotation: Math.round(newRotation * 100) / 100,
      scaleX: 1,
      scaleY: 1,
    },
    points: undefined,
  }
}

export function projectPointToLineSegments(
  vertices: { x: number; y: number }[],
  click: { x: number; y: number },
) {
  if (vertices.length < 2) return null
  let bestDist = Infinity
  let bestSeg = 0
  let bestPoint = { x: click.x, y: click.y }

  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]
    const b = vertices[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) continue

    const t = Math.max(0, Math.min(1, ((click.x - a.x) * dx + (click.y - a.y) * dy) / lenSq))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.hypot(click.x - projX, click.y - projY)

    if (dist < bestDist) {
      bestDist = dist
      bestSeg = i
      bestPoint = {
        x: Math.round(projX * 100) / 100,
        y: Math.round(projY * 100) / 100,
      }
    }
  }

  return {
    segmentIndex: bestSeg,
    point: bestPoint,
    distance: bestDist,
  }
}

export function snapAngleToCardinal(
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
  toleranceDeg = 4,
): { x: number; y: number } {
  const dx = toPoint.x - fromPoint.x
  const dy = toPoint.y - fromPoint.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-3) return toPoint

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const cardinals = [0, 45, 90, 135, 180, -45, -90, -135, -180]
  for (const card of cardinals) {
    if (Math.abs(deg - card) <= toleranceDeg) {
      const rad = (card * Math.PI) / 180
      return {
        x: fromPoint.x + Math.cos(rad) * dist,
        y: fromPoint.y + Math.sin(rad) * dist,
      }
    }
  }
  return toPoint
}

export type LineInteractionOverlayProps = {
  layer: VectorVisualLayer
  artboardScale: number
  selectionColor: string
  gridSize: number
  snapEnabled: boolean
  onPreviewChange: (previewLayer: VectorVisualLayer | null) => void
  onCommit: (committedLayer: VectorVisualLayer) => void
}

export function LineInteractionOverlay({
  layer,
  artboardScale,
  selectionColor,
  gridSize,
  snapEnabled,
  onPreviewChange,
  onCommit,
}: LineInteractionOverlayProps) {
  const [thicknessDragging, setThicknessDragging] = useState<number | null>(null)

  const isPolyline = Boolean(layer.points && layer.points.length >= 4)
  const vertices = useMemo(() => getLineDesignVertices(layer), [layer])

  const strokeWidth = layer.style?.strokeWidth ?? 2
  const handleDist = Math.max(14 / artboardScale, strokeWidth / 2 + 10 / artboardScale)
  const anchorRadius = 6 / artboardScale
  const strokeW = 1.5 / artboardScale
  const squareSize = 8 / artboardScale

  // Find longest segment for thickness handle
  let longestSegIdx = 0
  let maxSegLen = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const d = Math.hypot(vertices[i + 1].x - vertices[i].x, vertices[i + 1].y - vertices[i].y)
    if (d > maxSegLen) {
      maxSegLen = d
      longestSegIdx = i
    }
  }
  const sa = vertices[longestSegIdx] ?? { x: 0, y: 0 }
  const sb = vertices[longestSegIdx + 1] ?? { x: 10, y: 0 }
  const segMid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 }
  const segLen = Math.max(1, maxSegLen)
  const segNormal = {
    x: -(sb.y - sa.y) / segLen,
    y: (sb.x - sa.x) / segLen,
  }

  const pTop = {
    x: segMid.x + segNormal.x * handleDist,
    y: segMid.y + segNormal.y * handleDist,
  }
  const pBottom = {
    x: segMid.x - segNormal.x * handleDist,
    y: segMid.y - segNormal.y * handleDist,
  }

  // Flatten vertices for dashed guide
  const guidePoints = useMemo(() => vertices.flatMap((v) => [v.x, v.y]), [vertices])

  // 2-point line specific handles
  const p1 = vertices[0] ?? { x: 0, y: 0 }
  const p2 = vertices[1] ?? { x: 0, y: 0 }
  const halfH = layer.transform.height / 2

  function handleEndDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (e.evt.shiftKey) {
      const dx = curX - p1.x
      const dy = curY - p1.y
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p1.x + Math.cos(snappedRad) * dist
      curY = p1.y + Math.sin(snappedRad) * dist
    }

    const dx = curX - p1.x
    const dy = curY - p1.y
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = p1.x + Math.sin(newRad) * halfH
    const newY = p1.y - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(nextLayer)
  }

  function handleEndDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (snapEnabled) {
      const cardinalSnapped = snapAngleToCardinal(p1, { x: curX, y: curY }, 4)
      if (cardinalSnapped.x !== curX || cardinalSnapped.y !== curY) {
        curX = cardinalSnapped.x
        curY = cardinalSnapped.y
      } else {
        curX = Math.round(curX / gridSize) * gridSize
        curY = Math.round(curY / gridSize) * gridSize
      }
    }

    if (e.evt.shiftKey) {
      const dx = curX - p1.x
      const dy = curY - p1.y
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p1.x + Math.cos(snappedRad) * dist
      curY = p1.y + Math.sin(snappedRad) * dist
    }

    const dx = curX - p1.x
    const dy = curY - p1.y
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = p1.x + Math.sin(newRad) * halfH
    const newY = p1.y - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(null)
    onCommit(nextLayer)
  }

  function handleStartDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (e.evt.shiftKey) {
      const dx = p2.x - curX
      const dy = p2.y - curY
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p2.x - Math.cos(snappedRad) * dist
      curY = p2.y - Math.sin(snappedRad) * dist
    }

    const dx = p2.x - curX
    const dy = p2.y - curY
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = curX + Math.sin(newRad) * halfH
    const newY = curY - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(nextLayer)
  }

  function handleStartDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (snapEnabled) {
      const cardinalSnapped = snapAngleToCardinal(p2, { x: curX, y: curY }, 4)
      if (cardinalSnapped.x !== curX || cardinalSnapped.y !== curY) {
        curX = cardinalSnapped.x
        curY = cardinalSnapped.y
      } else {
        curX = Math.round(curX / gridSize) * gridSize
        curY = Math.round(curY / gridSize) * gridSize
      }
    }

    if (e.evt.shiftKey) {
      const dx = p2.x - curX
      const dy = p2.y - curY
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p2.x - Math.cos(snappedRad) * dist
      curY = p2.y - Math.sin(snappedRad) * dist
    }

    const dx = p2.x - curX
    const dy = p2.y - curY
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = curX + Math.sin(newRad) * halfH
    const newY = curY - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(null)
    onCommit(nextLayer)
  }

  function handleVertexDragMove(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const curX = pointer.x / artboardScale
    const curY = pointer.y / artboardScale

    const nextVertices = vertices.map((v, i) => (i === index ? { x: curX, y: curY } : v))
    const preview = normalizePolylineLayer(layer, nextVertices)
    onPreviewChange(preview)
  }

  function handleVertexDragEnd(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (snapEnabled) {
      curX = Math.round(curX / gridSize) * gridSize
      curY = Math.round(curY / gridSize) * gridSize
    }

    const nextVertices = vertices.map((v, i) => (i === index ? { x: curX, y: curY } : v))
    const committed = normalizePolylineLayer(layer, nextVertices)
    onPreviewChange(null)
    onCommit(committed)
  }

  function handleVertexDblClick(index: number) {
    if (vertices.length <= 2) return
    if (index === 0 || index === vertices.length - 1) return
    const nextVertices = vertices.filter((_, i) => i !== index)
    if (nextVertices.length === 2) {
      const converted = convertTwoVerticesToLineLayer(layer, nextVertices[0], nextVertices[1])
      onCommit(converted)
    } else {
      const normalized = normalizePolylineLayer(layer, nextVertices)
      onCommit(normalized)
    }
  }

  function handleThicknessDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const curX = pointer.x / artboardScale
    const curY = pointer.y / artboardScale

    const vx = curX - segMid.x
    const vy = curY - segMid.y
    const perpDist = Math.abs(vx * segNormal.x + vy * segNormal.y)
    let nextStrokeWidth = Math.max(1, Math.round(perpDist * 2))

    if (e.evt.shiftKey) {
      nextStrokeWidth = Math.max(1, Math.round(nextStrokeWidth / 2) * 2)
    }

    setThicknessDragging(nextStrokeWidth)

    if (isPolyline) {
      const nextLayer: VectorVisualLayer = {
        ...layer,
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(nextLayer)
    } else {
      const nextHeight = Math.max(8, nextStrokeWidth * 2)
      const rad = (layer.transform.rotation * Math.PI) / 180
      const nextX = p1.x + Math.sin(rad) * (nextHeight / 2)
      const nextY = p1.y - Math.cos(rad) * (nextHeight / 2)

      const nextLayer: VectorVisualLayer = {
        ...layer,
        transform: {
          ...layer.transform,
          x: nextX,
          y: nextY,
          height: nextHeight,
        },
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(nextLayer)
    }
  }

  function handleThicknessDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    setThicknessDragging(null)
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    const curX = pointer.x / artboardScale
    const curY = pointer.y / artboardScale

    const vx = curX - segMid.x
    const vy = curY - segMid.y
    const perpDist = Math.abs(vx * segNormal.x + vy * segNormal.y)
    let nextStrokeWidth = Math.max(1, Math.round(perpDist * 2))

    if (e.evt.shiftKey) {
      nextStrokeWidth = Math.max(1, Math.round(nextStrokeWidth / 2) * 2)
    }

    if (isPolyline) {
      const nextLayer: VectorVisualLayer = {
        ...layer,
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(null)
      onCommit(nextLayer)
    } else {
      const nextHeight = Math.max(8, nextStrokeWidth * 2)
      const rad = (layer.transform.rotation * Math.PI) / 180
      const nextX = p1.x + Math.sin(rad) * (nextHeight / 2)
      const nextY = p1.y - Math.cos(rad) * (nextHeight / 2)

      const nextLayer: VectorVisualLayer = {
        ...layer,
        transform: {
          ...layer.transform,
          x: nextX,
          y: nextY,
          height: nextHeight,
        },
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(null)
      onCommit(nextLayer)
    }
  }

  return (
    <Group name={LINE_OVERLAY_NODE_NAME}>
      {/* Dashed guide between endpoints / vertices */}
      <Line
        points={guidePoints}
        stroke={selectionColor}
        strokeWidth={1 / artboardScale}
        dash={[4 / artboardScale, 4 / artboardScale]}
        listening={false}
      />
      {/* Dashed perpendicular guide across midpoint for thickness */}
      <Line
        points={[pTop.x, pTop.y, pBottom.x, pBottom.y]}
        stroke={selectionColor}
        strokeWidth={1 / artboardScale}
        opacity={0.6}
        dash={[2 / artboardScale, 2 / artboardScale]}
        listening={false}
      />

      {/* Handles */}
      {isPolyline ? (
        vertices.map((v, index) => (
          <Group key={index} x={v.x} y={v.y}>
            <Circle
              x={0}
              y={0}
              radius={anchorRadius}
              fill="#ffffff"
              stroke={selectionColor}
              strokeWidth={strokeW}
              hitStrokeWidth={18 / artboardScale}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true
              }}
              onDragMove={(e) => handleVertexDragMove(index, e)}
              onDragEnd={(e) => handleVertexDragEnd(index, e)}
              onDblClick={(e) => {
                e.cancelBubble = true
                handleVertexDblClick(index)
              }}
              onDblTap={(e) => {
                e.cancelBubble = true
                handleVertexDblClick(index)
              }}
              onMouseEnter={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'crosshair'
              }}
              onMouseLeave={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'default'
              }}
            />
          </Group>
        ))
      ) : (
        <>
          {/* P1 Start Handle */}
          <Group x={p1.x} y={p1.y}>
            <Circle
              x={0}
              y={0}
              radius={anchorRadius}
              fill="#ffffff"
              stroke={selectionColor}
              strokeWidth={strokeW}
              hitStrokeWidth={18 / artboardScale}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true
              }}
              onDragMove={handleStartDragMove}
              onDragEnd={handleStartDragEnd}
              onMouseEnter={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'crosshair'
              }}
              onMouseLeave={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'default'
              }}
            />
          </Group>
          {/* P2 End Handle */}
          <Group x={p2.x} y={p2.y}>
            <Circle
              x={0}
              y={0}
              radius={anchorRadius}
              fill="#ffffff"
              stroke={selectionColor}
              strokeWidth={strokeW}
              hitStrokeWidth={18 / artboardScale}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true
              }}
              onDragMove={handleEndDragMove}
              onDragEnd={handleEndDragEnd}
              onMouseEnter={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'crosshair'
              }}
              onMouseLeave={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'default'
              }}
            />
          </Group>
        </>
      )}

      {/* Top Thickness Handle */}
      <Group x={pTop.x} y={pTop.y}>
        <Rect
          x={-squareSize / 2}
          y={-squareSize / 2}
          width={squareSize}
          height={squareSize}
          fill="#ffffff"
          stroke={selectionColor}
          strokeWidth={strokeW}
          hitStrokeWidth={18 / artboardScale}
          draggable
          onDragStart={(e) => {
            e.cancelBubble = true
          }}
          onDragMove={handleThicknessDragMove}
          onDragEnd={handleThicknessDragEnd}
          onMouseEnter={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'ns-resize'
          }}
          onMouseLeave={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'default'
          }}
        />
      </Group>
      {/* Bottom Thickness Handle */}
      <Group x={pBottom.x} y={pBottom.y}>
        <Rect
          x={-squareSize / 2}
          y={-squareSize / 2}
          width={squareSize}
          height={squareSize}
          fill="#ffffff"
          stroke={selectionColor}
          strokeWidth={strokeW}
          hitStrokeWidth={18 / artboardScale}
          draggable
          onDragStart={(e) => {
            e.cancelBubble = true
          }}
          onDragMove={handleThicknessDragMove}
          onDragEnd={handleThicknessDragEnd}
          onMouseEnter={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'ns-resize'
          }}
          onMouseLeave={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'default'
          }}
        />
      </Group>
      {/* Live Width Badge */}
      {thicknessDragging !== null && (
        <Group x={segMid.x} y={segMid.y - handleDist - 16 / artboardScale} listening={false}>
          <Rect
            x={-24 / artboardScale}
            y={-10 / artboardScale}
            width={48 / artboardScale}
            height={20 / artboardScale}
            cornerRadius={4 / artboardScale}
            fill="#1e293b"
            opacity={0.9}
          />
          <Text
            text={`${thicknessDragging}px`}
            x={-24 / artboardScale}
            y={-5 / artboardScale}
            width={48 / artboardScale}
            align="center"
            fontSize={11 / artboardScale}
            fill="#ffffff"
          />
        </Group>
      )}
    </Group>
  )
}
