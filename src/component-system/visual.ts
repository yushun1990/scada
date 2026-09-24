import type { VisualAnimation } from './animations'
import {
  assertManagedSvgDocument,
  cloneManagedSvgDocument,
  serializeManagedSvgDataUrl,
  type ManagedSvgDocument,
} from './managedSvg'
import type { VisualRule } from './visualRules'

export const COMPONENT_VISUAL_VERSION = 4 as const

export const DEFAULT_COMPONENT_VISUAL_DESIGN_SIZE = {
  width: 480,
  height: 360,
} as const

export type VisualLayerKind = 'group' | 'svg' | 'image' | 'vector' | 'text'
export type VisualVectorPrimitive =
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'path'
  | 'polygon'
  | 'arc'
  | 'scale'
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

export type VisualLineCap = 'butt' | 'round' | 'square'
export type VisualLineMarker = 'none' | 'arrow' | 'circle' | 'square'
export type VisualLineDash = 'solid' | 'dashed' | 'dotted'

export type VisualLineBindingAnchor = 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right'

export type VisualLineBinding = {
  layerId: string
  anchor: VisualLineBindingAnchor
}

export type VisualLineRouteMode = 'straight' | 'orthogonal'
export type VisualScaleMode = 'auto' | 'fixed'
export type VisualScalePlacement = 'left' | 'right' | 'both'
export type VisualScaleLabelDirection = 'topDown' | 'bottomUp'

export type VisualAnchorOrigin =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type VisualGradientStop = {
  offset: number
  color: string
}

export type VisualGradient = {
  type: 'linear' | 'radial'
  angle?: number
  stops: readonly VisualGradientStop[]
}

export type VisualShadow = {
  color: string
  blur: number
  offsetX: number
  offsetY: number
  opacity?: number
}

export type VisualVectorStyle = {
  fill: string
  stroke: string
  strokeWidth: number
  lineCap?: VisualLineCap
  startMarker?: VisualLineMarker
  endMarker?: VisualLineMarker
  dash?: VisualLineDash
  cornerRadius?: number
  gradient?: VisualGradient
  shadow?: VisualShadow
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
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderVisible?: boolean
  shadow?: VisualShadow
}

type VisualLayerBase = {
  id: string
  name: string
  kind: VisualLayerKind
  parentId: string | null
  transform: VisualLayerTransform
  origin?: VisualAnchorOrigin
  visible: boolean
  opacity: number
}

export type GroupVisualLayer = VisualLayerBase & {
  kind: 'group'
}

