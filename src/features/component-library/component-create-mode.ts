import { useSyncExternalStore } from 'react'
import type {
  ComponentVisualDefinition,
  VectorVisualLayer,
} from '../../component-system/visual'

export type DrawableVisualPrimitive = 'rect' | 'circle' | 'ellipse' | 'line'

export type ComponentCreateTool = {
  kind: 'vector'
  primitive: DrawableVisualPrimitive
  label: string
  defaultWidth: number
  defaultHeight: number
}

export type ComponentDesignPoint = {
  x: number
  y: number
}

export type ComponentCreateGeometry = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

const CREATE_DRAG_THRESHOLD = 4
const DRAWN_LINE_HEIGHT = 8

let activeTool: ComponentCreateTool | null = null
const listeners = new Set<() => void>()

function emitToolChange() {
  for (const listener of listeners) listener()
}

function sameTool(left: ComponentCreateTool | null, right: ComponentCreateTool) {
  return left?.kind === right.kind && left.primitive === right.primitive
}

export function useComponentCreateTool() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) activeTool = null
      }
    },
    () => activeTool,
    () => null,
  )
}

export function selectComponentCreateTool(tool: ComponentCreateTool) {
  activeTool = sameTool(activeTool, tool) ? null : tool
  emitToolChange()
}

export function clearComponentCreateTool() {
  if (!activeTool) return
  activeTool = null
  emitToolChange()
}

export function isDrawableVisualPrimitive(
  primitive: string,
): primitive is DrawableVisualPrimitive {
  return primitive === 'rect'
    || primitive === 'circle'
    || primitive === 'ellipse'
    || primitive === 'line'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clickGeometry(
  tool: ComponentCreateTool,
  point: ComponentDesignPoint,
  designWidth: number,
  designHeight: number,
): ComponentCreateGeometry {
  const width = Math.min(tool.defaultWidth, designWidth)
  const height = Math.min(tool.defaultHeight, designHeight)

  return {
    x: clamp(point.x - width / 2, 0, Math.max(0, designWidth - width)),
    y: clamp(point.y - height / 2, 0, Math.max(0, designHeight - height)),
    width,
    height,
    rotation: 0,
  }
}

export function resolveComponentCreateGeometry(
  tool: ComponentCreateTool,
  start: ComponentDesignPoint,
  end: ComponentDesignPoint,
  designWidth: number,
  designHeight: number,
): ComponentCreateGeometry {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)

  if (distance < CREATE_DRAG_THRESHOLD) {
    return clickGeometry(tool, start, designWidth, designHeight)
  }

  if (tool.primitive === 'line') {
    const rotation = Math.atan2(dy, dx) * 180 / Math.PI
    const radians = rotation * Math.PI / 180
    const halfHeight = DRAWN_LINE_HEIGHT / 2

    return {
      x: start.x + Math.sin(radians) * halfHeight,
      y: start.y - Math.cos(radians) * halfHeight,
      width: Math.max(CREATE_DRAG_THRESHOLD, distance),
      height: DRAWN_LINE_HEIGHT,
      rotation,
    }
  }

  if (tool.primitive === 'circle') {
    const side = Math.max(CREATE_DRAG_THRESHOLD, Math.max(Math.abs(dx), Math.abs(dy)))
    const x = dx >= 0 ? start.x : start.x - side
    const y = dy >= 0 ? start.y : start.y - side
    const clampedSide = Math.min(side, designWidth, designHeight)

    return {
      x: clamp(x, 0, Math.max(0, designWidth - clampedSide)),
      y: clamp(y, 0, Math.max(0, designHeight - clampedSide)),
      width: clampedSide,
      height: clampedSide,
      rotation: 0,
    }
  }

  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)
  const width = Math.max(CREATE_DRAG_THRESHOLD, Math.min(designWidth - left, right - left))
  const height = Math.max(CREATE_DRAG_THRESHOLD, Math.min(designHeight - top, bottom - top))

  return {
    x: clamp(left, 0, Math.max(0, designWidth - width)),
    y: clamp(top, 0, Math.max(0, designHeight - height)),
    width,
    height,
    rotation: 0,
  }
}

function nextVectorLayerId(visual: ComponentVisualDefinition) {
  const ids = new Set(visual.layers.map((layer) => layer.id))
  let index = 1

  while (ids.has(`vector${index}`)) index += 1
  return `vector${index}`
}

export function appendCreatedVectorLayer(
  visual: ComponentVisualDefinition,
  tool: ComponentCreateTool,
  geometry: ComponentCreateGeometry,
) {
  if (visual.mode !== 'composite') {
    return { visual, layerId: null as string | null }
  }

  const id = nextVectorLayerId(visual)
  const suffix = id.replace(/\D+/g, '')
  const layer: VectorVisualLayer = {
    id,
    name: `${tool.label} ${suffix}`.trim(),
    kind: 'vector',
    parentId: null,
    transform: {
      ...geometry,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    opacity: 1,
    primitive: tool.primitive,
  }

  return {
    visual: { ...visual, layers: [...visual.layers, layer] },
    layerId: id,
  }
}
