import assert from 'node:assert/strict'
import {
  applyVisualAnimationOverlay,
  assertComponentVisualAnimations,
  evaluateVisualAnimationProgress,
  evaluateVisualAnimations,
} from '../src/component-system/animations'
import { normalizeStoredComponentVisual } from '../src/component-system/visualMigration'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'

const linearTiming = {
  durationMs: 1000,
  delayMs: 100,
  iterations: 2,
  direction: 'normal',
  easing: 'linear',
} as const

assert.equal(evaluateVisualAnimationProgress(linearTiming, 99), null)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 100), 0)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 600), 0.5)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 1100), 0)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 2100), null)

assert.equal(
  evaluateVisualAnimationProgress(
    { ...linearTiming, delayMs: 0, iterations: 'infinite', direction: 'reverse' },
    250,
  ),
  0.75,
)
assert.equal(
  evaluateVisualAnimationProgress(
    { ...linearTiming, delayMs: 0, iterations: 'infinite', direction: 'alternate' },
    1250,
  ),
  0.75,
)
assert.equal(
  evaluateVisualAnimationProgress(
    { ...linearTiming, delayMs: 0, iterations: 'infinite', easing: 'ease-in' },
    250,
  ),
  0.0625,
)

const migratedV1 = normalizeStoredComponentVisual(
  {
    version: 1,
    mode: 'composite',
    layers: [],
    rules: [],
  },
  { width: 96, height: 72 },
)
assert.deepEqual(migratedV1, {
  version: 3,
  mode: 'composite',
  designSize: { width: 96, height: 72 },
  layers: [],
  rules: [],
  animations: [],
})

const migratedV2 = normalizeStoredComponentVisual(
  {
    version: 2,
    mode: 'composite',
    designSize: { width: 480, height: 360 },
    layers: [],
    rules: [],
  },
  { width: 96, height: 72 },
)
assert.deepEqual(migratedV2, {
  version: 3,
  mode: 'composite',
  designSize: { width: 480, height: 360 },
  layers: [],
  rules: [],
  animations: [],
})

const definition = {
  type: 'test.animation',
  title: 'Animation Test',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 10,
    minHeight: 10,
  },
  properties: {
    running: {
      title: 'Running',
      kind: 'boolean',
      defaultValue: false,
    },
  },
  actions: {},
  events: {},
  anchors: [],
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'wheel',
      name: 'Wheel',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 10,
        y: 20,
        width: 40,
        height: 40,
        rotation: 20,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'circle',
    },
  ],
  rules: [],
  animations: [
    {
      id: 'wheel-spin',
      kind: 'spin',
      enabled: true,
      layerId: 'wheel',
      degreesPerIteration: 360,
      timing: {
        durationMs: 1000,
        delayMs: 0,
        iterations: 'infinite',
        direction: 'normal',
        easing: 'linear',
      },
      activation: {
        kind: 'property',
        propertyKey: 'running',
        operator: 'equals',
        compareValue: true,
      },
    },
  ],
} as const

assert.doesNotThrow(() => assertComponentVisualAnimations(definition, visual))
assert.deepEqual(evaluateVisualAnimations(visual, { running: false }, 500), {})

const overlay = evaluateVisualAnimations(visual, { running: true }, 500)
assert.equal(overlay.wheel?.rotationDelta, 180)

const rendered = applyVisualAnimationOverlay(visual, overlay)
assert.equal(rendered.layers[0]?.transform.rotation, 200)
assert.equal(visual.layers[0]?.transform.rotation, 20, 'base visual must remain immutable')

const ruleVisual = {
  ...visual,
  rules: [
    {
      id: 'running-base-rotation',
      enabled: true,
      propertyKey: 'running',
      operator: 'equals',
      compareValue: true,
      layerId: 'wheel',
      target: 'transform.rotation',
      value: 40,
    },
  ],
} as const
const ruleResolved = resolveComponentVisualRules(ruleVisual, { running: true })
assert.equal(ruleResolved.layers[0]?.transform.rotation, 40)
const ruleOverlay = evaluateVisualAnimations(ruleResolved, { running: true }, 500)
const ruleAnimated = applyVisualAnimationOverlay(ruleResolved, ruleOverlay)
assert.equal(
  ruleAnimated.layers[0]?.transform.rotation,
  220,
  'animation rotation must add after Visual Rules resolve the base rotation',
)
assert.equal(ruleResolved.layers[0]?.transform.rotation, 40, 'animation must not mutate rule-resolved base')