export type SvgVisualLayer = VisualLayerBase & {
  kind: 'svg'
  assetRef: string
  /**
   * Canonical private SVG authority for explicitly managed imports. Legacy SVG
   * layers may remain opaque and therefore omit this document.
   */
  document?: ManagedSvgDocument
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
  points?: readonly number[]
  style?: VisualVectorStyle
  // 基础多边形与圆弧特有参数
  sides?: number
  angle?: number
  innerRadiusRatio?: number
  // 直线特质与图元绑定
  startBinding?: VisualLineBinding
  endBinding?: VisualLineBinding
  routeMode?: VisualLineRouteMode
  flowAnimated?: boolean
  // 标尺图元特有参数
  scaleMode?: VisualScaleMode
  divisions?: number
  tickSpacing?: number
  subDivisions?: number
  tickLength?: number
  subTickLength?: number
  tickPlacement?: VisualScalePlacement
  showAxis?: boolean
  // 标尺数字标注参数
  showLabels?: boolean
  labelStart?: number
  labelEnd?: number
  labelFontSize?: number
  labelFontFamily?: string
  labelColor?: string
  labelDecimals?: number
  labelDirection?: VisualScaleLabelDirection
  minTickValue?: number
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
  rules?: readonly VisualRule[]
  animations: readonly VisualAnimation[]
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
  'polygon',
  'arc',
  'scale',
])
const SCALE_MODES = new Set<VisualScaleMode>(['auto', 'fixed'])
const SCALE_PLACEMENTS = new Set<VisualScalePlacement>(['left', 'right', 'both'])
const SCALE_LABEL_DIRECTIONS = new Set<VisualScaleLabelDirection>(['topDown', 'bottomUp'])
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
const LINE_CAPS = new Set<VisualLineCap>(['butt', 'round', 'square'])
const LINE_MARKERS = new Set<VisualLineMarker>(['none', 'arrow', 'circle', 'square'])
const LINE_DASHES = new Set<VisualLineDash>(['solid', 'dashed', 'dotted'])
const LINE_BINDING_ANCHORS = new Set<VisualLineBindingAnchor>(['auto', 'center', 'top', 'bottom', 'left', 'right'])
const LINE_ROUTE_MODES = new Set<VisualLineRouteMode>(['straight', 'orthogonal'])
const ANCHOR_ORIGINS = new Set<VisualAnchorOrigin>([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
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

function assertGradient(value: unknown, layerId: string) {
  if (value === undefined) return
  if (!isRecord(value) || (value.type !== 'linear' && value.type !== 'radial') || !Array.isArray(value.stops)) {
    throw new Error(`Visual Layer ${layerId} 的渐变配置无效`)
  }
  for (const stop of value.stops) {
    if (!isRecord(stop) || !isFiniteNumber(stop.offset) || stop.offset < 0 || stop.offset > 1 || typeof stop.color !== 'string') {
      throw new Error(`Visual Layer ${layerId} 的渐变色标无效`)
    }
  }
}

function assertShadow(value: unknown, layerId: string) {
  if (value === undefined) return
  if (
    !isRecord(value) ||
    typeof value.color !== 'string' ||
    !isFiniteNumber(value.blur) ||
    value.blur < 0 ||
    !isFiniteNumber(value.offsetX) ||
    !isFiniteNumber(value.offsetY)
  ) {
    throw new Error(`Visual Layer ${layerId} 的阴影/光晕配置无效`)
  }
}

function assertVectorStyle(value: unknown, layerId: string) {
  if (value === undefined) return
  if (
    !isRecord(value) ||
    typeof value.fill !== 'string' ||
    typeof value.stroke !== 'string' ||
    !isFiniteNumber(value.strokeWidth) ||
    value.strokeWidth < 0 ||
    (value.lineCap !== undefined && (typeof value.lineCap !== 'string' || !LINE_CAPS.has(value.lineCap as VisualLineCap))) ||
    (value.startMarker !== undefined && (typeof value.startMarker !== 'string' || !LINE_MARKERS.has(value.startMarker as VisualLineMarker))) ||
    (value.endMarker !== undefined && (typeof value.endMarker !== 'string' || !LINE_MARKERS.has(value.endMarker as VisualLineMarker))) ||
    (value.dash !== undefined && (typeof value.dash !== 'string' || !LINE_DASHES.has(value.dash as VisualLineDash))) ||
    (value.cornerRadius !== undefined && !isFiniteNumber(value.cornerRadius))
  ) {
    throw new Error(`Visual Layer ${layerId} 的矢量样式无效`)
  }
  assertGradient(value.gradient, layerId)
  assertShadow(value.shadow, layerId)
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
    value.lineHeight <= 0 ||
    (value.backgroundColor !== undefined && typeof value.backgroundColor !== 'string') ||
    (value.borderColor !== undefined && typeof value.borderColor !== 'string') ||
    (value.borderWidth !== undefined && (!isFiniteNumber(value.borderWidth) || value.borderWidth < 0)) ||
    (value.borderVisible !== undefined && typeof value.borderVisible !== 'boolean')
  ) {
    throw new Error(`Visual Layer ${layerId} 的文本样式无效`)
  }
  assertShadow(value.shadow, layerId)
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

  if (value.origin !== undefined && (typeof value.origin !== 'string' || !ANCHOR_ORIGINS.has(value.origin as VisualAnchorOrigin))) {
    throw new Error(`Visual Layer ${String(value.id)} 的 origin 无效`)
  }

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

  if (value.kind === 'svg' && value.document !== undefined) {
    assertManagedSvgDocument(value.document)
    if (value.assetRef !== serializeManagedSvgDataUrl(value.document)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 managed SVG assetRef 与 document 不一致`)
    }
  }

  if (value.kind === 'image' && value.document !== undefined) {
    throw new Error(`Visual Layer ${String(value.id)} 的 image 不能保存 SVG document`)
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
    if (value.points !== undefined) {
      if (
        !Array.isArray(value.points) ||
        value.points.length < 4 ||
        value.points.length % 2 !== 0 ||
        value.points.some((coord) => typeof coord !== 'number' || !Number.isFinite(coord))
      ) {
        throw new Error(`Visual Layer ${String(value.id)} 的 points 必须是偶数个有限数字数组`)
      }
    }
    if (value.sides !== undefined && (!isFiniteNumber(value.sides) || value.sides < 3 || !Number.isInteger(value.sides))) {
      throw new Error(`Visual Layer ${String(value.id)} 的 sides 必须是大于等于 3 的整数`)
    }
    if (value.angle !== undefined && (!isFiniteNumber(value.angle) || value.angle <= 0)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 angle 必须大于 0`)
    }
    if (value.innerRadiusRatio !== undefined && (!isFiniteNumber(value.innerRadiusRatio) || value.innerRadiusRatio < 0 || value.innerRadiusRatio >= 1)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 innerRadiusRatio 必须在 0 到 1 之间`)
    }
    if (value.startBinding !== undefined) {
      if (!isRecord(value.startBinding) || typeof value.startBinding.layerId !== 'string' || !LINE_BINDING_ANCHORS.has(value.startBinding.anchor as VisualLineBindingAnchor)) {
        throw new Error(`Visual Layer ${String(value.id)} 的 startBinding 无效`)
      }
    }
    if (value.endBinding !== undefined) {
      if (!isRecord(value.endBinding) || typeof value.endBinding.layerId !== 'string' || !LINE_BINDING_ANCHORS.has(value.endBinding.anchor as VisualLineBindingAnchor)) {
        throw new Error(`Visual Layer ${String(value.id)} 的 endBinding 无效`)
      }
    }
    if (value.routeMode !== undefined && (!isRecord(value) || typeof value.routeMode !== 'string' || !LINE_ROUTE_MODES.has(value.routeMode as VisualLineRouteMode))) {
      throw new Error(`Visual Layer ${String(value.id)} 的 routeMode 无效`)
    }
    if (value.flowAnimated !== undefined && typeof value.flowAnimated !== 'boolean') {
      throw new Error(`Visual Layer ${String(value.id)} 的 flowAnimated 必须是布尔值`)
    }
    if (value.scaleMode !== undefined && (!isRecord(value) || typeof value.scaleMode !== 'string' || !SCALE_MODES.has(value.scaleMode as VisualScaleMode))) {
      throw new Error(`Visual Layer ${String(value.id)} 的 scaleMode 无效`)
    }
    if (value.divisions !== undefined && (!isFiniteNumber(value.divisions) || value.divisions < 1)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 divisions 必须是大于等于 1 的数`)
    }
    if (value.tickSpacing !== undefined && (!isFiniteNumber(value.tickSpacing) || value.tickSpacing < 1)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 tickSpacing 必须是大于等于 1 的数`)
    }
    if (value.subDivisions !== undefined && (!isFiniteNumber(value.subDivisions) || value.subDivisions < 1)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 subDivisions 必须是大于等于 1 的数`)
    }
    if (value.tickLength !== undefined && (!isFiniteNumber(value.tickLength) || value.tickLength < 0)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 tickLength 必须是非负数`)
    }
    if (value.subTickLength !== undefined && (!isFiniteNumber(value.subTickLength) || value.subTickLength < 0)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 subTickLength 必须是非负数`)
    }
    if (value.tickPlacement !== undefined && (!isRecord(value) || typeof value.tickPlacement !== 'string' || !SCALE_PLACEMENTS.has(value.tickPlacement as VisualScalePlacement))) {
      throw new Error(`Visual Layer ${String(value.id)} 的 tickPlacement 无效`)
    }
    if (value.showAxis !== undefined && typeof value.showAxis !== 'boolean') {
      throw new Error(`Visual Layer ${String(value.id)} 的 showAxis 必须是布尔值`)
    }
    if (value.showLabels !== undefined && typeof value.showLabels !== 'boolean') {
      throw new Error(`Visual Layer ${String(value.id)} 的 showLabels 必须是布尔值`)
    }
    if (value.labelStart !== undefined && !isFiniteNumber(value.labelStart)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelStart 必须是有限数`)
    }
    if (value.labelEnd !== undefined && !isFiniteNumber(value.labelEnd)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelEnd 必须是有限数`)
    }
    if (value.labelFontSize !== undefined && (!isFiniteNumber(value.labelFontSize) || value.labelFontSize < 1)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelFontSize 必须是大于等于 1 的数`)
    }
    if (value.labelFontFamily !== undefined && typeof value.labelFontFamily !== 'string') {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelFontFamily 必须是字符串`)
    }
    if (value.labelColor !== undefined && typeof value.labelColor !== 'string') {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelColor 必须是字符串`)
    }
    if (value.labelDecimals !== undefined && (!isFiniteNumber(value.labelDecimals) || value.labelDecimals < 0)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelDecimals 必须是非负整数`)
    }
    if (value.labelDirection !== undefined && (!isRecord(value) || typeof value.labelDirection !== 'string' || !SCALE_LABEL_DIRECTIONS.has(value.labelDirection as VisualScaleLabelDirection))) {
      throw new Error(`Visual Layer ${String(value.id)} 的 labelDirection 无效`)
    }
    if (value.minTickValue !== undefined && (!isFiniteNumber(value.minTickValue) || value.minTickValue <= 0)) {
      throw new Error(`Visual Layer ${String(value.id)} 的 minTickValue 必须是正数`)
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
    lineCap: 'round',
    startMarker: 'none',
    endMarker: 'none',
    dash: 'solid',
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
    backgroundColor: 'transparent',
    borderColor: '#64748b',
    borderWidth: 1,
    borderVisible: false,
  }
}

