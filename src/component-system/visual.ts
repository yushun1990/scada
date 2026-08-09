export const COMPONENT_VISUAL_VERSION = 1 as const

export type VisualLayerKind = 'group' | 'svg' | 'image' | 'vector' | 'text'
export type VisualVectorPrimitive = 'rect' | 'circle' | 'ellipse' | 'line' | 'path'

export type VisualLayerTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
}

type VisualLayerBase = {
  id: string
  name: string
  kind: VisualLayerKind
  parentId: string | null
  transform: VisualLayerTransform
  visible: boolean
  opacity: number
}

export type GroupVisualLayer = VisualLayerBase & {
  kind: 'group'
}

export type SvgVisualLayer = VisualLayerBase & {
  kind: 'svg'
  assetRef: string
}

export type ImageVisualLayer = VisualLayerBase & {
  kind: 'image'
  assetRef: string
}

export type VectorVisualLayer = VisualLayerBase & {
  kind: 'vector'
  primitive: VisualVectorPrimitive
  pathData?: string
}

export type TextVisualLayer = VisualLayerBase & {
  kind: 'text'
  text: string
}

export type ComponentVisualLayer =
  | GroupVisualLayer
  | SvgVisualLayer
  | ImageVisualLayer
  | VectorVisualLayer
  | TextVisualLayer

export type ComponentVisualDefinition = {
  version: typeof COMPONENT_VISUAL_VERSION
  mode: 'native' | 'composite'
  layers: readonly ComponentVisualLayer[]
}

const LAYER_KINDS = new Set<VisualLayerKind>([
  'group',
  'svg',
  'image',
  'vector',
  'text',
])
const VECTOR_PRIMITIVES = new Set<VisualVectorPrimitive>([
  'rect',
  'circle',
  'ellipse',
  'line',
  'path',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function assertText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}不能为空`)
  }
}

function assertTransform(value: unknown, layerId: string) {
  if (!isRecord(value)) {
    throw new Error(`Visual Layer ${layerId} 缺少 transform`)
  }

  for (const field of ['x', 'y', 'width', 'height', 'rotation', 'scaleX', 'scaleY'] as const) {
    if (!isFiniteNumber(value[field])) {
      throw new Error(`Visual Layer ${layerId} 的 ${field} 必须是有限数字`)
    }
  }

  if (value.width <= 0 || value.height <= 0) {
    throw new Error(`Visual Layer ${layerId} 的 width / height 必须大于 0`)
  }

  if (value.scaleX === 0 || value.scaleY === 0) {
    throw new Error(`Visual Layer ${layerId} 的 scale 不能为 0`)
  }
}

function assertLayer(value: unknown, index: number): asserts value is ComponentVisualLayer {
  if (!isRecord(value)) {
    throw new Error(`第 ${index + 1} 个 Visual Layer 无效`)
  }

  assertText(value.id, `Visual Layer ${index + 1} ID`)
  assertText(value.name, `Visual Layer ${String(value.id)} 名称`)

  if (typeof value.kind !== 'string' || !LAYER_KINDS.has(value.kind as VisualLayerKind)) {
    throw new Error(`Visual Layer ${String(value.id)} 的 kind 无效`)
  }

  if (value.parentId !== null && typeof value.parentId !== 'string') {
    throw new Error(`Visual Layer ${String(value.id)} 的 parentId 无效`)
  }

  assertTransform(value.transform, value.id as string)

  if (typeof value.visible !== 'boolean') {
    throw new Error(`Visual Layer ${String(value.id)} 的 visible 必须是布尔值`)
  }

  if (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1) {
    throw new Error(`Visual Layer ${String(value.id)} 的 opacity 必须位于 0..1`)
  }

  if (value.kind === 'svg' || value.kind === 'image') {
    if (typeof value.assetRef !== 'string') {
      throw new Error(`Visual Layer ${String(value.id)} 的 assetRef 必须是字符串`)
    }
  }

  if (value.kind === 'vector') {
    if (
      typeof value.primitive !== 'string' ||
      !VECTOR_PRIMITIVES.has(value.primitive as VisualVectorPrimitive)
    ) {
      throw new Error(`Visual Layer ${String(value.id)} 的 vector primitive 无效`)
    }

    if (value.pathData !== undefined && typeof value.pathData !== 'string') {
      throw new Error(`Visual Layer ${String(value.id)} 的 pathData 必须是字符串`)
    }
  }

  if (value.kind === 'text' && typeof value.text !== 'string') {
    throw new Error(`Visual Layer ${String(value.id)} 的 text 必须是字符串`)
  }
}

export function assertComponentVisualDefinition(
  value: unknown,
): asserts value is ComponentVisualDefinition {
  if (
    !isRecord(value) ||
    value.version !== COMPONENT_VISUAL_VERSION ||
    (value.mode !== 'native' && value.mode !== 'composite') ||
    !Array.isArray(value.layers)
  ) {
    throw new Error('Component visual definition 无效')
  }

  if (value.mode === 'native' && value.layers.length > 0) {
    throw new Error('Native component visual 不能同时保存 composite layers')
  }

  const ids = new Set<string>()

  value.layers.forEach((layer, index) => {
    assertLayer(layer, index)

    if (ids.has(layer.id)) {
      throw new Error(`Visual Layer ID 重复：${layer.id}`)
    }

    ids.add(layer.id)
  })

  const layerMap = new Map(value.layers.map((layer) => [layer.id, layer]))

  for (const layer of value.layers) {
    if (!layer.parentId) {
      continue
    }

    const parent = layerMap.get(layer.parentId)

    if (!parent) {
      throw new Error(`Visual Layer ${layer.id} 引用了不存在的 parent ${layer.parentId}`)
    }

    if (parent.kind !== 'group') {
      throw new Error(`Visual Layer ${layer.id} 的 parent 必须是 Group`)
    }

    const visited = new Set<string>([layer.id])
    let parentId: string | null = layer.parentId

    while (parentId) {
      if (visited.has(parentId)) {
        throw new Error(`Visual Layer ${layer.id} 存在循环层级`)
      }

      visited.add(parentId)
      parentId = layerMap.get(parentId)?.parentId ?? null
    }
  }
}

export function createEmptyCompositeVisual(): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'composite',
    layers: [],
  }
}

export function createNativeVisual(): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'native',
    layers: [],
  }
}

export function cloneComponentVisual(
  visual: ComponentVisualDefinition,
): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: visual.mode,
    layers: visual.layers.map((layer) => ({
      ...layer,
      transform: { ...layer.transform },
    })),
  }
}
