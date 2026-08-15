import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
  type ComponentScalarValue,
} from './definition'
import {
  cloneComponentVisual,
  resolveVisualAssetStyle,
  resolveVisualTextStyle,
  resolveVisualVectorStyle,
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type VisualAssetFit,
  type VisualTextAlign,
  type VisualTextFontStyle,
  type VisualTextVerticalAlign,
} from './visual'

export type VisualRuleOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterOrEqual'
  | 'lessThan'
  | 'lessOrEqual'

export type VisualRuleTargetField =
  | 'visible'
  | 'opacity'
  | 'transform.x'
  | 'transform.y'
  | 'transform.width'
  | 'transform.height'
  | 'transform.rotation'
  | 'transform.scaleX'
  | 'transform.scaleY'
  | 'style.fill'
  | 'style.stroke'
  | 'style.strokeWidth'
  | 'style.fontFamily'
  | 'style.fontSize'
  | 'style.fontStyle'
  | 'style.align'
  | 'style.verticalAlign'
  | 'style.lineHeight'
  | 'style.fit'

export type VisualRule = {
  id: string
  enabled: boolean
  propertyKey: string
  operator: VisualRuleOperator
  compareValue: ComponentScalarValue
  layerId: string
  target: VisualRuleTargetField
  value: ComponentScalarValue
}

const RULE_OPERATORS = new Set<VisualRuleOperator>([
  'equals',
  'notEquals',
  'greaterThan',
  'greaterOrEqual',
  'lessThan',
  'lessOrEqual',
])