export function resolveVisualAssetStyle(
  layer: SvgVisualLayer | ImageVisualLayer,
): VisualAssetStyle {
  return layer.style ? { ...layer.style } : createDefaultVisualAssetStyle()
}

export function resolveVisualVectorStyle(layer: VectorVisualLayer): VisualVectorStyle {
  const defaultStyle = createDefaultVisualVectorStyle(layer.transform)
  return layer.style
    ? {
        ...defaultStyle,
        ...layer.style,
      }
    : defaultStyle
}

export function resolveVisualTextStyle(layer: TextVisualLayer): VisualTextStyle {
  const defaultStyle = createDefaultVisualTextStyle(layer.transform)
  return layer.style
    ? {
        ...defaultStyle,
        ...layer.style,
      }
    : defaultStyle
}

/**
 * 动态计算虚线/点线 array。
 * 随着描边 (strokeWidth) 增大，自动成比例稀疏虚线间隙，
 * 并充分补偿端点 lineCap (round/square) 在两端各延伸 strokeWidth/2 造成的侵占，
 * 避免在大线宽下间隙被线帽填满而挤压粘连为实线。
 */
export function resolveVisualLineDashArray(
  dash?: VisualLineDash,
  strokeWidth: number = 1,
  lineCap: VisualLineCap = 'round',
): number[] | undefined {
  if (!dash || dash === 'solid') {
    return undefined
  }

  const effectiveWidth = Math.max(1, strokeWidth)
  const isCapExtending = lineCap === 'round' || lineCap === 'square'

  if (dash === 'dashed') {
    // 虚线段长度随线宽成比例放大，避免大线宽变成矮方块
    const dashLength = Math.max(8, effectiveWidth * 2.5)
    // 视觉空白间隙：当端点为 round 或 square 时，线帽向两侧各自延伸 strokeWidth / 2，
    // 两段虚线在线帽处累计侵占 strokeWidth，因此必须加上延伸补偿，确保物理留白绝不挤压粘连。
    const visibleGap = Math.max(6, effectiveWidth * 1.8)
    const gapLength = isCapExtending ? visibleGap + effectiveWidth : visibleGap

    return [Number(dashLength.toFixed(1)), Number(gapLength.toFixed(1))]
  }

  if (dash === 'dotted') {
    if (isCapExtending) {
      // 0.1 长度在线帽为 round 时由 Canvas 原生绘制饱满圆点
      const visibleGap = Math.max(5, effectiveWidth * 1.2)
      const gapLength = visibleGap + effectiveWidth
      return [0.1, Number(gapLength.toFixed(1))]
    }

    const dashLength = Math.max(2, effectiveWidth * 0.8)
    const gapLength = Math.max(5, effectiveWidth * 1.8)
    return [Number(dashLength.toFixed(1)), Number(gapLength.toFixed(1))]
  }

  return undefined
}

