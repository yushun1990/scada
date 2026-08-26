import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
  type ComponentScalarValue,
} from './definition'
import type { ComponentVisualDefinition } from './visual'
import type { VisualRuleOperator } from './visualRules'

export type VisualAnimationDirection =
  | 'normal'
  | 'reverse'
  | 'alternate'
  | 'alternate-reverse'

export type VisualAnimationEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'

export type VisualAnimationTiming = {
  durationMs: number
  delayMs: number
  iterations: number | 'infinite'
  direction: VisualAnimationDirection
  easing: VisualAnimationEasing
}

export type VisualAnimationActivation =
  | { kind: 'always' }
  | {
      kind: 'property'
      propertyKey: string
      operator: VisualRuleOperator
      compareValue: ComponentScalarValue
    }

export type SpinVisualAnimation = {
  id: string
  kind: 'spin'
  enabled: boolean
  layerId: string
  degreesPerIteration: number
  timing: VisualAnimationTiming
  activation: VisualAnimationActivation
}

export type MoveVisualAnimation = {
  id: string
  kind: 'move'
  enabled: boolean
  layerId: string
  deltaXPerIteration: number
  deltaYPerIteration: number
  timing: VisualAnimationTiming
  activation: VisualAnimationActivation
}

export type ScaleVisualAnimation = {
  id: string
  kind: 'scale'
  enabled: boolean
  layerId: string
  scaleXMultiplier: number
  scaleYMultiplier: number
  timing: VisualAnimationTiming
  activation: VisualAnimationActivation
}

export type FadeVisualAnimation = {
  id: string
  kind: 'fade'
  enabled: boolean
  layerId: string
  opacityMultiplier: number
  timing: VisualAnimationTiming
  activation: VisualAnimationActivation
}

export type VisualAnimation =
  | SpinVisualAnimation
  | MoveVisualAnimation
  | ScaleVisualAnimation
  | FadeVisualAnimation

export type VisualAnimationLayerOverlay = {
  rotationDelta?: number
  translateX?: number
  translateY?: number
  scaleXMultiplier?: number
  scaleYMultiplier?: number
  opacityMultiplier?: number
}

export type VisualAnimationOverlay = Record<string, VisualAnimationLayerOverlay>

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

const DIRECTIONS = new Set<VisualAnimationDirection>([
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
])