const NUMERIC_OPERATORS = new Set<VisualRuleOperator>([
  'greaterThan',
  'greaterOrEqual',
  'lessThan',
  'lessOrEqual',
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

function isScalar(value: unknown): value is ComponentScalarValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function targetAcceptsValue(
  layer: ComponentVisualLayer,
  target: VisualRuleTargetField,
  value: ComponentScalarValue,
) {
  if (target === 'visible') return typeof value === 'boolean'
  if (target === 'opacity') {
    return typeof value === 'number' && value >= 0 && value <= 1
  }

  if (target.startsWith('transform.')) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    if (target === 'transform.width' || target === 'transform.height') return value > 0
    if (target === 'transform.scaleX' || target === 'transform.scaleY') return value !== 0
    return true
  }

  if (layer.kind === 'vector') {
    if (target === 'style.fill' || target === 'style.stroke') return typeof value === 'string'
    if (target === 'style.strokeWidth') return typeof value === 'number' && value >= 0
  }

  if (layer.kind === 'text') {
    if (target === 'style.fill' || target === 'style.fontFamily') return typeof value === 'string'
    if (target === 'style.fontSize' || target === 'style.lineHeight') {
      return typeof value === 'number' && value > 0
    }
    if (target === 'style.fontStyle') {
      return typeof value === 'string' && TEXT_FONT_STYLES.has(value as VisualTextFontStyle)
    }
    if (target === 'style.align') {
      return typeof value === 'string' && TEXT_ALIGNS.has(value as VisualTextAlign)
    }
    if (target === 'style.verticalAlign') {
      return typeof value === 'string' && TEXT_VERTICAL_ALIGNS.has(value as VisualTextVerticalAlign)
    }
  }

  if ((layer.kind === 'svg' || layer.kind === 'image') && target === 'style.fit') {
    return typeof value === 'string' && ASSET_FITS.has(value as VisualAssetFit)
  }

  return false
}

export function visualRuleTargetsForLayer(layer: ComponentVisualLayer): VisualRuleTargetField[] {
  const common: VisualRuleTargetField[] = [
    'visible',
    'opacity',
    'transform.x',
    'transform.y',
    'transform.width',
    'transform.height',
    'transform.rotation',
    'transform.scaleX',
    'transform.scaleY',
  ]

  if (layer.kind === 'vector') {
    return [...common, 'style.fill', 'style.stroke', 'style.strokeWidth']
  }
  if (layer.kind === 'text') {
    return [
      ...common,
      'style.fill',
      'style.fontFamily',
      'style.fontSize',
      'style.fontStyle',
      'style.align',
      'style.verticalAlign',
      'style.lineHeight',
    ]
  }
  if (layer.kind === 'svg' || layer.kind === 'image') {
    return [...common, 'style.fit']
  }
  return common
}

export function assertComponentVisualRules(
  definition: ComponentDefinition,
  visual: ComponentVisualDefinition,
) {
  if (visual.rules === undefined) return
  if (!Array.isArray(visual.rules)) {
    throw new Error('Component visual rules 必须是数组')
  }

  const layerMap = new Map(visual.layers.map((layer) => [layer.id, layer]))
  const ids = new Set<string>()

  for (const [index, value] of visual.rules.entries()) {
    if (!isRecord(value)) {
      throw new Error(`第 ${index + 1} 条 Visual Rule 无效`)
    }

    const rule = value as unknown as VisualRule
    if (typeof rule.id !== 'string' || !rule.id.trim()) {
      throw new Error(`第 ${index + 1} 条 Visual Rule 缺少 ID`)
    }
    if (ids.has(rule.id)) {
      throw new Error(`Visual Rule ID 重复：${rule.id}`)
    }
    ids.add(rule.id)

    if (typeof rule.enabled !== 'boolean') {
      throw new Error(`Visual Rule ${rule.id} enabled 无效`)
    }
    if (typeof rule.propertyKey !== 'string' || !rule.propertyKey.trim()) {
      throw new Error(`Visual Rule ${rule.id} propertyKey 无效`)
    }

    const property = definition.properties[rule.propertyKey]
    if (!property) {
      throw new Error(`Visual Rule ${rule.id} 引用了不存在的 Property：${rule.propertyKey}`)
    }

    if (typeof rule.operator !== 'string' || !RULE_OPERATORS.has(rule.operator)) {
      throw new Error(`Visual Rule ${rule.id} operator 无效`)
    }
    if (!isScalar(rule.compareValue) || !isComponentPropertyValue(property, rule.compareValue)) {
      throw new Error(`Visual Rule ${rule.id} 比较值与 Property 类型不匹配`)
    }
    if (NUMERIC_OPERATORS.has(rule.operator) && property.kind !== 'number') {
      throw new Error(`Visual Rule ${rule.id} 的大小比较只支持 number Property`)
    }

    if (typeof rule.layerId !== 'string' || !rule.layerId.trim()) {
      throw new Error(`Visual Rule ${rule.id} layerId 无效`)
    }
    const layer = layerMap.get(rule.layerId)
    if (!layer) {
      throw new Error(`Visual Rule ${rule.id} 引用了不存在的 Layer：${rule.layerId}`)
    }

    if (typeof rule.target !== 'string' || !visualRuleTargetsForLayer(layer).includes(rule.target)) {
      throw new Error(`Visual Rule ${rule.id} target 与 Layer 类型不匹配`)
    }
    if (!isScalar(rule.value) || !targetAcceptsValue(layer, rule.target, rule.value)) {
      throw new Error(`Visual Rule ${rule.id} target value 无效`)
    }
  }
}

function matchesRule(rule: VisualRule, values: ComponentProps) {
  const actual = values[rule.propertyKey]
  const expected = rule.compareValue

  if (rule.operator === 'equals') return actual === expected
  if (rule.operator === 'notEquals') return actual !== expected

  if (typeof actual !== 'number' || typeof expected !== 'number') return false
  if (rule.operator === 'greaterThan') return actual > expected
  if (rule.operator === 'greaterOrEqual') return actual >= expected
  if (rule.operator === 'lessThan') return actual < expected
  return actual <= expected
}

function applyRuleTarget(
  layer: ComponentVisualLayer,
  target: VisualRuleTargetField,
  value: ComponentScalarValue,
): ComponentVisualLayer {
  if (!targetAcceptsValue(layer, target, value)) return layer

  if (target === 'visible') return { ...layer, visible: value as boolean }
  if (target === 'opacity') return { ...layer, opacity: value as number }

  if (target.startsWith('transform.')) {
    const field = target.slice('transform.'.length) as keyof ComponentVisualLayer['transform']
    return {
      ...layer,
      transform: { ...layer.transform, [field]: value as number },
    } as ComponentVisualLayer
  }

  if (layer.kind === 'vector') {
    const style = resolveVisualVectorStyle(layer)
    const field = target.slice('style.'.length) as keyof typeof style
    return { ...layer, style: { ...style, [field]: value } }
  }

  if (layer.kind === 'text') {
    const style = resolveVisualTextStyle(layer)
    const field = target.slice('style.'.length) as keyof typeof style
    return { ...layer, style: { ...style, [field]: value } }
  }

  if (layer.kind === 'svg' || layer.kind === 'image') {
    const style = resolveVisualAssetStyle(layer)
    return { ...layer, style: { ...style, fit: value as VisualAssetFit } }
  }

  return layer
}

export function resolveComponentVisualRules(
  visual: ComponentVisualDefinition,
  values: ComponentProps,
): ComponentVisualDefinition {
  const rules = visual.rules ?? []
  if (rules.length === 0) return visual

  const resolved = cloneComponentVisual(visual)
  const layerIndex = new Map(resolved.layers.map((layer, index) => [layer.id, index]))
  const layers = [...resolved.layers]

  for (const rule of rules) {
    if (!rule.enabled || !matchesRule(rule, values)) continue
    const index = layerIndex.get(rule.layerId)
    if (index === undefined) continue
    layers[index] = applyRuleTarget(layers[index], rule.target, rule.value)
  }

  return { ...resolved, layers }
}
