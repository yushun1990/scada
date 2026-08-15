export const COMPONENT_VISUAL_VERSION = 2 as const

export const DEFAULT_COMPONENT_VISUAL_DESIGN_SIZE = {
  width: 480,
  height: 360,
} as const

export type VisualLayerKind = 'group' | 'svg' | 'image' | 'vector' | 'text'
export type VisualVectorPrimitive = 'rect' | 'circle' | 'ellipse' | 'line' | 'path'
export type VisualAssetFit = 'stretch' | 'contain' | 'cover'
export type VisualTextFontStyle = 'normal' | 'bold' | 'italic' | 'bold italic'
export type VisualTextAlign = 'left' | 'center' | 'right'
export type VisualTextVerticalAlign = 'top' | 'middle' | 'bottom'

export type ComponentVisualDesignSize = {
  width: number
  height: number
}

export type VisualLayerTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
}

export type VisualVectorStyle = {
  fill: string
  stroke: string
  strokeWidth: number
}

export type VisualAssetStyle = {
  fit: VisualAssetFit
}

export type VisualTextStyle = {
  fill: string
  fontFamily: string
  fontSize: number
  fontStyle: VisualTextFontStyle
  align: VisualTextAlign
  verticalAlign: VisualTextVerticalAlign
  lineHeight: number
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
  style?: VisualAssetStyle
}

export type ImageVisualLayer = VisualLayerBase & {
  kind: 'image'
  assetRef: string
  style?: VisualAssetStyle
}

export type VectorVisualLayer = VisualLayerBase & {
  kind: 'vector'
  primitive: VisualVectorPrimitive
  pathData?: string
  style?: VisualVectorStyle
}