const secondSpin = {
  ...visual.animations[0],
  id: 'wheel-spin-2',
  degreesPerIteration: 180,
  activation: { kind: 'always' },
} as const
const composedOverlay = evaluateVisualAnimations(
  { ...visual, animations: [visual.animations[0], secondSpin] },
  { running: true },
  500,
)
assert.equal(composedOverlay.wheel?.rotationDelta, 270)

const moveAnimation = {
  id: 'wheel-move',
  kind: 'move',
  enabled: true,
  layerId: 'wheel',
  deltaXPerIteration: 60,
  deltaYPerIteration: -20,
  timing: {
    durationMs: 1000,
    delayMs: 0,
    iterations: 'infinite',
    direction: 'normal',
    easing: 'linear',
  },
  activation: { kind: 'always' },
} as const
const moveVisual = { ...visual, animations: [moveAnimation] } as const
assert.doesNotThrow(() => assertComponentVisualAnimations(definition, moveVisual))
const moveOverlay = evaluateVisualAnimations(moveVisual, { running: false }, 500)
assert.equal(moveOverlay.wheel?.translateX, 30)
assert.equal(moveOverlay.wheel?.translateY, -10)
const moved = applyVisualAnimationOverlay(moveVisual, moveOverlay)
assert.equal(moved.layers[0]?.transform.x, 40)
assert.equal(moved.layers[0]?.transform.y, 10)
assert.equal(visual.layers[0]?.transform.x, 10, 'move must not mutate base x')
assert.equal(visual.layers[0]?.transform.y, 20, 'move must not mutate base y')

const secondMove = {
  ...moveAnimation,
  id: 'wheel-move-2',
  deltaXPerIteration: -20,
  deltaYPerIteration: 40,
} as const
const composedMoveOverlay = evaluateVisualAnimations(
  { ...visual, animations: [moveAnimation, secondMove] },
  {},
  500,
)
assert.equal(composedMoveOverlay.wheel?.translateX, 20)
assert.equal(composedMoveOverlay.wheel?.translateY, 10)

const moveRuleVisual = {
  ...visual,
  rules: [
    {
      id: 'running-base-x',
      enabled: true,
      propertyKey: 'running',
      operator: 'equals',
      compareValue: true,
      layerId: 'wheel',
      target: 'transform.x',
      value: 100,
    },
    {
      id: 'running-base-y',
      enabled: true,
      propertyKey: 'running',
      operator: 'equals',
      compareValue: true,
      layerId: 'wheel',
      target: 'transform.y',
      value: 200,
    },
  ],
  animations: [moveAnimation],
} as const
const moveRuleResolved = resolveComponentVisualRules(moveRuleVisual, { running: true })
const moveRuleOverlay = evaluateVisualAnimations(moveRuleResolved, { running: true }, 500)
const moveRuleAnimated = applyVisualAnimationOverlay(moveRuleResolved, moveRuleOverlay)
assert.equal(moveRuleAnimated.layers[0]?.transform.x, 130)
assert.equal(moveRuleAnimated.layers[0]?.transform.y, 190)
assert.equal(
  moveRuleResolved.layers[0]?.transform.x,
  100,
  'move overlay must apply after Visual Rules and keep the rule-resolved base immutable',
)

const badLayer = structuredClone(visual)
badLayer.animations[0].layerId = 'missing'
assert.throws(
  () => assertComponentVisualAnimations(definition, badLayer),
  /不存在的 Layer/,
)

const badDuration = structuredClone(visual)
badDuration.animations[0].timing.durationMs = 0
assert.throws(
  () => assertComponentVisualAnimations(definition, badDuration),
  /durationMs/,
)

const badProperty = structuredClone(visual)
badProperty.animations[0].activation = {
  kind: 'property',
  propertyKey: 'missing',
  operator: 'equals',
  compareValue: true,
}
assert.throws(
  () => assertComponentVisualAnimations(definition, badProperty),
  /不存在的 Property/,
)

const badMove = structuredClone(moveVisual)
badMove.animations[0].deltaXPerIteration = Number.POSITIVE_INFINITY
assert.throws(
  () => assertComponentVisualAnimations(definition, badMove),
  /deltaXPerIteration/,
)

console.log('Animation model checks passed: migration, timing, spin/move overlays, rule ordering, composition and validation are deterministic.')
