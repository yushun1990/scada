import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
  type ComponentScalarValue,
} from './definition'
import type { ComponentVisualDefinition } from './visual'
import {
  applyVisualRuntimeOverlay,
  composeVisualRuntimeContribution,
  evaluateVisualRuntimeContributionTrack,
  type VisualRuntimeContributionTrack,
  type VisualRuntimeLayerOverlay,
  type VisualRuntimeOverlay,
} from './visualRuntime'
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

export type BlinkVisualAnimation = {
  id: string
  kind: 'blink'
  enabled: boolean
  layerId: string
  timing: VisualAnimationTiming
  activation: VisualAnimationActivation
}

export type VisualAnimation =
  | SpinVisualAnimation
  | MoveVisualAnimation
  | ScaleVisualAnimation
  | FadeVisualAnimation
  | BlinkVisualAnimation

export type CompiledVisualAnimation = {
  id: string
  enabled: boolean
  layerId: string
  timing: VisualAnimationTiming
  activation: VisualAnimationActivation
  tracks: readonly VisualRuntimeContributionTrack[]
}

export type VisualAnimationLayerOverlay = VisualRuntimeLayerOverlay
export type VisualAnimationOverlay = VisualRuntimeOverlay

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
      candidate.kind !== 'fade' &&
      candidate.kind !== 'blink'
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
    } else if (candidate.kind === 'fade') {
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

export function compileVisualAnimation(animation: VisualAnimation): CompiledVisualAnimation {
  let tracks: readonly VisualRuntimeContributionTrack[]

  if (animation.kind === 'spin') {
    tracks = [
      {
        target: 'transform.rotation',
        sampling: 'continuous',
        to: animation.degreesPerIteration,
      },
    ]
  } else if (animation.kind === 'move') {
    tracks = [
      {
        target: 'transform.x',
        sampling: 'continuous',
        to: animation.deltaXPerIteration,
      },
      {
        target: 'transform.y',
        sampling: 'continuous',
        to: animation.deltaYPerIteration,
      },
    ]
  } else if (animation.kind === 'scale') {
    tracks = [
      {
        target: 'transform.scaleX',
        sampling: 'continuous',
        to: animation.scaleXMultiplier,
      },
      {
        target: 'transform.scaleY',
        sampling: 'continuous',
        to: animation.scaleYMultiplier,
      },
    ]
  } else if (animation.kind === 'fade') {
    tracks = [
      {
        target: 'opacity',
        sampling: 'continuous',
        to: animation.opacityMultiplier,
      },
    ]
  } else {
    tracks = [
      {
        target: 'visible',
        sampling: 'step',
        threshold: 0.5,
        before: true,
        after: false,
      },
    ]
  }

  return {
    id: animation.id,
    enabled: animation.enabled,
    layerId: animation.layerId,
    timing: animation.timing,
    activation: animation.activation,
    tracks,
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

function isProgramActive(program: CompiledVisualAnimation, values: ComponentProps) {
  if (!program.enabled) return false
  if (program.activation.kind === 'always') return true
  return matchesPropertyActivation(program.activation, values)
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

export function evaluateVisualAnimationPhase(
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

  return applyDirection(localProgress, iteration, timing.direction)
}

export function evaluateVisualAnimationProgress(
  timing: VisualAnimationTiming,
  timeMs: number,
): number | null {
  const phase = evaluateVisualAnimationPhase(timing, timeMs)
  return phase === null ? null : applyEasing(phase, timing.easing)
}

export function evaluateVisualAnimations(
  visual: ComponentVisualDefinition,
  values: ComponentProps,
  timeMs: number,
): VisualAnimationOverlay {
  const overlay: VisualAnimationOverlay = {}

  for (const animation of visual.animations) {
    const program = compileVisualAnimation(animation)
    if (!isProgramActive(program, values)) continue

    const phase = evaluateVisualAnimationPhase(program.timing, timeMs)
    if (phase === null) continue
    const easedProgress = applyEasing(phase, program.timing.easing)

    for (const track of program.tracks) {
      composeVisualRuntimeContribution(
        overlay,
        program.layerId,
        track.target,
        evaluateVisualRuntimeContributionTrack(track, phase, easedProgress),
      )
    }
  }

  return overlay
}

export function applyVisualAnimationOverlay(
  visual: ComponentVisualDefinition,
  overlay: VisualAnimationOverlay,
): ComponentVisualDefinition {
  return applyVisualRuntimeOverlay(visual, overlay)
}