const EASINGS = new Set<VisualAnimationEasing>([
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function assertTiming(value: unknown, animationId: string): asserts value is VisualAnimationTiming {
  if (!isRecord(value)) {
    throw new Error(`Visual Animation ${animationId} 缺少 timing`)
  }

  if (!isFiniteNumber(value.durationMs) || value.durationMs <= 0) {
    throw new Error(`Visual Animation ${animationId} durationMs 必须大于 0`)
  }

  if (!isFiniteNumber(value.delayMs) || value.delayMs < 0) {
    throw new Error(`Visual Animation ${animationId} delayMs 必须大于等于 0`)
  }

  if (
    value.iterations !== 'infinite' &&
    (
      typeof value.iterations !== 'number' ||
      !Number.isInteger(value.iterations) ||
      value.iterations <= 0
    )
  ) {
    throw new Error(`Visual Animation ${animationId} iterations 必须是正整数或 infinite`)
  }

  if (typeof value.direction !== 'string' || !DIRECTIONS.has(value.direction as VisualAnimationDirection)) {
    throw new Error(`Visual Animation ${animationId} direction 无效`)
  }

  if (typeof value.easing !== 'string' || !EASINGS.has(value.easing as VisualAnimationEasing)) {
    throw new Error(`Visual Animation ${animationId} easing 无效`)
  }
}

function assertActivation(
  value: unknown,
  animationId: string,
  definition: ComponentDefinition,
): asserts value is VisualAnimationActivation {
  if (!isRecord(value) || (value.kind !== 'always' && value.kind !== 'property')) {
    throw new Error(`Visual Animation ${animationId} activation 无效`)
  }

  if (value.kind === 'always') return

  if (typeof value.propertyKey !== 'string' || !value.propertyKey.trim()) {
    throw new Error(`Visual Animation ${animationId} propertyKey 无效`)
  }

  const property = definition.properties[value.propertyKey]
  if (!property) {
    throw new Error(`Visual Animation ${animationId} 引用了不存在的 Property：${value.propertyKey}`)
  }

  if (typeof value.operator !== 'string' || !RULE_OPERATORS.has(value.operator as VisualRuleOperator)) {
    throw new Error(`Visual Animation ${animationId} operator 无效`)
  }

  if (!isComponentPropertyValue(property, value.compareValue)) {
    throw new Error(`Visual Animation ${animationId} 比较值与 Property 类型不匹配`)
  }

  if (NUMERIC_OPERATORS.has(value.operator as VisualRuleOperator) && property.kind !== 'number') {
    throw new Error(`Visual Animation ${animationId} 的大小比较只支持 number Property`)
  }
}

export function assertComponentVisualAnimations(
  definition: ComponentDefinition,
  visual: ComponentVisualDefinition,
) {
  if (!Array.isArray(visual.animations)) {
    throw new Error('Component visual animations 必须是数组')
  }

  const layerIds = new Set(visual.layers.map((layer) => layer.id))
  const animationIds = new Set<string>()

  for (const [index, candidate] of visual.animations.entries()) {
    if (!isRecord(candidate)) {
      throw new Error(`第 ${index + 1} 条 Visual Animation 无效`)
    }

    const animationId = candidate.id
    if (typeof animationId !== 'string' || !animationId.trim()) {
      throw new Error(`第 ${index + 1} 条 Visual Animation 缺少 ID`)
    }

    if (animationIds.has(animationId)) {
      throw new Error(`Visual Animation ID 重复：${animationId}`)
    }
    animationIds.add(animationId)

    if (
      candidate.kind !== 'spin' &&
      candidate.kind !== 'move' &&
      candidate.kind !== 'scale' &&
      candidate.kind !== 'fade'
    ) {
      throw new Error(`Visual Animation ${animationId} kind 无效`)
    }

    if (typeof candidate.enabled !== 'boolean') {
      throw new Error(`Visual Animation ${animationId} enabled 无效`)
    }

    if (typeof candidate.layerId !== 'string' || !layerIds.has(candidate.layerId)) {
      throw new Error(`Visual Animation ${animationId} 引用了不存在的 Layer：${String(candidate.layerId)}`)
    }

    if (candidate.kind === 'spin') {
      if (!isFiniteNumber(candidate.degreesPerIteration)) {
        throw new Error(`Visual Animation ${animationId} degreesPerIteration 必须是有限数字`)
      }
    } else if (candidate.kind === 'move') {
      if (!isFiniteNumber(candidate.deltaXPerIteration)) {
        throw new Error(`Visual Animation ${animationId} deltaXPerIteration 必须是有限数字`)
      }
      if (!isFiniteNumber(candidate.deltaYPerIteration)) {
        throw new Error(`Visual Animation ${animationId} deltaYPerIteration 必须是有限数字`)
      }
    } else if (candidate.kind === 'scale') {
      if (!isFiniteNumber(candidate.scaleXMultiplier) || candidate.scaleXMultiplier <= 0) {
        throw new Error(`Visual Animation ${animationId} scaleXMultiplier 必须是大于 0 的有限数字`)
      }
      if (!isFiniteNumber(candidate.scaleYMultiplier) || candidate.scaleYMultiplier <= 0) {
        throw new Error(`Visual Animation ${animationId} scaleYMultiplier 必须是大于 0 的有限数字`)
      }
    } else {
      if (
        !isFiniteNumber(candidate.opacityMultiplier) ||
        candidate.opacityMultiplier < 0 ||
        candidate.opacityMultiplier > 1
      ) {
        throw new Error(`Visual Animation ${animationId} opacityMultiplier 必须在 0 到 1 之间`)
      }
    }

    assertTiming(candidate.timing, animationId)
    assertActivation(candidate.activation, animationId, definition)
  }
}

function matchesPropertyActivation(
  activation: Extract<VisualAnimationActivation, { kind: 'property' }>,
  values: ComponentProps,
) {
  const actual = values[activation.propertyKey]
  const expected = activation.compareValue

  if (activation.operator === 'equals') return actual === expected
  if (activation.operator === 'notEquals') return actual !== expected

  if (typeof actual !== 'number' || typeof expected !== 'number') return false
  if (activation.operator === 'greaterThan') return actual > expected
  if (activation.operator === 'greaterOrEqual') return actual >= expected
  if (activation.operator === 'lessThan') return actual < expected
  return actual <= expected
}

function isAnimationActive(animation: VisualAnimation, values: ComponentProps) {
  if (!animation.enabled) return false
  if (animation.activation.kind === 'always') return true
  return matchesPropertyActivation(animation.activation, values)
}

function applyDirection(
  progress: number,
  iteration: number,
  direction: VisualAnimationDirection,
) {
  const oddIteration = iteration % 2 === 1
  const reversed =
    direction === 'reverse' ||
    (direction === 'alternate' && oddIteration) ||
    (direction === 'alternate-reverse' && !oddIteration)

  return reversed ? 1 - progress : progress
}

function applyEasing(progress: number, easing: VisualAnimationEasing) {
  if (easing === 'linear') return progress
  if (easing === 'ease-in') return progress * progress
  if (easing === 'ease-out') return 1 - (1 - progress) * (1 - progress)

  return progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2
}

export function evaluateVisualAnimationProgress(
  timing: VisualAnimationTiming,
  timeMs: number,
): number | null {
  if (!Number.isFinite(timeMs)) return null

  const elapsed = timeMs - timing.delayMs
  if (elapsed < 0) return null

  if (
    timing.iterations !== 'infinite' &&
    elapsed >= timing.durationMs * timing.iterations
  ) {
    return null
  }

  const iteration = Math.floor(elapsed / timing.durationMs)
  const localProgress = (elapsed - iteration * timing.durationMs) / timing.durationMs
  const directedProgress = applyDirection(localProgress, iteration, timing.direction)

  return applyEasing(directedProgress, timing.easing)
}

function interpolateMultiplier(target: number, progress: number) {
  return 1 + (target - 1) * progress
}

export function evaluateVisualAnimations(
  visual: ComponentVisualDefinition,
  values: ComponentProps,
  timeMs: number,
): VisualAnimationOverlay {
  const overlay: VisualAnimationOverlay = {}

  for (const animation of visual.animations) {
    if (!isAnimationActive(animation, values)) continue

    const progress = evaluateVisualAnimationProgress(animation.timing, timeMs)
    if (progress === null) continue

    const current = overlay[animation.layerId] ?? {}

    if (animation.kind === 'spin') {
      overlay[animation.layerId] = {
        ...current,
        rotationDelta:
          (current.rotationDelta ?? 0) + animation.degreesPerIteration * progress,
      }
    } else if (animation.kind === 'move') {
      overlay[animation.layerId] = {
        ...current,
        translateX:
          (current.translateX ?? 0) + animation.deltaXPerIteration * progress,
        translateY:
          (current.translateY ?? 0) + animation.deltaYPerIteration * progress,
      }
    } else if (animation.kind === 'scale') {
      overlay[animation.layerId] = {
        ...current,
        scaleXMultiplier:
          (current.scaleXMultiplier ?? 1) *
          interpolateMultiplier(animation.scaleXMultiplier, progress),
        scaleYMultiplier:
          (current.scaleYMultiplier ?? 1) *
          interpolateMultiplier(animation.scaleYMultiplier, progress),
      }
    } else {
      overlay[animation.layerId] = {
        ...current,
        opacityMultiplier:
          (current.opacityMultiplier ?? 1) *
          interpolateMultiplier(animation.opacityMultiplier, progress),
      }
    }
  }

  return overlay
}

export function applyVisualAnimationOverlay(
  visual: ComponentVisualDefinition,
  overlay: VisualAnimationOverlay,
): ComponentVisualDefinition {
  if (Object.keys(overlay).length === 0) return visual

  return {
    ...visual,
    layers: visual.layers.map((layer) => {
      const layerOverlay = overlay[layer.id]
      if (!layerOverlay) return layer

      return {
        ...layer,
        opacity: layer.opacity * (layerOverlay.opacityMultiplier ?? 1),
        transform: {
          ...layer.transform,
          x: layer.transform.x + (layerOverlay.translateX ?? 0),
          y: layer.transform.y + (layerOverlay.translateY ?? 0),
          rotation: layer.transform.rotation + (layerOverlay.rotationDelta ?? 0),
          scaleX: layer.transform.scaleX * (layerOverlay.scaleXMultiplier ?? 1),
          scaleY: layer.transform.scaleY * (layerOverlay.scaleYMultiplier ?? 1),
        },
      }
    }),
  }
}