export type TextVisualLayer = VisualLayerBase & {
  kind: 'text'
  text: string
  style?: VisualTextStyle
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
  designSize: ComponentVisualDesignSize
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
const ASSET_FITS = new Set<VisualAssetFit>(['stretch', 'contain', 'cover'])
const TEXT_FONT_STYLES = new Set<VisualTextFontStyle>([
  'normal',
  'bold',
  'italic',
  'bold italic',
])
const TEXT_ALIGNS = new Set<VisualTextAlign>(['left', 'center', 'right'])
const TEXT_VERTICAL_ALIGNS = new Set<VisualTextVerticalAlign>([
  'top',
  'middle',
  'bottom',
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

function assertDesignSize(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Component visual 缺少 designSize')
  }

  if (
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    throw new Error('Component visual designSize 必须是大于 0 的有限尺寸')
  }
}

function assertTransform(value: unknown, layerId: string) {
  if (!isRecord(value)) {
    throw new Error(`Visual Layer ${layerId} 缺少 transform`)
  }

  const { x, y, width, height, rotation, scaleX, scaleY } = value

  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    !isFiniteNumber(rotation) ||
    !isFiniteNumber(scaleX) ||
    !isFiniteNumber(scaleY)
  ) {
    throw new Error(`Visual Layer ${layerId} 的 transform 必须全部是有限数字`)
  }

  if (width <= 0 || height <= 0) {
    throw new Error(`Visual Layer ${layerId} 的 width / height 必须大于 0`)
  }

  if (scaleX === 0 || scaleY === 0) {
    throw new Error(`Visual Layer ${layerId} 的 scale 不能为 0`)
  }
}

function assertAssetStyle(value: unknown, layerId: string) {
  if (value === undefined) return
  if (!isRecord(value) || typeof value.fit !== 'string' || !ASSET_FITS.has(value.fit as VisualAssetFit)) {
    throw new Error(`Visual Layer ${layerId} 的资源样式无效`)
  }
}

function assertVectorStyle(value: unknown, layerId: string) {
  if (value === undefined) return
  if (
    !isRecord(value) ||
    typeof value.fill !== 'string' ||
    typeof value.stroke !== 'string' ||
    !isFiniteNumber(value.strokeWidth) ||
    value.strokeWidth < 0
  ) {
    throw new Error(`Visual Layer ${layerId} 的矢量样式无效`)
  }
}

function assertTextStyle(value: unknown, layerId: string) {
  if (value === undefined) return
  if (
    !isRecord(value) ||
    typeof value.fill !== 'string' ||
    typeof value.fontFamily !== 'string' ||
    !value.fontFamily.trim() ||
    !isFiniteNumber(value.fontSize) ||
    value.fontSize <= 0 ||
    typeof value.fontStyle !== 'string' ||
    !TEXT_FONT_STYLES.has(value.fontStyle as VisualTextFontStyle) ||
    typeof value.align !== 'string' ||
    !TEXT_ALIGNS.has(value.align as VisualTextAlign) ||
    typeof value.verticalAlign !== 'string' ||
    !TEXT_VERTICAL_ALIGNS.has(value.verticalAlign as VisualTextVerticalAlign) ||
    !isFiniteNumber(value.lineHeight) ||
    value.lineHeight <= 0
  ) {
    throw new Error(`Visual Layer ${layerId} 的文本样式无效`)
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
    assertAssetStyle(value.style, value.id as string)
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
    assertVectorStyle(value.style, value.id as string)
  }

  if (value.kind === 'text') {
    if (typeof value.text !== 'string') {
      throw new Error(`Visual Layer ${String(value.id)} 的 text 必须是字符串`)
    }
    assertTextStyle(value.style, value.id as string)
  }
}

export function createDefaultVisualAssetStyle(): VisualAssetStyle {
  return { fit: 'stretch' }
}

export function createDefaultVisualVectorStyle(
  transform?: Pick<VisualLayerTransform, 'width' | 'height'>,
): VisualVectorStyle {
  const width = transform?.width ?? 64
  const height = transform?.height ?? 64
  return {
    fill: '#cbd5e1',
    stroke: '#64748b',
    strokeWidth: Math.max(1, Math.min(width, height) * 0.02),
  }
}

export function createDefaultVisualTextStyle(
  transform?: Pick<VisualLayerTransform, 'width' | 'height'>,
): VisualTextStyle {
  const width = transform?.width ?? 64
  const height = transform?.height ?? 64
  return {
    fill: '#334155',
    fontFamily: 'Arial',
    fontSize: Math.max(10, Math.min(width, height) * 0.22),
    fontStyle: 'normal',
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1,
  }
}

export function resolveVisualAssetStyle(
  layer: SvgVisualLayer | ImageVisualLayer,
): VisualAssetStyle {
  return layer.style ? { ...layer.style } : createDefaultVisualAssetStyle()
}

export function resolveVisualVectorStyle(layer: VectorVisualLayer): VisualVectorStyle {
  return layer.style
    ? { ...layer.style }
    : createDefaultVisualVectorStyle(layer.transform)
}

export function resolveVisualTextStyle(layer: TextVisualLayer): VisualTextStyle {
  return layer.style
    ? { ...layer.style }
    : createDefaultVisualTextStyle(layer.transform)
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

  assertDesignSize(value.designSize)

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

function cloneDesignSize(
  designSize: ComponentVisualDesignSize = DEFAULT_COMPONENT_VISUAL_DESIGN_SIZE,
): ComponentVisualDesignSize {
  return {
    width: designSize.width,
    height: designSize.height,
  }
}

function cloneVisualLayer(layer: ComponentVisualLayer): ComponentVisualLayer {
  const transform = { ...layer.transform }

  if (layer.kind === 'group') return { ...layer, transform }
  if (layer.kind === 'vector') {
    return {
      ...layer,
      transform,
      style: layer.style ? { ...layer.style } : undefined,
    }
  }
  if (layer.kind === 'text') {
    return {
      ...layer,
      transform,
      style: layer.style ? { ...layer.style } : undefined,
    }
  }
  return {
    ...layer,
    transform,
    style: layer.style ? { ...layer.style } : undefined,
  }
}

export function createEmptyCompositeVisual(
  designSize: ComponentVisualDesignSize = DEFAULT_COMPONENT_VISUAL_DESIGN_SIZE,
): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'composite',
    designSize: cloneDesignSize(designSize),
    layers: [],
  }
}

export function createNativeVisual(): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'native',
    designSize: cloneDesignSize(),
    layers: [],
  }
}

export function cloneComponentVisual(
  visual: ComponentVisualDefinition,
): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: visual.mode,
    designSize: cloneDesignSize(visual.designSize),
    layers: visual.layers.map(cloneVisualLayer),
  }
}