export function assertComponentVisualDefinition(
  value: unknown,
): asserts value is ComponentVisualDefinition {
  if (
    !isRecord(value) ||
    value.version !== COMPONENT_VISUAL_VERSION ||
    (value.mode !== 'native' && value.mode !== 'composite') ||
    !Array.isArray(value.layers) ||
    (value.rules !== undefined && !Array.isArray(value.rules)) ||
    !Array.isArray(value.animations)
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
  const origin = layer.origin

  if (layer.kind === 'group') return { ...layer, transform, origin }
  if (layer.kind === 'vector') {
    return {
      ...layer,
      transform,
      origin,
      style: layer.style
        ? {
            ...layer.style,
            gradient: layer.style.gradient
              ? {
                  ...layer.style.gradient,
                  stops: layer.style.gradient.stops.map((s) => ({ ...s })),
                }
              : undefined,
            shadow: layer.style.shadow ? { ...layer.style.shadow } : undefined,
          }
        : undefined,
      points: layer.points ? [...layer.points] : undefined,
      startBinding: layer.startBinding ? { ...layer.startBinding } : undefined,
      endBinding: layer.endBinding ? { ...layer.endBinding } : undefined,
    }
  }
  if (layer.kind === 'text') {
    return {
      ...layer,
      transform,
      origin,
      style: layer.style
        ? {
            ...layer.style,
            shadow: layer.style.shadow ? { ...layer.style.shadow } : undefined,
          }
        : undefined,
    }
  }
  if (layer.kind === 'svg') {
    return {
      ...layer,
      transform,
      origin,
      document: layer.document ? cloneManagedSvgDocument(layer.document) : undefined,
      style: layer.style ? { ...layer.style } : undefined,
    }
  }
  return {
    ...layer,
    transform,
    origin,
    style: layer.style ? { ...layer.style } : undefined,
  }
}

function cloneAnimation(animation: VisualAnimation): VisualAnimation {
  return {
    ...animation,
    timing: { ...animation.timing },
    activation: { ...animation.activation },
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
    rules: [],
    animations: [],
  }
}

export function createNativeVisual(): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'native',
    designSize: cloneDesignSize(),
    layers: [],
    rules: [],
    animations: [],
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
    rules: visual.rules?.map((rule) => ({ ...rule })) ?? [],
    animations: visual.animations.map(cloneAnimation),
  }
}
